import { readPlayerResponse } from './profile.ts';
import type { PlayerProfile } from './profile.ts';

export interface PlayerLookup {
  profile: PlayerProfile;
  warning?: string;
  retryAt?: number;
}

export class PlayerLookupError extends Error {
  retryAt?: number;
  constructor(message: string, retryAt?: number) {
    super(message);
    this.retryAt = retryAt;
  }
}

export function createPlayerTransport(fetchResponse: typeof fetch, now = Date.now) {
  async function request(username: string, method: 'GET' | 'POST', signal: AbortSignal) {
    const attempt = new AbortController();
    let rejectCancellation: (error: Error) => void;
    const cancelled = new Promise<never>((_, reject) => { rejectCancellation = reject; });
    const onAbort = () => {
      rejectCancellation(new PlayerLookupError('Player lookup cancelled.'));
      attempt.abort();
    };
    signal.addEventListener('abort', onAbort);
    const timeout = setTimeout(() => {
      rejectCancellation(new PlayerLookupError('Player lookup timed out. Please try again.'));
      attempt.abort();
    }, 15_000);
    try {
      if (signal.aborted) throw new PlayerLookupError('Player lookup cancelled.');
      return await Promise.race([cancelled, (async () => {
        let response: Response;
        try {
          response = await fetchResponse(`https://api.wiseoldman.net/v2/players/${encodeURIComponent(username)}`, {
            method, signal: attempt.signal, credentials: 'omit',
          });
        } catch {
          throw new PlayerLookupError('Could not reach Wise Old Man. Check your connection and try again.');
        }
        if (response.status === 429) {
          const header = response.headers.get('Retry-After');
          const seconds = header !== null && /^\d+$/.test(header.trim()) ? Number(header) : NaN;
          const date = header !== null && /^[a-z]{3},/i.test(header) ? Date.parse(header) : NaN;
          const delay = Number.isFinite(seconds) ? seconds * 1000
            : Number.isFinite(date) ? Math.max(0, date - now()) : 60_000;
          throw new PlayerLookupError('Wise Old Man is limiting lookups. Please wait before trying again.', now() + delay);
        }
        if (response.status === 404) throw new PlayerLookupError('Player not found on the hiscores. Check the RSN and try logging out of OSRS first.');
        if (response.status === 400) throw new PlayerLookupError('Wise Old Man could not look up this player. Check the RSN; the player may be unranked.');
        if (response.status === 403) throw new PlayerLookupError('Wise Old Man has declined tracking for this player. Their levels cannot be loaded here.');
        if (!response.ok) throw new PlayerLookupError('Wise Old Man is temporarily unavailable. Please try again later.');
        let data: unknown;
        try { data = await response.json(); } catch { throw new PlayerLookupError('Wise Old Man returned an invalid response. Please try again.'); }
        return readPlayerResponse(data, username, now());
      })()]);
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
    }
  }

  return {
    async load(username: string, signal: AbortSignal): Promise<PlayerLookup> {
      try {
        return { profile: await request(username, 'POST', signal) };
      } catch (error) {
        if (!(error instanceof PlayerLookupError) || error.retryAt === undefined || signal.aborted) throw error;
        try {
          const profile = await request(username, 'GET', signal);
          return { profile, warning: 'Refresh limited by Wise Old Man. Showing their existing saved snapshot.', retryAt: error.retryAt };
        } catch {
          throw error;
        }
      }
    },
  };
}
