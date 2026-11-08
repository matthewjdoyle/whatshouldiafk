export interface ItemRate {
  id: number;
  name: string;
  amountPerHour: number;
}

export interface MethodAfk {
  typicalSeconds: number;
  maximumSeconds?: number;
  interactionsPerHour: number;
  bankingComplexity: string;
}

export interface Method {
  id: string;
  name: string;
  skill: string;
  level: number;
  iconUrl?: string;
  afk: MethodAfk;
  xp: { perHour: number };
  inputs: ItemRate[];
  outputs: ItemRate[];
  requirements: string[];
}

export interface ItemPrice {
  high: number | null;
  highTime?: number | null;
  low: number | null;
  lowTime?: number | null;
}

export interface ItemMapping {
  id: number;
  name: string;
  limit?: number;
  value?: number;
  members?: boolean;
}

export function geTax(price: number, exempt: boolean = false): number {
  if (exempt) return 0;
  return Math.min(Math.floor(price * 0.02), 5_000_000);
}

export interface MethodResult {
  method: Method;
  profitPerHour: number | null;
  revenuePerHour: number | null;
  costPerHour: number | null;
  inputVolumeSustain: number | null;
  itemPrices: { id: number; name: string; isInput: boolean; amountPerHour: number; price: number | null; tax: number; limit?: number }[];
}

export function isUsableQuote(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isMissingPrice(item: MethodResult['itemPrices'][number]): boolean {
  return item.amountPerHour !== 0 && item.price === null;
}

export function hasConfirmedProfit(result: MethodResult): boolean {
  return result.profitPerHour !== null && result.profitPerHour > 0;
}

export function getGpPerXp(result: MethodResult): number | null {
  const { method, profitPerHour } = result;
  return profitPerHour !== null && method.xp.perHour > 0 ? profitPerHour / method.xp.perHour : null;
}

function getItemPrice(id: number, quote: ItemPrice | undefined, isInput: boolean): number | null {
  if (id === 995) return 1;
  if (id === 13204) return 1000;
  const preferred = isInput ? quote?.high : quote?.low;
  const fallback = isInput ? quote?.low : quote?.high;
  if (isUsableQuote(preferred)) return preferred;
  return isUsableQuote(fallback) ? fallback : null;
}

export function calculateMethod(
  method: Method,
  prices: Record<string, ItemPrice>,
  mapping: Record<string, ItemMapping>
): MethodResult {
  let cost = 0;
  let revenue = 0;
  let minSustain: number | null = null;
  const itemPrices: MethodResult['itemPrices'] = [];

  for (const input of method.inputs) {
    const buyPrice = getItemPrice(input.id, prices[input.id], true);
    if (buyPrice !== null) cost += buyPrice * input.amountPerHour;

    const mapData = mapping[input.id.toString()];
    itemPrices.push({ id: input.id, name: input.name, isInput: true, amountPerHour: input.amountPerHour, price: buyPrice, tax: 0, limit: mapData?.limit });

    if (mapData && mapData.limit) {
      const sustain = mapData.limit / input.amountPerHour;
      if (minSustain === null || sustain < minSustain) {
        minSustain = sustain;
      }
    }
  }

  for (const output of method.outputs) {
    const sellPrice = getItemPrice(output.id, prices[output.id], false);
    const tax = sellPrice === null ? 0 : geTax(sellPrice, output.id === 995 || output.id === 13204);
    const mapData = mapping[output.id.toString()];

    if (sellPrice !== null) revenue += (sellPrice - tax) * output.amountPerHour;
    itemPrices.push({ id: output.id, name: output.name, isInput: false, amountPerHour: output.amountPerHour, price: sellPrice, tax: tax, limit: mapData?.limit });
  }

  const costPerHour = itemPrices.some(item => item.isInput && isMissingPrice(item)) ? null : cost;
  const revenuePerHour = itemPrices.some(item => !item.isInput && isMissingPrice(item)) ? null : revenue;
  return {
    method,
    profitPerHour: costPerHour === null || revenuePerHour === null ? null : revenuePerHour - costPerHour,
    revenuePerHour,
    costPerHour,
    inputVolumeSustain: minSustain,
    itemPrices,
  };
}

export function formatGp(amount: number): string {
  const isNeg = amount < 0;
  const abs = Math.abs(amount);
  let val = '';
  if (abs >= 1_000_000) {
    val = (abs / 1_000_000).toFixed(2) + 'm';
  } else if (abs >= 1000) {
    val = (abs / 1000).toFixed(0) + 'k';
  } else {
    val = abs.toString();
  }
  return isNeg ? '-' + val : '+' + val;
}
