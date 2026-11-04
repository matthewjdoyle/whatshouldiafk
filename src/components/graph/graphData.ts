import type { MethodResult } from '../../calculations/profit';
import { formatAfk } from '../methodPresentation';

function isMissingPrice(item: MethodResult['itemPrices'][number]): boolean {
  return item.amountPerHour !== 0 && (!Number.isFinite(item.price) || item.price <= 0);
}

export function hasPrices(result: MethodResult, isInput?: boolean): boolean {
  return !result.itemPrices.some(item =>
    (isInput === undefined || item.isInput === isInput) && isMissingPrice(item),
  );
}

export const formatNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format;
const formatSigned = new Intl.NumberFormat('en', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
}).format;

interface Metric {
  label: string;
  axisLabel?: string;
  usesPrices?: boolean;
  value: (result: MethodResult) => number | null;
  format: (value: number) => string;
}

export const metrics = {
  xp: {
    label: 'XP/hr',
    value: result => result.method.xp.perHour,
    format: value => `${formatNumber(value)} XP/hr`,
  },
  profit: {
    label: 'Net GP/hr',
    usesPrices: true,
    value: result => result.profitPerHour,
    format: value => `${formatSigned(value)} GP/hr`,
  },
  afk: {
    label: 'Typical AFK time',
    axisLabel: 'Typical AFK time (s)',
    value: result => result.method.afk.typicalSeconds,
    format: formatAfk,
  },
  interactions: {
    label: 'Interactions/hr',
    value: result => result.method.afk.interactionsPerHour,
    format: value => `${formatNumber(value)} interactions/hr`,
  },
  level: {
    label: 'Required level',
    value: result => result.method.level,
    format: value => `Level ${formatNumber(value)}`,
  },
  gpXp: {
    label: 'Net GP/XP',
    usesPrices: true,
    value: result => result.method.xp.perHour > 0 ? result.profitPerHour / result.method.xp.perHour : null,
    format: value => `${formatSigned(value)} GP/XP`,
  },
} satisfies Record<string, Metric>;

export type MetricId = keyof typeof metrics;
export const metricIds = Object.keys(metrics) as MetricId[];

export function getMetric(id: MetricId): Metric {
  return metrics[id];
}

export function getMetricValue(result: MethodResult, id: MetricId): number | null {
  const metric = getMetric(id);
  if (metric.usesPrices && !hasPrices(result)) return null;
  const value = metric.value(result);
  return value !== null && Number.isFinite(value) ? value : null;
}

export type ProfitStatus = 'profit' | 'loss' | null;

export function getProfitStatus(result: MethodResult): ProfitStatus {
  const profit = getMetricValue(result, 'profit');
  if (profit === null || profit === 0) return null;
  return profit > 0 ? 'profit' : 'loss';
}

type AxisValue = { value: number; reason?: never } | { value: null; reason: string };

export function getAxisValue(result: MethodResult, id: MetricId, logarithmic: boolean, axis: string): AxisValue {
  const metric = getMetric(id);
  const value = getMetricValue(result, id);
  if (value !== null) {
    if (logarithmic && value === 0) {
      return { value: null, reason: `Zero has no position on the logarithmic ${axis.toLowerCase()} (${metric.format(value)}).` };
    }
    return { value };
  }
  if (id === 'gpXp' && result.method.xp.perHour <= 0) {
    return { value: null, reason: 'Net GP/XP requires a positive XP rate.' };
  }
  if (metric.usesPrices) {
    const missing = result.itemPrices.filter(isMissingPrice);
    if (missing.length > 0) {
      const items = missing.map(item => `${item.name} (${item.isInput ? 'input' : 'output'})`);
      return { value: null, reason: `Missing GE ${items.length === 1 ? 'price' : 'prices'} for ${items.join(', ')}.` };
    }
  }
  return { value: null, reason: `${metric.label} is unavailable.` };
}

