import { isValidRsn, normalizeRsn, readSavedPlayer } from './profile.ts';
import type { PlayerProfile, SavedPlayer } from './profile.ts';
import { PlayerLookupError } from './playerTransport.ts';
import type { PlayerLookup } from './playerTransport.ts';

interface PlayerSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error';
  profile: PlayerProfile | null;
  enabled: boolean;
  saved: boolean;
  pendingUsername: string | null;
  message: string;
}

export function createPlayerData(
  transport: { load: (username: string, signal: AbortSignal) => Promise<PlayerLookup> },
  options: { saved?: unknown; persist?: (value: SavedPlayer | null) => void; now?: () => number } = {},
) {
  const initial = readSavedPlayer(options.saved);
  const now = options.now ?? Date.now;
  let snapshot: PlayerSnapshot = {
    status: initial ? 'ready' : 'idle', profile: initial?.profile ?? null,
    enabled: initial?.enabled ?? false, saved: !!initial, pendingUsername: null, message: '',
  };
  let active = false;
  let request: AbortController | undefined;
  let retryAt = 0;
  const updatedPlayers = new Map<string, number>();
  if (initial) updatedPlayers.set(initial.profile.username, Math.min(now(), initial.profile.fetchedAt));
  const listeners = new Set<() => void>();

  function publish(update: Partial<PlayerSnapshot>) {
    snapshot = { ...snapshot, ...update };
    listeners.forEach(listener => listener());
  }

  function persist() {
    try {
      options.persist?.(snapshot.profile ? { version: 1, profile: snapshot.profile, enabled: snapshot.enabled } : null);
    } catch {
      // Storage restrictions do not prevent using the in-memory profile.
    }
  }

  async function load(rsn: string) {
    if (!active) return;
    const name = normalizeRsn(rsn);
    const username = name.toLowerCase();
    if (snapshot.pendingUsername === username) return;
    if (!isValidRsn(name)) {
      publish({ message: 'Enter an RSN of 1–12 letters, numbers, spaces, or hyphens.' });
      return;
    }
    const lastUpdate = updatedPlayers.get(username);
    const availableAt = Math.max(retryAt, lastUpdate === undefined ? 0 : lastUpdate + 60_000);
    if (availableAt > now()) {
      publish({ message: `Please wait ${Math.ceil((availableAt - now()) / 1000)} seconds before loading these levels again.` });
      return;
    }
    request?.abort();
    const current = new AbortController();
    request = current;
    publish({ status: 'loading', pendingUsername: username, message: '' });
    try {
      const result = await transport.load(username, current.signal);
      if (current.signal.aborted || request !== current || !active) return;
      if (result.retryAt !== undefined) retryAt = result.retryAt;
      else updatedPlayers.set(username, now());
      publish({ status: 'ready', profile: result.profile, saved: false, pendingUsername: null, message: result.warning ?? '' });
      persist();
    } catch (error) {
      if (current.signal.aborted || request !== current || !active) return;
      if (error instanceof PlayerLookupError && error.retryAt !== undefined) retryAt = error.retryAt;
      publish({ status: 'error', pendingUsername: null, message: error instanceof Error ? error.message : 'Could not load levels. Please try again.' });
    } finally {
      if (request === current) request = undefined;
    }
  }

  return {
    load,
    clear() {
      request?.abort();
      request = undefined;
      publish({ status: 'idle', profile: null, enabled: false, saved: false, pendingUsername: null, message: '' });
      persist();
    },
    setEnabled(enabled: boolean) {
      publish({ enabled: !!snapshot.profile && enabled });
      persist();
    },
    start() {
      active = true;
      return () => {
        active = false;
        request?.abort();
        request = undefined;
        if (snapshot.status === 'loading') publish({ status: snapshot.profile ? 'ready' : 'idle', pendingUsername: null });
      };
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
