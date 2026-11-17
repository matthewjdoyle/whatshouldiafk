import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { compareMethods, createScale, getAxisLabel, getMetric } from './graphData';
import type { GraphPoint, MetricId } from './graphData';
import { findClosestPoint, getIconPoints, groupCoincidentPoints } from './scatterPoints';
import GraphIcon from './GraphIcon';
import MethodPopout from './MethodPopout';

interface Props {
  points: GraphPoint[];
  xMetric: MetricId;
  yMetric: MetricId;
  logX: boolean;
  logY: boolean;
}

const idleIconSize = 28;
const idleIconGap = 6;

export default function ScatterPlot({ points, xMetric, yMetric, logX, logY }: Props) {
  const plotRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const buttonsRef = useRef(new Map<string, HTMLButtonElement>());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  if (selectedId !== null && !points.some(point => point.result.method.id === selectedId)) setSelectedId(null);

  const closePopout = useCallback((restoreFocus: boolean) => {
    setSelectedId(null);
    if (restoreFocus) (triggerRef.current?.isConnected ? triggerRef.current : plotRef.current)?.focus({ preventScroll: true });
  }, [setSelectedId]);

  const { width, height } = size;
  const left = width < 420 ? 66 : 78;
  const right = width - 44;
  const top = 44;
  const bottom = height - 57;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const ready = plotWidth > 0 && plotHeight > 0;
  const xAxis = getMetric(xMetric);
  const yAxis = getMetric(yMetric);
  const xLabel = getAxisLabel(xMetric, logX);
  const yLabel = getAxisLabel(yMetric, logY);
  const targetSize = width < 480 || window.matchMedia('(pointer: coarse)').matches ? 44 : 28;
  const { xScale, yScale, plotted, spots, iconPoints } = useMemo(() => {
    const xScale = createScale(points.map(point => point.x), xMetric, Math.max(2, Math.floor(plotWidth / 85)), { logarithmic: logX });
    const yScale = createScale(points.map(point => point.y), yMetric, 5, { logarithmic: logY });
    const plotted = ready ? [...points].sort((a, b) => compareMethods(a.result, b.result)).map(point => ({
      ...point,
      id: point.result.method.id,
      left: left + plotWidth * xScale.position(point.x),
      top: bottom - plotHeight * yScale.position(point.y),
    })) : [];
    return { xScale, yScale, plotted, spots: groupCoincidentPoints(plotted), iconPoints: getIconPoints(plotted, idleIconSize, idleIconGap) };
  }, [points, xMetric, yMetric, logX, logY, plotWidth, plotHeight, ready, left, bottom]);
  const x = (value: number) => left + plotWidth * xScale.position(value);
  const y = (value: number) => bottom - plotHeight * yScale.position(value);
  const activeSpot = spots.find(spot => spot.members.some(point => point.id === activeMarker));
  const selectedSpot = spots.find(spot => spot.members.some(point => point.id === selectedId));
  const selectedIndex = selectedSpot?.members.findIndex(point => point.id === selectedId) ?? -1;
  const selected = selectedSpot?.members[selectedIndex];
  const popoutWidth = Math.min(320, width - 16);
  const popoutBelow = !!selected && selected.top < height / 2;
  const popoutTop = selected ? selected.top + (popoutBelow ? 48 : -48) : 0;
  const previewColumns = Math.min(activeSpot?.members.length ?? 1, Math.max(1, Math.floor((width - 16) / 80)));
  const previewWidth = previewColumns * 80;
  const previewHeight = Math.ceil((activeSpot?.members.length ?? 1) / previewColumns) * 80;
  const previewLeft = activeSpot && activeSpot.members.length > 1
    ? Math.max(previewWidth / 2 + 8, Math.min(width - previewWidth / 2 - 8, activeSpot.left)) : activeSpot?.left;
  const previewTop = activeSpot && activeSpot.members.length > 1
    ? Math.max(previewHeight / 2 + 8, Math.min(height - previewHeight / 2 - 8, activeSpot.top)) : activeSpot?.top;

  const isInPopout = (target: EventTarget | null) => target instanceof Element && !!target.closest('#scatter-method-popout');
  const spotAtPointer = (event: { clientX: number; clientY: number }) => {
    const bounds = plotRef.current?.getBoundingClientRect();
    return bounds ? findClosestPoint(spots, event.clientX - bounds.left, event.clientY - bounds.top, targetSize / 2) : null;
  };
  const selectMethod = (id: string) => {
    triggerRef.current = buttonsRef.current.get(id) ?? null;
    setHoveredId(null);
    setSelectedId(current => current === id ? null : id);
  };
  const previewPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || isInPopout(event.target)) return;
    setHoveredId(spotAtPointer(event)?.members[0].id ?? null);
  };

  return (
    <div
      ref={plotRef}
      role="group"
      tabIndex={-1}
      aria-label={`Scatter plot of ${yLabel} against ${xLabel}`}
      onPointerMove={previewPointer}
      onPointerLeave={() => setHoveredId(null)}
      onClick={event => {
        if (event.detail === 0 || isInPopout(event.target)) return;
        const spot = spotAtPointer(event);
        if (spot) selectMethod(spot.members[0].id);
      }}
      style={{ cursor: hoveredId ? 'pointer' : undefined }}
      className="relative h-[640px] sm:h-[800px]"
    >
      {ready && (
        <svg width={width} height={height} aria-hidden="true" className="pointer-events-none absolute inset-0">
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
          <text x={(left + right) / 2} y={height - 10} textAnchor="middle" className="fill-main text-xs font-medium">{xLabel}</text>
          <text transform={`translate(15 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle" className="fill-main text-xs font-medium">{yLabel}</text>
        </svg>
      )}
      {plotted.map(point => {
        const { method } = point.result;
        const status = point.profitStatus === 'profit' ? 'Profitable' : point.profitStatus === 'loss' ? 'Loss-making' : '';
        const values = `${xAxis.format(point.x)} · ${yAxis.format(point.y)}`;
        const dotColor = point.profitStatus === 'profit' ? 'bg-profit' : point.profitStatus === 'loss' ? 'bg-loss' : 'bg-accent';
        const showIcon = iconPoints.has(point);
        const showingPreview = !selected && activeSpot?.members.includes(point);
        return (
          <button
            key={method.id}
            ref={button => { if (button) buttonsRef.current.set(method.id, button); else buttonsRef.current.delete(method.id); }}
            type="button"
            data-method-id={method.id}
            aria-label={[method.name, values, status].filter(Boolean).join(', ')}
            aria-haspopup="dialog"
            aria-expanded={selectedId === method.id}
            aria-controls={selectedId === method.id ? 'scatter-method-popout' : undefined}
            onFocus={() => setFocusedId(method.id)}
            onBlur={() => setFocusedId(null)}
            onClick={event => { if (event.detail === 0) selectMethod(method.id); }}
            style={{ left: point.left, top: point.top, width: targetSize, height: targetSize }}
            className="pointer-events-none absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span data-idle-icon={showIcon ? '' : undefined} className={`flex items-center justify-center ${showingPreview ? 'invisible' : ''}`}>
              {showIcon ? <GraphIcon method={method} size={idleIconSize} /> : <span className={`size-2.5 rounded-full ${dotColor}`} />}
            </span>
          </button>
        );
      })}
      {activeSpot && !selected && (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          <div
            data-scatter-preview=""
            style={{ left: previewLeft, top: previewTop, width: previewWidth, height: previewHeight }}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-wrap items-center justify-center"
          >
            {activeSpot.members.map(point => (
              <span key={point.id} data-preview-method-id={point.id} className="flex size-20 shrink-0 items-center justify-center">
                <GraphIcon method={point.result.method} size={80} />
              </span>
            ))}
            <div
              style={{ left: '50%', width: 208 }}
              className={`absolute -translate-x-1/2 rounded-md bg-surface p-2 text-center text-xs shadow-lg ${(previewTop ?? 0) > height - previewHeight / 2 - 80 ? 'bottom-full mb-1' : 'top-full mt-1'}`}
            >
              <p className="font-semibold text-main">{activeSpot.members.length === 1 ? activeSpot.members[0].result.method.name : `${activeSpot.members.length} methods at this point`}</p>
              <p className="mt-0.5 text-sub">{xAxis.format(activeSpot.members[0].x)} · {yAxis.format(activeSpot.members[0].y)}</p>
            </div>
          </div>
        </div>
      )}
      {selected && selectedSpot && (
        <MethodPopout
          key={selectedSpot.members[0].id}
          result={selected.result}
          index={selectedIndex}
          count={selectedSpot.members.length}
          onNext={() => setSelectedId(selectedSpot.members[(selectedIndex + 1) % selectedSpot.members.length].id)}
          left={Math.max(8, Math.min(width - popoutWidth - 8, selected.left - popoutWidth / 2))}
          top={popoutTop}
          width={popoutWidth}
          maxHeight={(popoutBelow ? height - popoutTop : popoutTop) - 8}
          below={popoutBelow}
          triggerRef={triggerRef}
          onClose={closePopout}
        />
      )}
    </div>
  );
}
