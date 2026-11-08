import { useEffect, useState } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useMarketData } from './hooks/useMarketData';
import type { Method } from './calculations/profit';
import { calculateMethod, hasConfirmedProfit } from './calculations/profit';
import methodsData from './data/methods.json';
import MethodTable from './components/MethodTable';
import MethodGraph from './components/graph/MethodGraph';
import { RefreshCcw, ChevronDown } from 'lucide-react';

const tabs = [
  { id: 'methods', label: 'Methods' },
  { id: 'graph', label: 'Graph' },
  { id: 'info', label: 'Info' },
] as const;

const methods = methodsData as Method[];
const allSkills = Array.from(new Set(methods.map(m => m.skill))).sort();

function App() {
  const { prices, mapping, refresh } = useMarketData();
  
  // Theme
  const [theme, setTheme] = useLocalStorage<'dark' | 'light' | 'rsmode'>('afk-theme', 'rsmode');

  // Filters
  const [minAfk, setMinAfk] = useLocalStorage<number>('afk-minAfk', 0);
  const [minXp, setMinXp] = useLocalStorage<number>('afk-minXp', 0);
  const [profitableOnly, setProfitableOnly] = useLocalStorage<boolean>('afk-profitableOnly', false);
  const [selectedSkills, setSelectedSkills] = useLocalStorage<string[]>('afk-selectedSkills', []);
  const [isSkillSelectorOpen, setIsSkillSelectorOpen] = useState(false);
  
  // Columns
  const [showAfkColumn, setShowAfkColumn] = useLocalStorage<boolean>('afk-showAfkColumn', true);
  const [showEconomicsColumn, setShowEconomicsColumn] = useLocalStorage<boolean>('afk-showEconomicsColumn', true);
  const [showGeLimitColumn, setShowGeLimitColumn] = useLocalStorage<boolean>('afk-showGeLimitColumn', false);
  const [showGpXpColumn, setShowGpXpColumn] = useLocalStorage<boolean>('afk-showGpXpColumn', false);

  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]['id']>('methods');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const latestPrices = 'data' in prices ? prices.data : {};
  const itemMapping = mapping.status === 'ready' ? mapping.data : {};
  const candidates = methods.filter(method => {
    if (method.afk.typicalSeconds < minAfk) return false;
    if (method.xp.perHour < minXp) return false;
    if (selectedSkills.length > 0 && !selectedSkills.includes(method.skill)) return false;
    return true;
  }).map(method => calculateMethod(method, latestPrices, itemMapping));
  const filteredResults = profitableOnly ? candidates.filter(hasConfirmedProfit) : candidates;

  let emptyResultsMessage = 'No methods match your filters.';
  if (profitableOnly && candidates.length > 0) {
    emptyResultsMessage = prices.status === 'loading' && candidates.some(result => result.profitPerHour === null)
      ? 'Waiting for GE prices to confirm profit…'
      : 'No methods with confirmed profit match your filters.';
  }

  const priceRequestPending = prices.status === 'loading' || prices.status === 'refreshing';
  const updatedTime = 'updatedAt' in prices ? prices.updatedAt.toLocaleTimeString() : '';
  const priceStatus = {
    loading: 'Loading GE prices…',
    ready: `Prices updated ${updatedTime}`,
    refreshing: `Refreshing GE prices… Last updated ${updatedTime}`,
    stale: `Refresh failed. Showing GE prices from ${updatedTime}.`,
    unavailable: 'GE prices unavailable.',
  }[prices.status];

  useEffect(() => {
    const handleOpenFaq = (e: Event) => {
      const customEvent = e as CustomEvent;
      setActiveTab('info');
      setTimeout(() => {
        const el = document.getElementById(customEvent.detail);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
          el.classList.add('bg-surface-hover', 'transition-colors', 'duration-1000');
          setTimeout(() => el.classList.remove('bg-surface-hover'), 2000);
        }
      }, 100);
    };
    window.addEventListener('open-faq', handleOpenFaq);
    return () => window.removeEventListener('open-faq', handleOpenFaq);
  }, []);

  return (
    <div className="min-h-screen bg-app text-main p-4 sm:p-8 w-full min-w-0">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-center gap-4 pb-4 border-b border-sub">
          <div>
            <h1 className="text-2xl font-bold text-accent">What should I AFK?</h1>
            <p className="text-muted text-sm mt-1">Compare OSRS AFK training methods using real-time GE profit margins.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 md:shrink-0">
            <div className="relative flex items-center">
              <select
                aria-label="Theme"
                value={theme}
                onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'rsmode')}
                className="appearance-none bg-input border border-main hover:border-sub focus:border-accent focus:ring-1 focus:ring-accent rounded py-1.5 pl-3 pr-8 text-sm outline-none text-main cursor-pointer transition-colors"
              >
                <option value="dark">Dark Mode</option>
                <option value="light">Light Mode</option>
                <option value="rsmode">RS Mode</option>
              </select>
              <ChevronDown className="w-4 h-4 text-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <div className="flex items-center gap-2">
              <span role="status" className="text-xs text-muted sm:text-sm">
                {priceStatus}
              </span>
              <button
                aria-label="Refresh GE prices"
                onClick={refresh}
                disabled={priceRequestPending}
                className="p-2 bg-surface rounded hover:bg-surface-hover transition disabled:opacity-50 cursor-pointer text-main"
              >
                <RefreshCcw aria-hidden="true" className={`w-4 h-4 ${priceRequestPending ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </header>

        <div role="tablist" aria-label="AFK guide" className="flex gap-5 sm:gap-6 border-b border-sub pb-2">
          {tabs.map(({ id, label }, index) => (
            <button
              key={id}
              id={`${id}-tab`}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`${id}-panel`}
              tabIndex={activeTab === id ? 0 : -1}
              onClick={() => setActiveTab(id)}
              onKeyDown={(event) => {
                let nextIndex: number;
                switch (event.key) {
                  case 'ArrowLeft': nextIndex = (index + tabs.length - 1) % tabs.length; break;
                  case 'ArrowRight': nextIndex = (index + 1) % tabs.length; break;
                  case 'Home': nextIndex = 0; break;
                  case 'End': nextIndex = tabs.length - 1; break;
                  default: return;
                }
                event.preventDefault();
                const next = tabs[nextIndex].id;
                setActiveTab(next);
                document.getElementById(`${next}-tab`)?.focus();
              }}
              className={`font-medium pb-2 border-b-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent ${activeTab === id ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-sub'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab !== 'info' && (
            <section aria-label="Method filters" className="bg-surface p-3 sm:p-4 rounded-lg grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-6 items-end sm:items-center z-10 relative">
              <div className="flex flex-col relative">
                <span id="skill-filter-label" className="text-xs text-muted mb-1">Skill Filter</span>
                <button
                  id="skill-filter"
                  aria-labelledby="skill-filter-label skill-filter-value"
                  aria-expanded={isSkillSelectorOpen}
                  onClick={() => setIsSkillSelectorOpen(!isSkillSelectorOpen)}
                  className="bg-input border border-main hover:border-sub focus:border-accent focus:ring-1 focus:ring-accent rounded py-1.5 px-3 text-sm outline-none text-main cursor-pointer sm:min-w-32 flex justify-between items-center transition-colors"
                >
                  <span id="skill-filter-value">{selectedSkills.length === 0 ? 'All Skills' : `${selectedSkills.length} selected`}</span>
                  <ChevronDown className="w-4 h-4 text-muted ml-2" />
                </button>

                {isSkillSelectorOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsSkillSelectorOpen(false)} 
                    />
                    <div className="absolute top-full mt-2 left-0 bg-surface border border-main rounded-lg shadow-xl p-2 z-20 w-40 max-h-96 overflow-y-auto">
                      <div className="grid grid-cols-3 gap-1.5">
                        {allSkills.map(skill => {
                          const isSelected = selectedSkills.includes(skill) || selectedSkills.length === 0;
                          return (
                            <button
                              key={skill}
                              aria-pressed={isSelected}
                              onClick={() => {
                                if (selectedSkills.length === 0) {
                                  setSelectedSkills([skill]);
                                } else {
                                  if (selectedSkills.includes(skill)) {
                                    const next = selectedSkills.filter(s => s !== skill);
                                    setSelectedSkills(next);
                                  } else {
                                    setSelectedSkills([...selectedSkills, skill]);
                                  }
                                }
                              }}
                              className={`flex items-center justify-center py-1.5 px-2 rounded transition-colors cursor-pointer ${
                                isSelected ? 'bg-surface-hover border-accent border shadow-sm' : 'bg-input opacity-50 border border-transparent hover:opacity-100'
                              }`}
                              title={skill}
                            >
                              <img 
                                src={`https://oldschool.runescape.wiki/images/${skill}_icon.png`} 
                                alt={skill} 
                                className="w-5 h-5 object-contain"
                              />
                            </button>
                          );
                        })}
                      </div>
                      {selectedSkills.length > 0 && (
                        <button 
                          onClick={() => setSelectedSkills([])}
                          className="mt-2 w-full text-xs text-accent hover:underline text-center cursor-pointer"
                        >
                          Clear Filter
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-col">
                <label htmlFor="min-afk" className="text-xs text-muted mb-1">AFK Time (seconds)</label>
                <div className="relative flex items-center">
                  <select 
                    id="min-afk"
                    value={minAfk} 
                    onChange={e => setMinAfk(Number(e.target.value))}
                    className="appearance-none w-full truncate bg-input border border-main hover:border-sub focus:border-accent focus:ring-1 focus:ring-accent rounded py-1.5 pl-3 pr-8 text-sm outline-none text-main cursor-pointer transition-colors"
                  >
                    <option value={0}>Any</option>
                    <option value={30}>≥ 30s (Semi-AFK)</option>
                    <option value={60}>≥ 60s (AFK)</option>
                    <option value={120}>≥ 2m (Very AFK)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="flex flex-col">
                <label htmlFor="min-xp" className="text-xs text-muted mb-1">Minimum XP/hr</label>
                <div className="relative flex items-center">
                  <select 
                    id="min-xp"
                    value={minXp} 
                    onChange={e => setMinXp(Number(e.target.value))}
                    className="appearance-none w-full bg-input border border-main hover:border-sub focus:border-accent focus:ring-1 focus:ring-accent rounded py-1.5 pl-3 pr-8 text-sm outline-none text-main cursor-pointer transition-colors"
                  >
                    <option value={0}>0</option>
                    <option value={20000}>20,000</option>
                    <option value={40000}>40,000</option>
                    <option value={60000}>60,000</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <label className="flex items-center space-x-2 text-sm py-2 sm:py-0 sm:mt-4 cursor-pointer text-main">
                <input 
                  type="checkbox" 
                  checked={profitableOnly}
                  onChange={e => setProfitableOnly(e.target.checked)}
                  className="rounded bg-input border-main text-accent focus:ring-accent cursor-pointer"
                />
                <span>Profitable only</span>
              </label>

              {activeTab === 'methods' && <div className="col-span-2 flex flex-col sm:border-l border-main sm:pl-6 sm:ml-auto">
                <label className="text-xs text-muted mb-1">Columns</label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center space-x-1.5 text-sm cursor-pointer text-main">
                    <input 
                      type="checkbox" 
                      checked={showAfkColumn}
                      onChange={e => setShowAfkColumn(e.target.checked)}
                      className="rounded bg-input border-main text-accent focus:ring-accent cursor-pointer"
                    />
                    <span>AFK Time</span>
                  </label>
                  <label className="flex items-center space-x-1.5 text-sm cursor-pointer text-main">
                    <input 
                      type="checkbox" 
                      checked={showGpXpColumn}
                      onChange={e => setShowGpXpColumn(e.target.checked)}
                      className="rounded bg-input border-main text-accent focus:ring-accent cursor-pointer"
                    />
                    <span>GP/XP</span>
                  </label>
                  <label className="flex items-center space-x-1.5 text-sm cursor-pointer text-main">
                    <input 
                      type="checkbox" 
                      checked={showEconomicsColumn}
                      onChange={e => setShowEconomicsColumn(e.target.checked)}
                      className="rounded bg-input border-main text-accent focus:ring-accent cursor-pointer"
                    />
                    <span>Economics</span>
                  </label>
                  <label className="flex items-center space-x-1.5 text-sm cursor-pointer text-main">
                    <input 
                      type="checkbox" 
                      checked={showGeLimitColumn}
                      onChange={e => setShowGeLimitColumn(e.target.checked)}
                      className="rounded bg-input border-main text-accent focus:ring-accent cursor-pointer"
                    />
                    <span>GE Limit</span>
                  </label>
                </div>
              </div>}
            </section>
        )}

        <div id="methods-panel" role="tabpanel" aria-labelledby="methods-tab" hidden={activeTab !== 'methods'}>
          {activeTab === 'methods' && (
            <>
              {showGeLimitColumn && mapping.status !== 'ready' && (
                <p role="status" className="mb-2 text-sm text-muted">
                  {mapping.status === 'loading' ? 'Loading GE buy limits…' : 'GE buy limits unavailable.'}
                </p>
              )}
              <MethodTable
                results={filteredResults}
                emptyResultsMessage={emptyResultsMessage}
                showAfkColumn={showAfkColumn}
                showEconomicsColumn={showEconomicsColumn}
                showGeLimitColumn={showGeLimitColumn}
                showGpXpColumn={showGpXpColumn}
              />
            </>
          )}
        </div>

        <div id="graph-panel" role="tabpanel" aria-labelledby="graph-tab" hidden={activeTab !== 'graph'}>
          {activeTab === 'graph' && (
            <MethodGraph results={filteredResults} priceLoading={prices.status === 'loading'} emptyResultsMessage={emptyResultsMessage} />
          )}
        </div>

        <div id="info-panel" role="tabpanel" aria-labelledby="info-tab" hidden={activeTab !== 'info'} className="bg-surface p-8 rounded-lg text-sub space-y-6">
            <h2 className="text-2xl font-bold text-main mb-4">How does what should I AFK know what I should AFK?</h2>
            
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-accent">Why do the prices in this app differ from the official GE website?</h3>
              <p>
                The official Jagex website shows the "GE Guide Price," which only updates once per day and is artificially restricted by Jagex so that it cannot change by more than 5% in a single day. Because of this limit, the official website often heavily lags behind an item's true street value.
              </p>
              <p>
                This app uses the OSRS Wiki Prices API, which is powered by real-time crowdsourced data from RuneLite users. It tracks the exact GP amounts that items are actually being traded for right this second. It looks at the actual active high (insta-buy) and low (insta-sell) margins to give you a much more accurate estimate of true profit.
              </p>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-accent">Where do the AFK Time and XP/hr numbers come from?</h3>
              <p>
                All AFK times (uninterrupted typical seconds before requiring an interaction) and XP/hr rates are carefully referenced from the official <a href="https://oldschool.runescape.wiki/" target="_blank" rel="noreferrer" className="text-accent hover:underline">OSRS Wiki</a>. These are accurate estimations based on realistic high-level setups and modern mechanics (such as the automatic casting time of Plank Make or fixed timers for Shooting Stars).
              </p>
            </div>

            <div className="space-y-2 p-4 rounded-md">
              <h3 className="text-lg font-semibold text-accent">What setups do the new processing methods assume?</h3>
              <p>
                Seeking Dragon Arrows (Engorged Tree) includes gathering untradeable sap and processing it into saleable arrows.
                We use the <a href="https://oldschool.runescape.wiki/w/Money_making_guide/Chopping_the_engorged_bloodwood_tree" target="_blank" rel="noreferrer" className="text-accent hover:underline">Wiki's full-chain estimate</a> of
                16 buckets per hour: 16 redwood logs, 1,680 feathers and 1,680 dragon arrows become 1,680 seeking dragon arrows.
                The listed 47,520 XP/hr is Woodcutting XP; processing also gives about 2,240 Fletching XP/hr.
                With a dragon axe, chopping offers about 118 uninterrupted seconds, followed by a separate 45-second draining step.
                Release any letvek in a bucket before chopping again. The 128 actions/hr estimate allows for gathering, processing and banking.
              </p>
              <p>
                Moonlight Antler Bolts assumes 1,800 antlers per hour with banking, producing 21,600 bolts and 21,780 Fletching XP.
                A batch of 27 antlers takes about 49 seconds, with roughly 67 batches per hour.
                See the <a href="https://oldschool.runescape.wiki/w/Money_making_guide/Fletching_moonlight_antler_bolts" target="_blank" rel="noreferrer" className="text-accent hover:underline">Wiki method guide</a>.
              </p>
              <p>
                Auto-crushing Lava Scales assumes 99 Herblore and the hard Wilderness Diary, averaging about 8.961 shards per scale.
                At an estimated 1,800 scales per hour including banking, this produces about 16,129.8 shards and no XP.
                The 47-second AFK window is for auto-crushing a batch of 27 scales; manually crushing is more intensive.
                Lower Herblore levels or no diary reduce the yield, so the displayed profit does not apply to those setups.
                See the <a href="https://oldschool.runescape.wiki/w/Lava_scale_shard" target="_blank" rel="noreferrer" className="text-accent hover:underline">Wiki yield table</a>.
              </p>
            </div>

            <div id="crab-profit" className="space-y-2 p-4 rounded-md">
              <h3 className="text-lg font-semibold text-accent">How is the Gemstone Crab profit calculated?</h3>
              <p>
                The profit displayed for the Gemstone Crab is an average expected value per hour, calculated using the official drop rates from the OSRS Wiki.
              </p>
              <p>
                A Gemstone Crab is mined exactly 3 times per kill by the top 16 damage dealers. Assuming a 10-minute AFK interval (6 crabs per hour), you get 18 gem rolls per hour. The drop rates are:
              </p>
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Uncut opal: 9/32 (28.1%)</li>
                <li>Uncut jade: 9/32 (28.1%)</li>
                <li>Uncut red topaz: 6/32 (18.75%)</li>
                <li>Uncut sapphire: 3/32 (9.375%)</li>
                <li>Uncut emerald: 2/32 (6.25%)</li>
                <li>Uncut ruby: 2/32 (6.25%)</li>
                <li>Uncut diamond: 1/32 (3.125%)</li>
                <li>Uncut dragonstone: 1/500 (0.2%)</li>
              </ul>
              <p>
                The economics column multiplies these probabilities by 18 rolls per hour and fetches real-time GE prices for each gem to give you an accurate hourly expected profit.
              </p>
            </div>

            <div id="mlm-profit" className="space-y-2 p-4 rounded-md">
              <h3 className="text-lg font-semibold text-accent">How is the Motherlode Mine profit calculated?</h3>
              <p>
                The profit displayed for Motherlode Mine is an average expected value per hour, calculated based on the ore distribution for a player with roughly Level 85 Mining.
              </p>
              <p>
                At this level, you can expect to mine and clean roughly 600 pay-dirt per hour. The average expected yield per hour (and their respective probabilities) is:
              </p>
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Coal: 189/hr (31.5%)</li>
                <li>Mithril ore: 175/hr (29.1%)</li>
                <li>Gold ore: 154/hr (25.7%)</li>
                <li>Adamantite ore: 62/hr (10.4%)</li>
                <li>Runite ore: 20/hr (3.3%)</li>
                <li>Golden nugget: 16.4/hr (2.74% flat rate)</li>
              </ul>
            </div>

            <div id="eel-profit" className="space-y-2 p-4 rounded-md">
              <h3 className="text-lg font-semibold text-accent">How is the Infernal Eel profit calculated?</h3>
              <p>
                The profit displayed for Infernal Eels is an average expected value per hour based on the loot table from smashing them with a hammer.
              </p>
              <p>
                At Level 80 Fishing, you catch roughly 315 eels per hour. Smashing them rolls on a loot table that yields:
              </p>
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Tokkul: ~4,000/hr</li>
                <li>Lava scale shards: ~300/hr (1/12 chance of yielding 1-3 shards)</li>
                <li>Onyx bolt tips: ~22/hr (1/12 chance of yielding 1 tip)</li>
              </ul>
            </div>

            <div id="salvage-profit" className="space-y-2 p-4 rounded-md">
              <h3 className="text-lg font-semibold text-accent">How is the Shipwreck Salvage profit calculated?</h3>
              <p>
                The profit displayed for Sailing shipwrecks (Mercenary, Fremennik, and Merchant) is an average expected value per hour based on the loot tables from sorting the salvage.
              </p>
              <p>
                Because the raw salvage itself (Opulent, Fremennik, Martial) is untradeable, we multiply the OSRS Wiki's estimated salvage catches per hour by the drop rate of every tradeable item in the sorting loot table. We then fetch live GE prices for all of these constituent items to give you a highly accurate, dynamic profit estimation. 
              </p>
            </div>

            <div id="plank-make-profit" className="space-y-2 p-4 rounded-md">
              <h3 className="text-lg font-semibold text-accent">How is the Plank Make profit calculated?</h3>
              <p>
                The profit displayed for Plank Make methods is an average expected value per hour, calculated by simulating 960 casts per hour (typical for auto-casting).
              </p>
              <p>
                We deduct the live GE cost of inputs, as well as the exact coin fee required to cast the spell on each specific log type, to give you a highly accurate, dynamic profit estimation.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-main">
              <h3 className="text-lg font-semibold text-accent">About</h3>
              <p>
                Created by Matthew Doyle. Check out my website at <a href="https://www.matthewd0yle.com" target="_blank" rel="noreferrer" className="text-accent hover:underline font-medium">www.matthewd0yle.com</a>
              </p>
            </div>
        </div>
      </div>
    </div>
  );
}

export default App;
