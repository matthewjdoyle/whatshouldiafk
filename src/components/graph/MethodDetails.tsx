import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import type { MethodResult } from '../../calculations/profit';
import { formatAfk } from '../methodPresentation';
import { formatNumber, getMetric, getMetricValue, getProfitStatus, hasPrices } from './graphData';
import GraphIcon from './GraphIcon';

interface Props {
  results: MethodResult[];
  onClose: () => void;
}

function MethodStats({ result }: { result: MethodResult }) {
  const { method } = result;
  const profit = getMetricValue(result, 'profit');
  const cost = hasPrices(result, true) ? result.costPerHour : null;
  const revenue = hasPrices(result, false) ? result.revenuePerHour : null;
  const rates = [
    ['XP/hr', formatNumber(method.xp.perHour)],
    ['Typical AFK time', formatAfk(method.afk.typicalSeconds)],
    ['Interactions/hr', formatNumber(method.afk.interactionsPerHour)],
  ];
  const economics = [
    { label: 'Net GP/hr', value: profit === null ? 'Unavailable' : getMetric('profit').format(profit), color: profit ? (profit > 0 ? 'text-profit' : 'text-loss') : 'text-main' },
    { label: 'Cost/hr', value: cost === null ? 'Unavailable' : `${formatNumber(cost)} GP/hr`, color: 'text-main' },
    { label: 'Revenue/hr after GE tax', value: revenue === null ? 'Unavailable' : `${formatNumber(revenue)} GP/hr`, color: 'text-main' },
  ];

  return (
    <div className="mt-4 space-y-5">
      <dl className="grid grid-cols-2 gap-3 rounded-md border border-border-main bg-app p-3 sm:grid-cols-3">
        {rates.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-sub">{label}</dt>
            <dd className="mt-1 text-sm font-semibold text-main tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <section aria-label="Hourly GE breakdown">
        <h4 className="mb-1 text-sm font-semibold text-main">Hourly GE breakdown</h4>
        <dl className="divide-y divide-border-sub text-sm">
          {economics.map(({ label, value, color }) => (
            <div key={label} className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-sub">{label}</dt>
              <dd className={`shrink-0 text-right font-medium tabular-nums ${color}`}>{value}</dd>
            </div>
          ))}
        </dl>
        {profit === null && <p className="mt-1 text-xs text-sub">Some GE prices are unavailable for this method.</p>}
      </section>
      <section aria-label="Requirements">
        <h4 className="mb-1 text-sm font-semibold text-main">Requirements</h4>
        {method.requirements.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-sub">
            {method.requirements.map(requirement => <li key={requirement}>{requirement}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-sub">No additional requirements listed.</p>
        )}
      </section>
    </div>
  );
}

export default function MethodDetails({ results, onClose }: Props) {
  const [selectedId, setSelectedId] = useState(results.length === 1 ? results[0].method.id : null);
  const selected = results.find(result => result.method.id === selectedId);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) dialog?.showModal();
    headingRef.current?.focus();
  }, [selectedId]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="graph-detail-title"
      onClose={onClose}
      className="fixed m-auto max-h-[85dvh] w-11/12 max-w-lg overflow-y-auto rounded-lg border border-border-main bg-surface p-4 text-main shadow-2xl backdrop:bg-black/60 sm:p-6"
    >
      {selected && results.length > 1 && (
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="mb-3 inline-flex cursor-pointer items-center gap-1 rounded text-sm text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ChevronLeft aria-hidden="true" size={16} /> Back to overlapping methods
        </button>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {selected && <GraphIcon key={selected.method.id} method={selected.method} profitStatus={getProfitStatus(selected)} />}
          <div>
            <h3 id="graph-detail-title" ref={headingRef} tabIndex={-1} className="text-lg font-semibold leading-tight outline-none">
              {selected?.method.name ?? (results.length > 0 ? 'Overlapping methods' : 'Method unavailable')}
            </h3>
            {selected && <p className="mt-1 text-sm text-sub">{selected.method.skill} · Level {selected.method.level}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close method details"
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-md border border-border-main bg-app hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      {selected ? <MethodStats result={selected} /> : results.length > 0 ? (
        <>
          <p className="mt-2 text-sm text-sub">These methods are close together on the chart. Select one to see its details.</p>
          <ul className="mt-3 divide-y divide-border-sub">
            {results.map(result => {
              const { method } = result;
              const profitStatus = getProfitStatus(result);
              return (
                <li key={method.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(method.id)}
                    className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <GraphIcon method={method} profitStatus={profitStatus} />
                    <span className="text-sm font-medium">
                      {method.name}
                      {profitStatus && <span className="sr-only">{profitStatus === 'profit' ? ', profitable' : ', loss-making'}</span>}
                    </span>
                    <span className="ml-auto text-right text-xs text-sub">{method.skill}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm text-sub">This method is no longer in the filtered results.</p>
      )}
    </dialog>
  );
}
