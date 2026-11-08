import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { compareMethods, createScale, getAxisLabel, getMetric } from './graphData';
import type { BarOrientation, GraphPoint, MetricId } from './graphData';
import GraphIcon from './GraphIcon';

interface Props {
  points: GraphPoint[];
  metricId: MetricId;
  logarithmic: boolean;
  orientation: BarOrientation;
  onOpen: (ids: string[], trigger: HTMLButtonElement) => void;
}

const tooltipWidth = 208;

export default function RankedBars({ points, metricId, logarithmic, orientation, onOpen }: Props) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const activeId = hover?.id ?? focusedId;

  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(plot);
    return () => observer.disconnect();
  }, []);

  const horizontal = orientation === 'horizontal';
  const metric = getMetric(metricId);
  const axisLabel = getAxisLabel(metricId, logarithmic);
  const ranked = useMemo(() => [...points].sort((a, b) => b.x - a.x || compareMethods(a.result, b.result)), [points]);
  const availableHeight = width < 480 ? 640 : 800;
  const height = horizontal ? Math.min(availableHeight, Math.max(228, ranked.length * 44 + 56)) : availableHeight;
  const left = horizontal ? Math.min(156, Math.floor(width * 0.34)) : width < 420 ? 62 : 74;
  const right = width - (horizontal ? 24 : 14);
  const top = horizontal ? 48 : 24;
  const labelSpace = width < 420 ? 124 : 166;
  const bottom = height - (horizontal ? 8 : labelSpace);
  const valueLength = horizontal ? right - left : bottom - top;
  const categoryStep = (horizontal ? bottom - top : right - left) / ranked.length;
  const thickness = Math.min(horizontal ? 26 : 48, categoryStep * 0.68);
  const iconSize = Math.min(28, Math.floor(categoryStep - 2));
  const markerSize = iconSize >= 12 ? iconSize : Math.min(6, categoryStep * 0.65);
  const labelStride = Math.max(1, Math.ceil(20 / Math.max(1, categoryStep)));
  const maxLabelWidth = (labelSpace - markerSize - 26) / Math.SQRT1_2;
  const tickCount = Math.max(2, Math.floor(valueLength / 80));
  const scale = useMemo(
    () => createScale(ranked.map(point => point.x), metricId, tickCount, { logarithmic, bar: true }),
    [ranked, metricId, tickCount, logarithmic],
  );
  const valuePosition = (fraction: number) => horizontal ? left + fraction * valueLength : bottom - fraction * valueLength;
  const baseline = valuePosition(logarithmic ? 0 : scale.position(0));
  const bars = ranked.map((point, index) => ({
    ...point,
    center: (horizontal ? top : left) + (index + 0.5) * categoryStep,
    end: valuePosition(scale.position(point.x)),
  }));
  const active = bars.find(bar => bar.result.method.id === activeId);
  const preview = hover ?? (active && {
    x: horizontal ? left : active.center,
    y: horizontal ? active.center : (baseline + active.end) / 2,
  });
  const previewBelow = preview && preview.y < 92;

  const previewBar = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.pointerType === 'touch') return;
    const bounds = plotRef.current?.getBoundingClientRect();
    if (bounds) setHover({ id, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  };

  return (
    <div
      ref={plotRef}
      role="group"
      aria-label={`${horizontal ? 'Horizontal' : 'Vertical'} bar chart ranked by ${axisLabel}`}
      className="relative"
      style={{ height }}
    >
      {width > 0 && (
        <>
          <svg width={width} height={height} aria-hidden="true" className="pointer-events-none absolute inset-0">
            <text
              x={horizontal ? (left + right) / 2 : 0}
              y={horizontal ? 16 : 0}
              transform={horizontal ? undefined : `translate(15 ${(top + bottom) / 2}) rotate(-90)`}
              textAnchor="middle"
              className="fill-main text-xs font-medium"
            >
              {axisLabel}
            </text>
            {horizontal && <text x={12} y={34} className="fill-sub text-xs font-medium">Method</text>}
            {scale.ticks.map(tick => {
              const position = valuePosition(scale.position(tick));
              return (
                <g key={tick}>
                  <line
                    x1={horizontal ? position : left}
                    x2={horizontal ? position : right}
                    y1={horizontal ? top : position}
                    y2={horizontal ? bottom : position}
                    className={tick === 0 ? 'stroke-muted' : 'stroke-border-main'}
                  />
                  <text
                    x={horizontal ? position : left - 8}
                    y={horizontal ? 35 : position}
                    dy={horizontal ? undefined : '0.35em'}
                    textAnchor={horizontal ? 'middle' : 'end'}
                    className="fill-sub text-[11px] tabular-nums"
                  >
                    {scale.formatTick(tick)}
                  </text>
                </g>
              );
            })}
            <path d={`M ${left} ${top} V ${bottom} H ${right}`} className="fill-none stroke-border-main" />
            {bars.map(({ result: { method, profitPerHour }, x, center, end, profitStatus }) => {
              const start = Math.min(baseline, end);
              const length = Math.abs(end - baseline);
              const color = profitStatus === 'profit' ? 'text-profit'
                : profitStatus === 'loss' || profitPerHour === 0 ? 'text-loss'
                : 'text-muted';
              return x === 0 ? (
                <line
                  key={method.id}
                  x1={horizontal ? baseline : center - thickness / 2}
                  x2={horizontal ? baseline : center + thickness / 2}
                  y1={horizontal ? center - thickness / 2 : baseline}
                  y2={horizontal ? center + thickness / 2 : baseline}
                  className={`stroke-current ${color}`}
                  strokeWidth={activeId === method.id ? 4 : 2}
                />
              ) : (
                <rect
                  key={method.id}
                  x={horizontal ? start : center - thickness / 2}
                  y={horizontal ? center - thickness / 2 : start}
                  width={horizontal ? length : thickness}
                  height={horizontal ? thickness : length}
                  rx={Math.min(3, thickness / 4)}
                  opacity={activeId === method.id ? 1 : 0.8}
                  className={`fill-current ${color}`}
                />
              );
            })}
          </svg>
          {bars.map(({ result: { method, profitPerHour }, x, center, profitStatus }, index) => {
            const status = profitStatus === 'profit' ? 'Profitable' : profitStatus === 'loss' ? 'Loss-making'
              : profitPerHour === 0 ? 'Breaks even' : 'Profit unavailable';
            const labelWidth = Math.min(maxLabelWidth, (center - 10) / Math.SQRT1_2);
            return (
              <button
                key={method.id}
                type="button"
                aria-label={[method.name, metric.format(x), status].filter(Boolean).join(', ')}
                aria-haspopup="dialog"
                onPointerEnter={event => previewBar(event, method.id)}
                onPointerMove={event => previewBar(event, method.id)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setFocusedId(method.id)}
                onBlur={() => setFocusedId(null)}
                onClick={event => {
                  setHover(null);
                  onOpen([method.id], event.currentTarget);
                }}
                style={horizontal
                  ? { left: 0, top: center - categoryStep / 2, width, height: categoryStep }
                  : { left: center - categoryStep / 2, top: 0, width: categoryStep, height }}
                className="group absolute cursor-pointer text-sub outline-none hover:text-main focus-visible:text-main"
              >
                <span
                  aria-hidden="true"
                  style={horizontal ? { width: left - 4 } : { top: bottom + 8 }}
                  className={horizontal
                    ? 'pointer-events-none absolute inset-y-0 left-0 flex items-center gap-1.5 px-2 text-left sm:gap-2 sm:px-3'
                    : 'pointer-events-none absolute inset-x-0 flex justify-center'}
                >
                  <span className="shrink-0 rounded-full group-focus-visible:ring-2 group-focus-visible:ring-accent">
                    {iconSize >= 12 ? <GraphIcon method={method} size={iconSize} /> : (
                      <span style={{ width: markerSize, height: markerSize }} className="block rounded-full bg-muted" />
                    )}
                  </span>
                  {horizontal ? (
                    <span className={`min-w-0 truncate leading-none ${categoryStep >= 34 ? 'text-xs' : 'text-[10px]'}`}>
                      {method.name}
                    </span>
                  ) : index % labelStride === 0 && (
                    <span
                      style={{ top: markerSize + 6, width: labelWidth, transform: 'translateX(-100%) rotate(-45deg)' }}
                      className="absolute left-1/2 origin-right truncate text-right text-[11px] leading-tight"
                    >
                      {method.name}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </>
      )}
      {preview && active && width >= tooltipWidth + 16 && (
        <div
          aria-hidden="true"
          style={{
            left: Math.min(Math.max(8, preview.x - tooltipWidth / 2), width - tooltipWidth - 8),
            top: preview.y + (previewBelow ? 12 : -12),
          }}
          className={`pointer-events-none absolute z-20 flex w-52 items-center gap-2 rounded-md border border-border-main bg-surface p-2.5 text-xs shadow-lg ${previewBelow ? '' : '-translate-y-full'}`}
        >
          <GraphIcon key={active.result.method.id} method={active.result.method} profitStatus={active.profitStatus} />
          <div className="min-w-0">
            <div className="font-semibold text-main">{active.result.method.name}</div>
            <div className="mt-0.5 text-sub tabular-nums">{metric.format(active.x)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
