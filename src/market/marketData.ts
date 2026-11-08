import type { ItemMapping, ItemPrice } from '../calculations/profit.ts';

export type Prices = Record<string, ItemPrice>;
export type Mapping = Record<string, ItemMapping>;

type PricesState =
  | { status: 'loading' | 'unavailable' }
  | { status: 'ready' | 'refreshing' | 'stale'; data: Prices; updatedAt: Date };

type MappingState =
  | { status: 'loading' | 'unavailable' }
  | { status: 'ready'; data: Mapping };

interface MarketSnapshot {
  prices: PricesState;
  mapping: MappingState;
}

interface MarketTransport {
  loadPrices: (signal: AbortSignal) => Promise<Prices>;
  loadMapping: (signal: AbortSignal) => Promise<Mapping>;
}

const refreshIntervalMs = 5 * 60 * 1000;

export function createMarketData(transport: MarketTransport) {
  let snapshot: MarketSnapshot = {
    prices: { status: 'loading' },
    mapping: { status: 'loading' },
  };
  let activeSession: AbortController | undefined;
  const listeners = new Set<() => void>();

  function publish(update: Partial<MarketSnapshot>) {
    snapshot = { ...snapshot, ...update };
    listeners.forEach(listener => listener());
  }

  async function refreshPrices(signal: AbortSignal) {
    const previous = snapshot.prices;
    publish({ prices: 'data' in previous ? { ...previous, status: 'refreshing' } : { status: 'loading' } });
    try {
      const data = await transport.loadPrices(signal);
      if (!signal.aborted) publish({ prices: { status: 'ready', data, updatedAt: new Date() } });
    } catch (error) {
      if (signal.aborted) return;
      console.error('Failed to fetch GE prices:', error);
      publish({ prices: 'data' in previous ? { ...previous, status: 'stale' } : { status: 'unavailable' } });
    }
  }

  async function refreshMapping(signal: AbortSignal) {
    publish({ mapping: { status: 'loading' } });
    try {
      const data = await transport.loadMapping(signal);
      if (!signal.aborted) publish({ mapping: { status: 'ready', data } });
    } catch (error) {
      if (signal.aborted) return;
      console.error('Failed to fetch GE item mapping:', error);
      publish({ mapping: { status: 'unavailable' } });
    }
  }

  function refresh() {
    const signal = activeSession?.signal;
    if (!signal || signal.aborted) return;
    if (snapshot.prices.status !== 'loading' && snapshot.prices.status !== 'refreshing') {
      void refreshPrices(signal);
    }
    if (snapshot.mapping.status === 'unavailable') void refreshMapping(signal);
  }

  function start() {
    const session = new AbortController();
    // React Strict Mode cleans up its first effect before this startup runs.
    queueMicrotask(() => {
      if (session.signal.aborted) return;
      activeSession = session;
      void refreshPrices(session.signal);
      if (snapshot.mapping.status !== 'ready') void refreshMapping(session.signal);
    });
    const interval = setInterval(refresh, refreshIntervalMs);
    return () => {
      clearInterval(interval);
      if (activeSession === session) activeSession = undefined;
      session.abort();
    };
  }

  return {
    start,
    refresh,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
