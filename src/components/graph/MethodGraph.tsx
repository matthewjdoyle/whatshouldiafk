import { useRef, useState } from 'react';
import { ChartBar, ChartColumn, ChartScatter, ChevronDown } from 'lucide-react';
import type { MethodResult } from '../../calculations/profit';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { defaultSettings, getAxisValue, getMetric, getProfitStatus, metricIds, readGraphSettings } from './graphData';
import type { GraphPoint, GraphSettings, MetricId } from './graphData';
import ScatterPlot from './ScatterPlot';
import RankedBars from './RankedBars';
import MethodDetails from './MethodDetails';

interface Props {
  results: MethodResult[];
  priceLoading: boolean;
  profitableOnly: boolean;
}

function AxisControl({ label, scaleAxis = label, value, onChange, logarithmic, onScaleChange }: {
  label: string;
  scaleAxis?: string;
  value: MetricId;
  onChange: (metric: MetricId) => void;
  logarithmic: boolean;
  onScaleChange: (logarithmic: boolean) => void;
}) {
  return (
    <div className="min-w-0 sm:min-w-36">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-sub">{label}</span>
        <span className="relative block">
          <select
            value={value}
            onChange={event => onChange(event.target.value as MetricId)}
            className="w-full cursor-pointer appearance-none rounded-md border border-border-main bg-input py-2 pr-7 pl-2 text-sm text-main outline-none hover:border-muted focus:border-accent focus:ring-1 focus:ring-accent sm:pl-3"
          >
            {metricIds.map(id => <option key={id} value={id}>{getMetric(id).label}</option>)}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-sub" />
        </span>
      </label>
      <label className="mt-1 inline-flex min-h-7 cursor-pointer items-center gap-1.5 text-xs text-sub">
        <input
          type="checkbox"
          aria-label={`Log scale for ${scaleAxis}`}
          checked={logarithmic}
          onChange={event => onScaleChange(event.target.checked)}
          className="accent-accent focus-visible:outline-2 focus-visible:outline-accent"
        />
        Log scale
      </label>
    </div>
  );
}

const chartTypes = [
  { id: 'scatter', label: 'Scatter', Icon: ChartScatter },
  { id: 'bar', label: 'Bar', Icon: ChartBar },
] as const;

const barOrientations = [
  { id: 'horizontal', label: 'Horizontal', Icon: ChartBar },
  { id: 'vertical', label: 'Vertical', Icon: ChartColumn },
] as const;
const segmentGroup = 'inline-flex gap-1 rounded-md border border-border-main bg-input p-0.5';
const segmentButton = 'inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent';
const selectedSegment = 'bg-surface-hover text-accent';
const unselectedSegment = 'text-sub hover:bg-surface-hover hover:text-main';

