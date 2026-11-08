import { isUsableQuote } from '../calculations/profit.ts';
import type { Mapping, Prices } from './marketData.ts';

const baseUrl = 'https://prices.runescape.wiki/api/v1/osrs';
const deadlineMs = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPrices(value: unknown): Prices {
  if (!isRecord(value) || !isRecord(value.data)) throw new Error('GE response is missing price data');
  const prices: Prices = {};
  for (const [id, item] of Object.entries(value.data)) {
    if (!/^[1-9]\d*$/.test(id) || !isRecord(item)) continue;
    const high = isUsableQuote(item.high) ? item.high : null;
    const low = isUsableQuote(item.low) ? item.low : null;
    if (high === null && low === null) continue;
    prices[id] = {
      high, low,
      highTime: typeof item.highTime === 'number' ? item.highTime : null,
      lowTime: typeof item.lowTime === 'number' ? item.lowTime : null,
    };
  }
  if (Object.keys(prices).length === 0) throw new Error('GE response has no usable quotes');
  return prices;
}

function readMapping(value: unknown): Mapping {
  if (!Array.isArray(value)) throw new Error('GE response is missing item mapping');
  const mapping: Mapping = {};
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'number' || !Number.isSafeInteger(item.id)
      || item.id <= 0 || typeof item.name !== 'string') continue;
    mapping[item.id] = {
      id: item.id,
      name: item.name,
      limit: isUsableQuote(item.limit) ? item.limit : undefined,
      value: typeof item.value === 'number' ? item.value : undefined,
      members: typeof item.members === 'boolean' ? item.members : undefined,
    };
  }
  if (Object.keys(mapping).length === 0) throw new Error('GE response has no usable item mapping');
  return mapping;
}

async function withDeadline<T>(signal: AbortSignal, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const abortError = new Error('GE request cancelled');
  if (signal.aborted) throw abortError;
  const attempt = new AbortController();
  let cancel: (error: Error) => void;
  const cancellation = new Promise<never>((_, reject) => { cancel = reject; });
  const onAbort = () => {
    cancel(abortError);
    attempt.abort();
  };
  signal.addEventListener('abort', onAbort);
  const timeout = setTimeout(() => {
    cancel(new Error('GE request timed out'));
    attempt.abort();
  }, deadlineMs);
  try {
    return await Promise.race([cancellation, request(attempt.signal)]);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
  }
}

export function createMarketTransport(
  fetchResponse: typeof fetch,
  invoke?: (command: string) => Promise<unknown>,
) {
  async function load<T>(command: string, endpoint: string, read: (value: unknown) => T, signal: AbortSignal) {
    if (invoke) {
      try {
        return await withDeadline(signal, async () => read(await invoke(command)));
      } catch {
        // The web attempt also checks the session signal before starting.
      }
    }
    return withDeadline(signal, async attemptSignal => {
      const response = await fetchResponse(`${baseUrl}/${endpoint}`, { signal: attemptSignal });
      if (!response.ok) throw new Error(`GE ${endpoint} request failed (${response.status})`);
      return read(await response.json());
    });
  }

  return {
    loadPrices: (signal: AbortSignal) => load('fetch_prices', 'latest', readPrices, signal),
    loadMapping: (signal: AbortSignal) => load('fetch_mapping', 'mapping', readMapping, signal),
  };
}
