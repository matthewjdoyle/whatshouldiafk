import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { MethodResult } from '../calculations/profit';
import { formatGp, getGpPerXp } from '../calculations/profit';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { formatAfk, getMethodIconUrl } from './methodPresentation';

const EconomicsCell: React.FC<{ result: MethodResult }> = ({ result }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, right: 0, bottom: 0 });
  const timeoutRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
      });
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const isSpecialEconomics = ['gemstone-crab', 'infernal-eels', 'motherlode-mine-upper', 'mercenary-shipwrecks', 'merchant-shipwrecks', 'fremennik-shipwrecks'].includes(result.method.id) || result.method.id.includes('plank-make');

  if (!isSpecialEconomics) {
    const baseInput = result.method.inputs.length > 0 ? result.method.inputs[0] : null;

    return (
      <>
        {result.itemPrices.map((ip) => {
          let prefix = '';
          let displayPrice = ip.price;
          
          if (baseInput && ip.amountPerHour > 0 && baseInput.amountPerHour > 0) {
            let ratio = ip.amountPerHour / baseInput.amountPerHour;

            if (result.method.id === 'cannonballs-double') {
              if (ip.id === 2) ratio = 8; // 8x cannonballs
              if (ip.id === 2353) ratio = 2; // 2x bars per action
            }

            if (ratio > 1 && Math.abs(ratio - Math.round(ratio)) < 0.01) {
              const roundedRatio = Math.round(ratio);
              prefix = `${roundedRatio}x `;
              if (displayPrice !== null) displayPrice *= roundedRatio;
            }
          }

          return (
            <div key={ip.id} className="flex justify-between items-center w-40">
              <button
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  const url = `https://secure.runescape.com/m=itemdb_oldschool/${encodeURIComponent(ip.name).replace(/%20/g, '+')}/viewitem?obj=${ip.id}`;
                  try {
                    const { open } = await import('@tauri-apps/plugin-shell');
                    await open(url);
                  } catch {
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }
                }}
                className={`text-left cursor-pointer bg-transparent border-none p-0 ${ip.isInput ? 'text-loss-dim' : 'text-profit-dim'} hover:underline truncate mr-2`}
              >
                {prefix}{ip.name}
              </button>
              <span className="text-muted whitespace-nowrap">
                {displayPrice === null ? 'Unavailable' : `${displayPrice.toLocaleString()} gp`}
              </span>
            </div>
          );
        })}
      </>
    );
  }

  const popoutWidth = 288;
  const isOverflowingRight = typeof window !== 'undefined' ? coords.left + popoutWidth > window.innerWidth - 20 : false;
  
  const popoutStyle: React.CSSProperties = {
    position: 'fixed',
    top: coords.bottom,
    ...(isOverflowingRight 
        ? { right: (typeof window !== 'undefined' ? window.innerWidth : 0) - coords.right }
        : { left: coords.left }),
    zIndex: 9999,
  };

  return (
    <div 
      className="flex items-center w-40 relative" 
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          let faqId = '';
          if (result.method.id === 'gemstone-crab') faqId = 'crab-profit';
          if (result.method.id === 'infernal-eels') faqId = 'eel-profit';
          if (result.method.id === 'motherlode-mine-upper') faqId = 'mlm-profit';
          if (result.method.id.includes('-shipwrecks')) faqId = 'salvage-profit';
          if (result.method.id.includes('plank-make')) faqId = 'plank-make-profit';
          if (faqId) {
            window.dispatchEvent(new CustomEvent('open-faq', { detail: faqId }));
          }
        }}
        className="text-left cursor-pointer hover:underline bg-transparent border-none p-0 text-profit-dim"
      >
        {result.method.id === 'gemstone-crab' && 'Average Gem Loot'}
        {result.method.id === 'infernal-eels' && 'Average Eel Loot'}
        {result.method.id === 'motherlode-mine-upper' && 'Average Pay-dirt Loot'}
        {result.method.id.includes('-shipwrecks') && 'Average Salvage Loot'}
        {result.method.id.includes('plank-make') && 'Cost Breakdown'}
      </button>
      
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div 
          style={popoutStyle}
          className="pt-2"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="w-72 p-3 bg-surface border border-main rounded shadow-xl">
            <div className="mb-2 text-sm font-medium text-main border-b border-main pb-1 flex justify-between items-end">
              <span>
                {result.method.id === 'gemstone-crab' && 'Gem table'}
                {result.method.id === 'infernal-eels' && 'Eel table'}
                {result.method.id === 'motherlode-mine-upper' && 'Pay-dirt table'}
                {result.method.id.includes('-shipwrecks') && 'Salvage table'}
                {result.method.id.includes('plank-make') && 'Cost Breakdown'}
              </span>
              <div className="flex gap-2 justify-end text-muted text-xs font-normal">
                {!result.method.id.includes('plank-make') && <span className="w-12 text-right">Rate</span>}
                <span className={result.method.id.includes('plank-make') ? "text-right" : "w-20 text-right"}>
                  {result.method.id.includes('plank-make') ? "Value" : "Value (gp)"}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              {result.itemPrices.length > 0 ? result.itemPrices.map((ip) => {
                let kph = 0;
                if (result.method.id === 'merchant-shipwrecks') kph = 280;
                else if (result.method.id === 'fremennik-shipwrecks') kph = 310;
                else if (result.method.id === 'mercenary-shipwrecks') kph = 315;
                else if (result.method.id === 'gemstone-crab') kph = 18;
                else if (result.method.id === 'infernal-eels') kph = 315;
                else if (result.method.id === 'motherlode-mine-upper') kph = 600;

                let rateStr = '';
                if (kph > 0 && ip.amountPerHour > 0) {
                  const perKill = ip.amountPerHour / kph;
                  if (perKill >= 1) {
                    rateStr = perKill.toFixed(2).replace(/\.00$/, '');
                  } else {
                    const denom = 1 / perKill;
                    if (denom >= 1000) rateStr = `1/${(denom / 1000).toFixed(1).replace(/\.0$/, '')}k`;
                    else rateStr = `1/${Math.round(denom)}`;
                  }
                }

                let valStr = 'Unavailable';
                if (ip.price !== null) {
                  valStr = ip.price.toLocaleString();
                  if (result.method.id.includes('plank-make')) {
                    valStr = `${(ip.amountPerHour / 960).toLocaleString()} x ${valStr} gp`;
                  }
                }

                return (
                  <div key={ip.id} className="flex justify-between items-center text-xs">
                    <span className={`${ip.isInput ? 'text-loss-dim' : 'text-profit-dim'} truncate mr-2 flex-1`}>{ip.name}</span>
                    <div className="flex items-center text-muted whitespace-nowrap gap-2 justify-end">
                      {!result.method.id.includes('plank-make') && <span className="w-12 text-right">{rateStr}</span>}
                      <span className={result.method.id.includes('plank-make') ? "text-right" : "w-20 text-right"}>{valStr}</span>
                    </div>
                  </div>
                );
              }) : (
                <div className="text-muted text-xs italic">See FAQ for dynamic rates.</div>
              )}
            </div>
            {(() => {
              let volumeText = '';
              let actionsPerHour = 0;
              const isPlankMake = result.method.id.includes('plank-make');

              if (result.method.id === 'merchant-shipwrecks') { volumeText = '280 salvage sorted / hr'; actionsPerHour = 280; }
              else if (result.method.id === 'fremennik-shipwrecks') { volumeText = '310 salvage sorted / hr'; actionsPerHour = 310; }
              else if (result.method.id === 'mercenary-shipwrecks') { volumeText = '315 salvage sorted / hr'; actionsPerHour = 315; }
              else if (result.method.id === 'gemstone-crab') { volumeText = '18 gem rolls / hr'; actionsPerHour = 18; }
              else if (result.method.id === 'infernal-eels') { volumeText = '315 eels smashed / hr'; actionsPerHour = 315; }
              else if (result.method.id === 'motherlode-mine-upper') { volumeText = '600 pay-dirts cleaned / hr'; actionsPerHour = 600; }
              else if (isPlankMake) { volumeText = '960 planks made / hr'; actionsPerHour = 960; }
              
              if (!volumeText) return null;

              const hourlyValue = isPlankMake ? result.profitPerHour : result.revenuePerHour;
              const perAction = hourlyValue === null ? null : Math.floor(hourlyValue / actionsPerHour);
              const valueColor = perAction === null ? 'text-muted' : perAction < 0 ? 'text-loss' : 'text-profit';

              return (
                <div className="mt-2 pt-2 border-t border-main text-xs text-muted text-center flex flex-col items-center">
                  <div>Estimated {volumeText}</div>
                  <div className="mt-1.5 font-medium text-main">
                    {isPlankMake ? 'Total profit / action: ' : 'Average value / roll: '}
                    <span className={valueColor}>
                      {perAction === null ? 'Unavailable' : `${perAction >= 0 ? '+' : ''}${perAction.toLocaleString()} gp`}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

interface Props {
  results: MethodResult[];
  emptyResultsMessage: string;
  showAfkColumn?: boolean;
  showEconomicsColumn?: boolean;
  showGeLimitColumn?: boolean;
  showGpXpColumn?: boolean;
}

const MethodTable: React.FC<Props> = ({ results, emptyResultsMessage, showAfkColumn = true, showEconomicsColumn = true, showGeLimitColumn = true, showGpXpColumn = true }) => {
  const [sortField, setSortField] = useLocalStorage<'profit' | 'xp' | 'afk' | 'sustain' | 'gpxp' | 'method' | 'skill'>('afk-sortField', 'profit');
  const [sortDesc, setSortDesc] = useLocalStorage<boolean>('afk-sortDesc', true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const bottomScrollbarRef = useRef<HTMLDivElement>(null);
  const synchronizedPositionsRef = useRef(new WeakMap<HTMLDivElement, number>());
  const [scrollSize, setScrollSize] = useState({ content: 0, viewport: 0 });
  const isOverflowing = scrollSize.content > scrollSize.viewport;

  const synchronizeScroll = useCallback((source: HTMLDivElement) => {
    const viewport = viewportRef.current;
    // Ignore rails whose dimensions have not caught up with a resize yet.
    if (!viewport || source.scrollWidth !== viewport.scrollWidth) return;
    for (const target of [viewport, bottomScrollbarRef.current]) {
      if (target && target.scrollWidth === viewport.scrollWidth) {
        if (target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
        synchronizedPositionsRef.current.set(target, target.scrollLeft);
      }
    }
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const table = tableRef.current;
    if (!viewport || !table) return;
    const measure = () => {
      const content = viewport.scrollWidth;
      const width = viewport.clientWidth;
      synchronizeScroll(viewport);
      setScrollSize(previous => previous.content === content && previous.viewport === width
        ? previous : { content, viewport: width });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(table);
    measure();
    return () => observer.disconnect();
  }, [synchronizeScroll]);

  useLayoutEffect(() => {
    if (viewportRef.current) synchronizeScroll(viewportRef.current);
  }, [scrollSize, synchronizeScroll]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const source = event.currentTarget;
    const viewport = viewportRef.current;
    const synchronizedPosition = synchronizedPositionsRef.current.get(source);
    // Native resize clamping can emit rail events before ResizeObserver runs.
    const maximum = viewport ? viewport.scrollWidth - viewport.clientWidth : 0;
    if (viewport && source !== viewport && synchronizedPosition !== undefined
      && synchronizedPosition > maximum && source.scrollLeft === maximum) {
      synchronizeScroll(viewport);
      return;
    }
    // Programmatic scroll events can arrive after the next user input. Do not echo them back.
    if (synchronizedPosition !== source.scrollLeft) synchronizeScroll(source);
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(true);
    }
  };

  const sortedResults = [...results].sort((a, b) => {
    if (sortField === 'method') {
      const cmp = a.method.name.localeCompare(b.method.name);
      return sortDesc ? cmp : -cmp; // true means A-Z first time
    }
    if (sortField === 'skill') {
      const cmp = a.method.skill.localeCompare(b.method.skill);
      return sortDesc ? cmp : -cmp;
    }

    let aVal: number | null = 0;
    let bVal: number | null = 0;
    switch (sortField) {
      case 'profit':
        aVal = a.profitPerHour;
        bVal = b.profitPerHour;
        break;
      case 'xp':
        aVal = a.method.xp.perHour;
        bVal = b.method.xp.perHour;
        break;
      case 'gpxp':
        aVal = getGpPerXp(a);
        bVal = getGpPerXp(b);
        break;
      case 'afk':
        aVal = a.method.afk.typicalSeconds;
        bVal = b.method.afk.typicalSeconds;
        break;
      case 'sustain':
        aVal = a.inputVolumeSustain ?? 99999;
        bVal = b.inputVolumeSustain ?? 99999;
        break;
    }
    if (aVal === null) return bVal === null ? 0 : 1;
    if (bVal === null) return -1;
    return sortDesc ? bVal - aVal : aVal - bVal;
  });

  const renderSortIcon = (field: typeof sortField) => {
    if (sortField !== field) return null;
    return sortDesc ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />;
  };

  const visibleColumnsCount = 5 + (showAfkColumn ? 1 : 0) + (showEconomicsColumn ? 1 : 0) + (showGeLimitColumn ? 1 : 0) + (showGpXpColumn ? 1 : 0);

  return (
    <div className="relative isolate min-w-0 max-w-full">
      <div ref={viewportRef} onScroll={handleScroll} className="method-table-scroll-viewport bg-surface rounded-lg border border-main overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" role="region" aria-label="AFK methods table" tabIndex={0}>
        <table ref={tableRef} className="w-full text-left text-sm whitespace-nowrap [&_th]:px-3 [&_td]:px-3">
          <thead className="bg-app text-muted border-b border-main">
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-14 min-w-14 bg-app shadow-[1px_0_0_var(--theme-border-main)]">
                <span className="sr-only">Method icon</span>
              </th>
              <th className="p-4 font-medium cursor-pointer hover:text-accent" onClick={() => handleSort('method')}>
                Method {renderSortIcon('method')}
              </th>
              <th className="p-4 font-medium cursor-pointer hover:text-accent" onClick={() => handleSort('skill')}>
                Skill {renderSortIcon('skill')}
              </th>
              {showAfkColumn && (
                <th className="p-4 font-medium cursor-pointer hover:text-accent" onClick={() => handleSort('afk')}>
                  AFK Time {renderSortIcon('afk')}
                </th>
              )}
              <th className="p-4 font-medium cursor-pointer hover:text-accent" onClick={() => handleSort('xp')}>
                XP/hr {renderSortIcon('xp')}
              </th>
              <th className="p-4 font-medium cursor-pointer hover:text-accent" onClick={() => handleSort('profit')}>
                Profit/hr {renderSortIcon('profit')}
              </th>
              {showGpXpColumn && (
                <th className="p-4 font-medium cursor-pointer hover:text-accent" onClick={() => handleSort('gpxp')}>
                  GP/XP {renderSortIcon('gpxp')}
                </th>
              )}
              {showEconomicsColumn && (
                <th className="p-4 font-medium">Economics</th>
              )}
              {showGeLimitColumn && (
                <th className="p-4 font-medium">
                  GE Limit
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-main">
            {sortedResults.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnsCount} className="p-8 text-center text-muted">
                  {emptyResultsMessage}
                </td>
              </tr>
            ) : (
              sortedResults.map((result) => {
                const { method, profitPerHour } = result;
                const gpPerXp = getGpPerXp(result);
                const profitColor = profitPerHour === null ? 'text-muted' : profitPerHour === 0 ? 'text-main' : profitPerHour > 0 ? 'text-profit' : 'text-loss';
                const iconUrl = getMethodIconUrl(method);

                return (
                  <tr key={method.id} className="group hover:bg-surface-hover transition-colors">
                    <td title={method.name} className="sticky left-0 z-10 w-14 min-w-14 bg-surface p-4 shadow-[1px_0_0_var(--theme-border-main)] group-hover:bg-surface-hover transition-colors">
                      {iconUrl && (
                        <img
                          src={iconUrl}
                          alt=""
                          className="w-8 h-8 shrink-0 object-contain"
                        />
                      )}
                    </td>
                    <td data-column="method" className="p-4 whitespace-normal">
                      <div className="w-48 min-w-0 [overflow-wrap:anywhere]">
                        <div className="font-medium text-main">{method.name}</div>
                        <div className="text-xs text-muted mt-0.5">{method.requirements.join(', ')}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="inline-flex w-max items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-surface-hover text-sub border border-main">
                        <img 
                          src={`https://oldschool.runescape.wiki/images/${method.skill}_icon.png`} 
                          alt={method.skill} 
                          title={method.skill}
                          className="w-4 h-4 object-contain shrink-0"
                        />
                        <span className="shrink-0">{method.level}</span>
                      </div>
                    </td>
                    {showAfkColumn && (
                      <td className="p-4">
                        <div className="text-main">{formatAfk(method.afk.typicalSeconds)}</div>
                        <div className="text-xs text-muted">{method.afk.interactionsPerHour} actions/hr</div>
                      </td>
                    )}
                    <td className="p-4 text-main">
                      {method.xp.perHour > 0 ? (method.xp.perHour / 1000).toFixed(1) + 'k' : '-'}
                    </td>
                    <td className={`p-4 font-medium ${profitColor}`}>
                      {profitPerHour === null ? 'Unavailable' : formatGp(profitPerHour)}
                    </td>
                    {showGpXpColumn && (
                      <td className={`p-4 font-medium ${gpPerXp === null ? 'text-muted' : profitColor}`}>
                        {method.xp.perHour <= 0 ? '-' : gpPerXp === null ? 'Unavailable' : `${gpPerXp > 0 ? '+' : ''}${gpPerXp.toFixed(2)}`}
                      </td>
                    )}
                    {showEconomicsColumn && (
                      <td className="p-4 text-xs relative">
                        <EconomicsCell result={result} />
                      </td>
                    )}
                    {showGeLimitColumn && (
                      <td className="p-4 text-xs text-muted">
                        {result.itemPrices.filter(ip => ip.isInput && ip.limit).map((ip) => (
                          <div key={ip.id} className="flex justify-between items-center w-32">
                            <span className="truncate pr-2">{ip.name}</span>
                            <span>{`${(ip.limit || 0).toLocaleString()}/4h`}</span>
                          </div>
                        ))}
                        {result.itemPrices.filter(ip => ip.isInput && ip.limit).length === 0 && (
                          <span>N/A</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div
        ref={bottomScrollbarRef}
        hidden={!isOverflowing}
        role="region"
        aria-label="Scroll methods table horizontally (bottom)"
        tabIndex={0}
        onScroll={handleScroll}
        className="method-table-scrollbar sticky bottom-0 z-20 mx-px h-5 overflow-x-auto overflow-y-hidden border-y border-main bg-surface shadow-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <div className="h-px" style={{ width: scrollSize.content }} />
      </div>
    </div>
  );
};

export default MethodTable;
