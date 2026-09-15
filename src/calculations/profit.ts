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
  high: number;
  highTime: number;
  low: number;
  lowTime: number;
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
  profitPerHour: number;
  revenuePerHour: number;
  costPerHour: number;
  inputVolumeSustain: number | null;
  itemPrices: { id: number; name: string; isInput: boolean; amountPerHour: number; price: number; tax: number; limit?: number }[];
}

export function calculateMethod(
  method: Method,
  prices: Record<string, ItemPrice>,
  mapping: Record<string, ItemMapping>
): MethodResult {
  let costPerHour = 0;
  let revenuePerHour = 0;
  let minSustain: number | null = null;
  const itemPrices: MethodResult['itemPrices'] = [];

  for (const input of method.inputs) {
    const priceData = prices[input.id.toString()];
    const buyPrice = priceData ? (priceData.high || priceData.low || 0) : 0;
    costPerHour += buyPrice * input.amountPerHour;

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
    const priceData = prices[output.id.toString()];
    const sellPrice = priceData ? (priceData.low || priceData.high || 0) : 0;
    
    const tax = geTax(sellPrice, false);
    const netSellPrice = sellPrice - tax;
    const mapData = mapping[output.id.toString()];

    revenuePerHour += netSellPrice * output.amountPerHour;
    itemPrices.push({ id: output.id, name: output.name, isInput: false, amountPerHour: output.amountPerHour, price: sellPrice, tax: tax, limit: mapData?.limit });
  }

  return {
    method,
    profitPerHour: revenuePerHour - costPerHour,
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
