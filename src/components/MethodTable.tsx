import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { MethodResult } from '../calculations/profit';
import { formatGp } from '../calculations/profit';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';

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
              displayPrice = ip.price * roundedRatio;
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
                  } catch (err) {
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }
                }}
                className={`text-left cursor-pointer bg-transparent border-none p-0 ${ip.isInput ? 'text-loss-dim' : 'text-profit-dim'} hover:underline truncate mr-2`}
              >
                {prefix}{ip.name}
              </button>
              <span className="text-muted whitespace-nowrap">
                {displayPrice.toLocaleString()} gp
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

                let valStr = ip.price.toLocaleString();
                if (result.method.id.includes('plank-make')) {
                  valStr = `${(ip.amountPerHour / 960).toLocaleString()} x ${ip.price.toLocaleString()} gp`;
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
              if (result.method.id === 'merchant-shipwrecks') volumeText = '280 salvage sorted / hr';
              else if (result.method.id === 'fremennik-shipwrecks') volumeText = '310 salvage sorted / hr';
              else if (result.method.id === 'mercenary-shipwrecks') volumeText = '315 salvage sorted / hr';
              else if (result.method.id === 'gemstone-crab') volumeText = '18 gem rolls / hr';
              else if (result.method.id === 'infernal-eels') volumeText = '315 eels smashed / hr';
              else if (result.method.id === 'motherlode-mine-upper') volumeText = '600 pay-dirts cleaned / hr';
              else if (result.method.id.includes('plank-make')) volumeText = '960 planks made / hr';
              
              if (!volumeText) return null;
              return (
                <div className="mt-2 pt-2 border-t border-main text-xs text-muted text-center">
                  Estimated {volumeText}
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
  loading: boolean;
  showAfkColumn?: boolean;
  showEconomicsColumn?: boolean;
  showGeLimitColumn?: boolean;
  showGpXpColumn?: boolean;
}

const MethodTable: React.FC<Props> = ({ results, loading, showAfkColumn = true, showEconomicsColumn = true, showGeLimitColumn = true, showGpXpColumn = true }) => {
  const [sortField, setSortField] = useLocalStorage<'profit' | 'xp' | 'afk' | 'sustain' | 'gpxp'>('afk-sortField', 'profit');
  const [sortDesc, setSortDesc] = useLocalStorage<boolean>('afk-sortDesc', true);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(true);
    }
  };

  const sortedResults = [...results].sort((a, b) => {
    let aVal = 0;
    let bVal = 0;
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
        aVal = a.method.xp.perHour > 0 ? a.profitPerHour / a.method.xp.perHour : (a.profitPerHour > 0 ? 999999 : -999999);
        bVal = b.method.xp.perHour > 0 ? b.profitPerHour / b.method.xp.perHour : (b.profitPerHour > 0 ? 999999 : -999999);
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
    return sortDesc ? bVal - aVal : aVal - bVal;
  });

  const formatAfk = (seconds: number) => {
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return s > 0 ? `${m}m ${s}s` : `${m}m`;
    }
    return `${seconds}s`;
  };

  const renderSortIcon = (field: typeof sortField) => {
    if (sortField !== field) return null;
    return sortDesc ? <ArrowDown className="w-3 h-3 inline ml-1" /> : <ArrowUp className="w-3 h-3 inline ml-1" />;
  };

  const visibleColumnsCount = 4 + (showAfkColumn ? 1 : 0) + (showEconomicsColumn ? 1 : 0) + (showGeLimitColumn ? 1 : 0) + (showGpXpColumn ? 1 : 0);

  return (
    <div className="bg-surface rounded-lg overflow-hidden border border-main">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-app text-muted border-b border-main">
            <tr>
              <th className="p-4 font-medium">Method</th>
              <th className="p-4 font-medium">Skill</th>
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
            {loading ? (
              <tr>
                <td colSpan={visibleColumnsCount} className="p-8 text-center text-muted animate-pulse">
                  Loading latest GE prices...
                </td>
              </tr>
            ) : sortedResults.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnsCount} className="p-8 text-center text-muted">
                  No methods match your filters.
                </td>
              </tr>
            ) : (
              sortedResults.map((result) => {
                const { method, profitPerHour } = result;
                const isProfitable = profitPerHour > 0;
                const iconItemId = method.outputs.length > 0 ? method.outputs[0].id : (method.inputs.length > 0 ? method.inputs[0].id : null);

                return (
                  <tr key={method.id} className="hover:bg-surface-hover/50 transition">
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        {(method.iconUrl || iconItemId) && (
                          <img 
                            src={method.iconUrl || `https://static.runelite.net/cache/item/icon/${iconItemId}.png`} 
                            alt=""
                            className="w-8 h-8 object-contain"
                          />
                        )}
                        <div>
                          <div className="font-medium text-main">{method.name}</div>
                          <div className="text-xs text-muted mt-0.5">{method.requirements.join(', ')}</div>
                        </div>
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
                    <td className={`p-4 font-medium ${isProfitable ? 'text-profit' : 'text-loss'}`}>
                      {formatGp(profitPerHour)}
                    </td>
                    {showGpXpColumn && (
                      <td className={`p-4 font-medium ${isProfitable ? 'text-profit' : 'text-loss'}`}>
                        {method.xp.perHour > 0 ? (
                          <span>{(profitPerHour / method.xp.perHour) > 0 ? '+' : ''}{(profitPerHour / method.xp.perHour).toFixed(2)}</span>
                        ) : '-'}
                      </td>
                    )}
                    {showEconomicsColumn && (
                      <td className="p-4 text-xs relative">
                        <EconomicsCell result={result} />
                      </td>
                    )}
                    {showGeLimitColumn && (
                      <td className="p-4 text-xs text-muted">
                        {result.itemPrices.filter(ip => ip.isInput).map((ip) => (
                          <div key={ip.id} className="flex justify-between items-center w-32">
                            <span className="truncate pr-2">{ip.name}</span>
                            <span>{ip.limit ? `${ip.limit.toLocaleString()}/4h` : '-'}</span>
                          </div>
                        ))}
                        {result.itemPrices.filter(ip => ip.isInput).length === 0 && (
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
    </div>
  );
};

export default MethodTable;