export default function MethodGraph({ results, priceLoading, profitableOnly }: Props) {
  const [stored, setStored] = useLocalStorage<GraphSettings>('afk-graph', defaultSettings);
  const settings = readGraphSettings(stored);
  const [openedIds, setOpenedIds] = useState<string[] | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scatter = settings.type === 'scatter';
  const horizontalBars = settings.barOrientation === 'horizontal';
  const valueAxis = scatter || horizontalBars ? 'X axis' : 'Y axis';
  const xMetric = scatter ? settings.x : settings.bar;
  const yMetric = settings.y;
  const logX = scatter ? settings.logX : settings.logBar;
  const logY = scatter && settings.logY;
  const usesPrices = getMetric(xMetric).usesPrices || (scatter && getMetric(yMetric).usesPrices);
  const waitingForPrices = priceLoading && (usesPrices || profitableOnly);
  const points: GraphPoint[] = [];
  const omitted: { method: MethodResult['method']; reasons: string[] }[] = [];
  for (const result of results) {
    const x = getAxisValue(result, xMetric, logX, valueAxis);
    const y = scatter ? getAxisValue(result, yMetric, logY, 'Y axis') : { value: 0, reason: undefined };
    if (x.value !== null && y.value !== null) {
      points.push({ result, x: x.value, y: y.value, profitStatus: getProfitStatus(result) });
    } else {
      const reasons = [...new Set([x.reason, y.reason].filter(reason => reason !== undefined))];
      omitted.push({ method: result.method, reasons });
    }
  }
  const openedResults = openedIds?.flatMap(id => {
    const result = results.find(row => row.method.id === id);
    return result ? [result] : [];
  });

  const openDetails = (ids: string[], trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setOpenedIds(ids);
  };
  const closeDetails = () => {
    setOpenedIds(null);
    const trigger = triggerRef.current;
    (trigger?.isConnected ? trigger : headingRef.current)?.focus({ preventScroll: true });
  };

  return (
    <section aria-labelledby="graph-title" className="min-w-0 rounded-lg border border-border-main bg-surface">
      <header className="gap-4 p-3 sm:p-5 md:flex md:items-center md:justify-between">
        <div>
          <h2 ref={headingRef} id="graph-title" tabIndex={-1} className="text-lg font-semibold text-main">
            Compare methods
          </h2>
          <p className="mt-1 text-sm text-sub">
            {scatter ? 'Explore trade-offs between XP, profit, and AFK time.' : 'Rank AFK methods by a single metric.'}
          </p>
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-start gap-3 md:mt-0">
          <div>
            <div id="chart-type-label" className="mb-1 text-xs font-medium text-sub">Chart type</div>
            <div role="group" aria-labelledby="chart-type-label" className={segmentGroup}>
              {chartTypes.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={settings.type === id}
                  onClick={() => setStored({ ...settings, type: id })}
                  className={`${segmentButton} ${settings.type === id ? selectedSegment : unselectedSegment}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          {scatter ? (
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:gap-3">
              <AxisControl label="X axis" value={settings.x} onChange={x => setStored({ ...settings, x })} logarithmic={logX} onScaleChange={logX => setStored({ ...settings, logX })} />
              <AxisControl label="Y axis" value={settings.y} onChange={y => setStored({ ...settings, y })} logarithmic={logY} onScaleChange={logY => setStored({ ...settings, logY })} />
            </div>
          ) : (
            <>
              <div>
                <div id="bar-orientation-label" className="mb-1 text-xs font-medium text-sub">Bar orientation</div>
                <div role="group" aria-labelledby="bar-orientation-label" className={segmentGroup}>
                  {barOrientations.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={settings.barOrientation === id}
                      onClick={() => setStored({ ...settings, barOrientation: id })}
                      className={`${segmentButton} ${settings.barOrientation === id ? selectedSegment : unselectedSegment}`}
                    >
                      <Icon size={15} aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-full sm:w-auto">
                <AxisControl label="Rank by" scaleAxis={`bar ${valueAxis}`} value={settings.bar} onChange={bar => setStored({ ...settings, bar })} logarithmic={logX} onScaleChange={logBar => setStored({ ...settings, logBar })} />
              </div>
            </>
          )}
        </div>
      </header>
      <div className="border-y border-border-main bg-app">
        {waitingForPrices ? (
          <p role="status" className="p-10 text-center text-sm text-sub">Loading latest GE prices…</p>
        ) : results.length === 0 ? (
          <p role="status" className="p-10 text-center text-sm text-sub">No methods match your filters.</p>
        ) : points.length === 0 ? (
          <p role="status" className="p-10 text-center text-sm text-sub">No methods can be plotted with these axis settings. Expand the omitted methods below for details.</p>
        ) : scatter ? (
          <ScatterPlot points={points} xMetric={xMetric} yMetric={yMetric} logX={logX} logY={logY} onOpen={openDetails} />
        ) : (
          <RankedBars
            key={settings.barOrientation}
            points={points}
            metricId={xMetric}
            logarithmic={logX}
            orientation={settings.barOrientation}
            onOpen={openDetails}
          />
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5 text-xs text-sub sm:px-5">
        <p aria-live="polite" className="tabular-nums">
          {!waitingForPrices && <>{points.length} {points.length === 1 ? 'method' : 'methods'} plotted</>}
        </p>
        {!waitingForPrices && points.length > 0 && <p>Select {scatter ? 'a marker' : 'a bar'} for method details.</p>}
        {!waitingForPrices && points.length > 0 && (scatter || usesPrices || logX || logY) && (
          <div className="flex w-full flex-wrap gap-x-4 gap-y-1">
            {(scatter || usesPrices) && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className={scatter ? 'size-3 rounded-full border-2 border-profit' : 'h-2 w-3 rounded-xs bg-profit'} />
                  Profitable
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className={scatter ? 'size-3 rounded-full border-2 border-loss' : 'h-2 w-3 rounded-xs bg-loss'} />
                  Loss-making
                </span>
              </>
            )}
            {(logX || logY) && (
              <p>Log axes show magnitude.{!scatter && ` Bars start at the ${horizontalBars ? 'left' : 'lower'} axis bound.`}</p>
            )}
          </div>
        )}
        {!waitingForPrices && omitted.length > 0 && (
          <details className="w-full rounded-md border border-border-main bg-app px-2.5 py-1.5">
            <summary className="cursor-pointer rounded py-0.5 font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent">
              {omitted.length} {omitted.length === 1 ? 'method' : 'methods'} omitted
            </summary>
            <ul className="custom-scrollbar mt-1 max-h-48 divide-y divide-border-sub overflow-y-auto">
              {omitted.map(({ method, reasons }) => (
                <li key={method.id} className="py-2">
                  <p className="font-semibold text-main">{method.name}</p>
                  <p className="mt-0.5">{reasons.join(' ')}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </footer>
      {openedResults && <MethodDetails results={openedResults} onClose={closeDetails} />}
    </section>
  );
}
