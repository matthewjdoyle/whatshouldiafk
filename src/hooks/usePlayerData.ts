import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPlayerData } from '../player/playerData';
import { createPlayerTransport } from '../player/playerTransport';
import { playerStorageKey } from '../player/profile';

export function usePlayerData() {
  const [player] = useState(() => {
    let saved: unknown;
    try { saved = JSON.parse(window.localStorage.getItem(playerStorageKey) ?? 'null'); } catch { /* Use defaults. */ }
    return createPlayerData(createPlayerTransport(window.fetch.bind(window)), {
      saved,
      persist(value) {
        if (value) window.localStorage.setItem(playerStorageKey, JSON.stringify(value));
        else window.localStorage.removeItem(playerStorageKey);
      },
    });
  });
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot);
  useEffect(() => player.start(), [player]);
  return { ...snapshot, load: player.load, clear: player.clear, setEnabled: player.setEnabled };
}
