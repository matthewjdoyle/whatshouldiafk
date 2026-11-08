import { useEffect, useState, useSyncExternalStore } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { createMarketData } from '../market/marketData';
import { createMarketTransport } from '../market/marketTransport';

export function useMarketData() {
  const [market] = useState(() => createMarketData(
    createMarketTransport(window.fetch.bind(window), isTauri() ? invoke : undefined),
  ));
  const snapshot = useSyncExternalStore(market.subscribe, market.getSnapshot);
  useEffect(() => market.start(), [market]);
  return { ...snapshot, refresh: market.refresh };
}
