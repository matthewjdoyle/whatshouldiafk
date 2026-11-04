import { useLayoutEffect, useRef, useState } from 'react';
import { compareMethods, createScale, getAxisLabel, getMetric } from './graphData';
import type { GraphPoint, MetricId } from './graphData';
import GraphIcon from './GraphIcon';

interface Props {
  points: GraphPoint[];
  xMetric: MetricId;
  yMetric: MetricId;
  logX: boolean;
  logY: boolean;
  onOpen: (ids: string[], trigger: HTMLButtonElement) => void;
}

interface PlottedPoint extends GraphPoint {
  left: number;
  top: number;
}

interface MarkerGroup {
  anchor: PlottedPoint;
  members: PlottedPoint[];
}

function groupMarkers(points: PlottedPoint[], markerSize: number): MarkerGroup[] {
  const groups: MarkerGroup[] = [];
  for (const point of points) {
    const group = groups.find(({ anchor }) =>
      Math.abs(anchor.left - point.left) < markerSize && Math.abs(anchor.top - point.top) < markerSize,
    );
    if (group) group.members.push(point);
    else groups.push({ anchor: point, members: [point] });
  }
  return groups;
}

export default function ScatterPlot({ points, xMetric, yMetric, logX, logY, onOpen }: Props) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const activeMarker = hoveredId ?? focusedId;

  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(plot);
    return () => observer.disconnect();
  }, []);

  const { width, height } = size;
  const left = width < 420 ? 66 : 78;
  const right = width - 25;
  const top = 27;
  const bottom = height - 57;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const ready = plotWidth > 0 && plotHeight > 0;
  const xAxis = getMetric(xMetric);
  const yAxis = getMetric(yMetric);
  const xLabel = getAxisLabel(xMetric, logX);
  const yLabel = getAxisLabel(yMetric, logY);
  const xScale = createScale(points.map(point => point.x), xMetric, Math.max(2, Math.floor(plotWidth / 85)), { logarithmic: logX });
  const yScale = createScale(points.map(point => point.y), yMetric, 5, { logarithmic: logY });
  const x = (value: number) => left + plotWidth * xScale.position(value);
  const y = (value: number) => bottom - plotHeight * yScale.position(value);
  const plotted = ready ? [...points]
    .sort((a, b) => compareMethods(a.result, b.result))
    .map(point => ({ ...point, left: x(point.x), top: y(point.y) })) : [];
  const largeTargets = width < 480 || window.matchMedia('(pointer: coarse)').matches;
  const markerSize = largeTargets ? 44 : 36;
  const groups = groupMarkers(plotted, markerSize);

  return (
    <div
      ref={plotRef}
      role="group"
      aria-label={`Scatter plot of ${yLabel} against ${xLabel}`}
      className="relative h-[640px] sm:h-[800px]"
    >
      {ready && (
        <svg width={width} height={height} aria-hidden="true" className="absolute inset-0">
          {xScale.ticks.map(tick => (
            <g key={tick} transform={`translate(${x(tick)} 0)`}>
              <line y1={top} y2={bottom} className={tick === 0 && xAxis.usesPrices ? 'stroke-current text-muted' : 'stroke-border-main'} />
              <text y={bottom + 20} textAnchor="middle" className="fill-sub text-[11px] tabular-nums">{xScale.formatTick(tick)}</text>
            </g>
          ))}
          {yScale.ticks.map(tick => (
            <g key={tick} transform={`translate(0 ${y(tick)})`}>
              <line x1={left} x2={right} className={tick === 0 && yAxis.usesPrices ? 'stroke-current text-muted' : 'stroke-border-main'} />
              <text x={left - 8} dy="0.35em" textAnchor="end" className="fill-sub text-[11px] tabular-nums">{yScale.formatTick(tick)}</text>
            </g>
          ))}
          <path d={`M ${left} ${top} V ${bottom} H ${right}`} className="fill-none stroke-current text-muted" />
          <text x={(left + right) / 2} y={height - 10} textAnchor="middle" className="fill-main text-xs font-medium">
            {xLabel}
          </text>
          <text transform={`translate(15 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle" className="fill-main text-xs font-medium">
            {yLabel}
          </text>
          {plotted.map(point => (
            <circle
              key={point.result.method.id}
              cx={point.left}
              cy={point.top}
              r={2.5}
              className={point.profitStatus === 'profit' ? 'fill-profit' : point.profitStatus === 'loss' ? 'fill-loss' : 'fill-accent'}
            />
          ))}
        </svg>
      )}
      {groups.map(({ anchor, members }) => {
        const { method } = anchor.result;
        const grouped = members.length > 1;
        const profitCount = members.filter(point => point.profitStatus === 'profit').length;
        const lossCount = members.filter(point => point.profitStatus === 'loss').length;
        const status = [
          profitCount && (grouped ? `${profitCount} profitable` : 'Profitable'),
          lossCount && (grouped ? `${lossCount} loss-making` : 'Loss-making'),
        ].filter(Boolean).join(' · ');
        const values = `${xAxis.format(anchor.x)} · ${yAxis.format(anchor.y)}`;
        const name = grouped ? `${members.length} overlapping methods` : method.name;
        let border = 'border border-border-main';
        if (profitCount && lossCount) border = 'border-2 border-t-profit border-l-profit border-b-loss border-r-loss';
        else if (profitCount) border = 'border-2 border-profit';
        else if (lossCount) border = 'border-2 border-loss';
        const showTooltip = activeMarker === method.id;
        const placeBelow = anchor.top < 95;

        return (
          <div key={method.id}>
            <button
              type="button"
              aria-label={[name, grouped ? '' : values, status].filter(Boolean).join(', ')}
              aria-haspopup="dialog"
              onPointerEnter={event => { if (event.pointerType !== 'touch') setHoveredId(method.id); }}
              onPointerLeave={() => setHoveredId(null)}
              onFocus={() => setFocusedId(method.id)}
              onBlur={() => setFocusedId(null)}
              onClick={event => {
                setHoveredId(null);
                onOpen(members.map(point => point.result.method.id), event.currentTarget);
              }}
              style={{ left: anchor.left, top: anchor.top }}
              className={`group absolute grid -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full outline-none ${largeTargets ? 'size-11' : 'size-9'}`}
            >
              <span className={`grid place-items-center rounded-full bg-surface shadow-sm group-hover:ring-2 group-hover:ring-accent group-focus-visible:ring-2 group-focus-visible:ring-accent ${border} ${grouped
                ? 'size-7 text-xs font-bold tabular-nums text-accent'
                : 'size-8'}`}>
                {grouped ? members.length : <GraphIcon method={method} />}
              </span>
            </button>
            {showTooltip && (
              <div
                aria-hidden="true"
                style={{
                  left: `clamp(6.5rem, ${anchor.left}px, calc(100% - 6.5rem))`,
                  top: anchor.top + (placeBelow ? 1 : -1) * markerSize / 2,
                }}
                className={`pointer-events-none absolute z-10 w-52 -translate-x-1/2 rounded-md border border-border-main bg-surface p-2.5 text-xs shadow-lg ${placeBelow ? '' : '-translate-y-full'}`}
              >
                <div className="font-semibold text-main">{name}</div>
                {status && <div className="mt-0.5 font-medium text-sub">{status}</div>}
                <div className="mt-0.5 text-sub">
                  {grouped ? (
                    <>
                      {members.slice(0, 3).map(point => point.result.method.name).join(', ')}
                      {members.length > 3 && ` and ${members.length - 3} more`}
                    </>
                  ) : values}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