export function getAxisLabel(id: MetricId, logarithmic: boolean): string {
  const metric = getMetric(id);
  return `${metric.axisLabel ?? metric.label}${logarithmic ? ' (log)' : ''}`;
}

export type ChartType = 'scatter' | 'bar';
export type BarOrientation = 'horizontal' | 'vertical';

export interface GraphSettings {
  type: ChartType;
  x: MetricId;
  y: MetricId;
  bar: MetricId;
  barOrientation: BarOrientation;
  logX: boolean;
  logY: boolean;
  logBar: boolean;
}

export const defaultSettings: GraphSettings = {
  type: 'scatter', x: 'xp', y: 'profit', bar: 'profit', barOrientation: 'horizontal',
  logX: false, logY: false, logBar: false,
};

export function readGraphSettings(stored: unknown): GraphSettings {
  if (!stored || typeof stored !== 'object') return defaultSettings;
  const values = stored as Partial<GraphSettings>;
  return {
    type: values.type === 'bar' ? 'bar' : defaultSettings.type,
    x: metricIds.find(id => id === values.x) ?? defaultSettings.x,
    y: metricIds.find(id => id === values.y) ?? defaultSettings.y,
    bar: metricIds.find(id => id === values.bar) ?? defaultSettings.bar,
    barOrientation: values.barOrientation === 'vertical' ? 'vertical' : defaultSettings.barOrientation,
    logX: values.logX === true,
    logY: values.logY === true,
    logBar: values.logBar === true,
  };
}

export interface GraphPoint {
  result: MethodResult;
  x: number;
  y: number;
  profitStatus: ProfitStatus;
}

export function compareMethods(a: MethodResult, b: MethodResult): number {
  return a.method.name.localeCompare(b.method.name) || a.method.id.localeCompare(b.method.id);
}

function niceTicks(min: number, max: number, targetTicks: number, minimumStep = 0): number[] {
  const rawStep = (max - min) / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const factor = [1, 2, 2.5, 5, 10].find(value => value * magnitude >= rawStep) ?? 10;
  const step = Math.max(minimumStep, factor * magnitude);
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  return Array.from({ length: last - first + 1 }, (_, index) => (first + index) * step);
}

export function createScale(values: number[], metricId: MetricId, targetTicks: number, options: {
  logarithmic: boolean;
  bar?: boolean;
}) {
  const { logarithmic, bar } = options;
  const transform = logarithmic ? (value: number) => Math.log10(Math.abs(value)) : (value: number) => value;
  const transformed = values.map(transform);
  let min = Math.min(...transformed);
  let max = Math.max(...transformed);
  const zeroBaseline = bar && !logarithmic;
  if (zeroBaseline) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    const padding = logarithmic ? 0.05 : Math.abs(min) * 0.04 || 1;
    min -= padding;
    max += padding;
  } else if (!zeroBaseline) {
    const padding = (max - min) * 0.04;
    min -= padding;
    max += padding;
  }
  if (!logarithmic && !getMetric(metricId).usesPrices) min = Math.max(min, 0);

  // Keep the domain tied to the data. Tick spacing only controls the grid and labels.
  let ticks = logarithmic
    ? max - min >= 0.25
      ? niceTicks(min, max, targetTicks, max - min >= 2 ? 1 : 0).map(exponent => 10 ** exponent)
      : niceTicks(10 ** min, 10 ** max, targetTicks)
    : niceTicks(min, max, targetTicks);
  if (ticks.length < 2) {
    ticks = logarithmic ? [10 ** min, 10 ** max] : [min, max];
    if (min < 0 && max > 0 && !logarithmic) ticks.splice(1, 0, 0);
  }
  const position = (value: number) => (transform(value) - min) / (max - min);
  let tickFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 4 });
  if (new Set(ticks.map(tickFormat.format)).size !== ticks.length) {
    tickFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 8 });
  }
  return { ticks, position, formatTick: tickFormat.format };
}
