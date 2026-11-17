import { useId, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { ChevronRight, X } from 'lucide-react';
import type { MethodResult } from '../../calculations/profit';
import { formatAfk } from '../methodPresentation';
import { formatNumber, getMetric, getMetricValue } from './graphData';
import GraphIcon from './GraphIcon';

interface Props {
  result: MethodResult;
  index: number;
  count: number;
  onNext: () => void;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  below: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: (restoreFocus: boolean) => void;
}

export default function MethodPopout({ result, index, count, onNext, left, top, width, maxHeight, below, triggerRef, onClose }: Props) {
  const popoutRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const { method, profitPerHour, costPerHour, revenuePerHour } = result;
  const gpXp = getMetricValue(result, 'gpXp');
  const profitColor = profitPerHour === null ? 'text-sub' : profitPerHour > 0 ? 'text-profit' : profitPerHour < 0 ? 'text-loss' : 'text-main';
  const stats = [
    { label: 'XP/hr', value: formatNumber(method.xp.perHour) },
    { label: 'Net GP/hr', value: profitPerHour === null ? 'Unavailable' : getMetric('profit').format(profitPerHour), color: profitColor },
    { label: 'Typical AFK time', value: formatAfk(method.afk.typicalSeconds) },
    { label: 'Interactions/hr', value: formatNumber(method.afk.interactionsPerHour) },
  ];

  useLayoutEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const isInside = (target: EventTarget | null) => target instanceof Node
      && (popoutRef.current?.contains(target) || trigger?.contains(target));
    const dismissOutside = (event: Event) => {
      if (!isInside(event.target)) onClose(false);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose(true);
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    document.addEventListener('keydown', dismissWithEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      document.removeEventListener('keydown', dismissWithEscape);
    };
  }, [triggerRef, onClose]);

  return (
    <div
      ref={popoutRef}
      id="scatter-method-popout"
      data-method-id={method.id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      style={{ left, top, width, maxHeight }}
      className={`custom-scrollbar absolute z-30 overflow-y-auto overscroll-contain rounded-lg border border-border-main bg-surface p-3 text-main shadow-xl ${below ? '' : '-translate-y-full'}`}
    >
      <div className="flex items-start gap-2.5">
        <GraphIcon key={method.id} method={method} size={56} />
        <div className="min-w-0 flex-1">
          <h3 ref={headingRef} id={titleId} tabIndex={-1} aria-live="polite" className="text-sm leading-snug font-semibold outline-none">{method.name}</h3>
          <p className="mt-1 text-xs text-sub">{method.skill} · Level {method.level}</p>
        </div>
        <button
          type="button"
          aria-label="Close method details"
          onClick={() => onClose(true)}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-sub hover:bg-surface-hover hover:text-main focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      {count > 1 && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-main pt-2">
          <p role="status" className="text-xs text-sub">{index + 1} of {count} methods at this point</p>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next method at this point"
            className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md bg-surface-hover px-2.5 text-xs font-medium text-accent hover:bg-app focus-visible:outline-2 focus-visible:outline-accent"
          >
            Next <ChevronRight aria-hidden="true" size={15} />
          </button>
        </div>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-border-main bg-app p-2.5">
        {stats.map(({ label, value, color }) => (
          <div key={label}>
            <dt className="text-[11px] text-sub">{label}</dt>
            <dd className={`mt-0.5 text-xs font-semibold tabular-nums ${color ?? 'text-main'}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <dl className="mt-2 divide-y divide-border-sub text-xs">
        {[
          { label: 'Net GP/XP', value: method.xp.perHour <= 0 ? '—' : gpXp === null ? 'Unavailable' : getMetric('gpXp').format(gpXp), color: profitColor },
          { label: 'Cost/hr', value: costPerHour === null ? 'Unavailable' : `${formatNumber(costPerHour)} GP` },
          { label: 'Revenue/hr after GE tax', value: revenuePerHour === null ? 'Unavailable' : `${formatNumber(revenuePerHour)} GP` },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-sub">{label}</dt>
            <dd className={`text-right font-medium tabular-nums ${color ?? 'text-main'}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 text-xs">
        <h4 className="font-semibold">Requirements</h4>
        <p className="mt-1 leading-relaxed text-sub">{method.requirements.join(', ') || 'No additional requirements listed.'}</p>
      </div>
      {result.itemPrices.length > 0 && (
        <details className="mt-3 border-t border-border-main pt-2 text-xs">
          <summary className="cursor-pointer rounded font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent">Economics & GE limits</summary>
          <ul className="mt-1 divide-y divide-border-sub">
            {result.itemPrices.map(item => (
              <li key={`${item.isInput}-${item.id}`} className="py-1.5">
                <div className="flex justify-between gap-3">
                  <span className={item.isInput ? 'text-loss-dim' : 'text-profit-dim'}>{item.name}</span>
                  <span className="shrink-0 tabular-nums">{item.price === null ? 'Unavailable' : `${formatNumber(item.price)} GP`}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-sub">
                  {item.isInput ? 'Input' : 'Output'} · {formatNumber(item.amountPerHour)}/hr
                  {item.isInput && item.limit ? ` · GE limit ${formatNumber(item.limit)}/4h` : ''}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
