import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { Method, ItemPrice, ItemMapping, MethodResult } from './calculations/profit';
import { calculateMethod } from './calculations/profit';
import methodsData from './data/methods.json';
import MethodTable from './components/MethodTable';
import { RefreshCcw, ChevronDown } from 'lucide-react';

function App() {
  const [methods] = useState<Method[]>(methodsData as Method[]);
  const [prices, setPrices] = useState<Record<string, ItemPrice>>({});
  const [mapping, setMapping] = useState<Record<string, ItemMapping>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Theme
  const [theme, setTheme] = useLocalStorage<'dark' | 'light' | 'rsmode'>('afk-theme', 'dark');

  // Filters
  const [minAfk, setMinAfk] = useLocalStorage<number>('afk-minAfk', 60);
  const [minXp, setMinXp] = useLocalStorage<number>('afk-minXp', 0);
  const [profitableOnly, setProfitableOnly] = useLocalStorage<boolean>('afk-profitableOnly', true);
  const [selectedSkills, setSelectedSkills] = useLocalStorage<string[]>('afk-selectedSkills', []);
  const [isSkillSelectorOpen, setIsSkillSelectorOpen] = useState(false);
  
  // Columns
  const [showAfkColumn, setShowAfkColumn] = useLocalStorage<boolean>('afk-showAfkColumn', true);
  const [showEconomicsColumn, setShowEconomicsColumn] = useLocalStorage<boolean>('afk-showEconomicsColumn', true);
  const [showGeLimitColumn, setShowGeLimitColumn] = useLocalStorage<boolean>('afk-showGeLimitColumn', true);
  const [showGpXpColumn, setShowGpXpColumn] = useLocalStorage<boolean>('afk-showGpXpColumn', true);

  const [activeTab, setActiveTab] = useState<'methods' | 'info'>('methods');

  const allSkills = Array.from(new Set(methods.map(m => m.skill))).sort();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let mappingRes: any;
      try {
        mappingRes = await invoke('fetch_mapping');
      } catch (e) {
        const res = await fetch('https://prices.runescape.wiki/api/v1/osrs/mapping');
        mappingRes = await res.json();
      }

      const mappingItems: Record<string, ItemMapping> = {};
      for (const item of mappingRes) {
        mappingItems[item.id.toString()] = {
          id: item.id,
          name: item.name,
          limit: item.limit,
          value: item.value,
          members: item.members
        };
      }
      setMapping(mappingItems);

      // prices
      let pricesRes: any;
      try {
        pricesRes = await invoke('fetch_prices');
      } catch (e) {
        const res = await fetch('https://prices.runescape.wiki/api/v1/osrs/latest');
        pricesRes = await res.json();
      }
      
      const latestPrices = pricesRes.data;
      setPrices(latestPrices);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh prices every minute
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const results: MethodResult[] = methods.map(m => calculateMethod(m, prices, mapping));

  const filteredResults = results.filter(r => {
    if (r.method.afk.typicalSeconds < minAfk) return false;
    if (r.method.xp.perHour < minXp) return false;
    if (profitableOnly && r.profitPerHour <= 0) return false;
    if (selectedSkills.length > 0 && !selectedSkills.includes(r.method.skill)) return false;
    return true;
  });

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
    <div className="min-h-screen bg-app text-main p-8 w-full">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-center pb-4 border-b border-sub">
          <div>
            <h1 className="text-2xl font-bold text-accent">What should I AFK?</h1>
            <p className="text-muted text-sm mt-1">Compare OSRS AFK training methods using real-time GE profit margins.</p>
          </div>
          <div className="flex items-center space-x-4 mt-4 md:mt-0">
            <div className="relative flex items-center">
              <select
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
            <span className="text-sm text-muted">
              {lastUpdated ? `Prices updated ${lastUpdated.toLocaleTimeString()}` : 'Loading...'}
            </span>
            <button 
              onClick={fetchData}
              disabled={loading}
              className="p-2 bg-surface rounded hover:bg-surface-hover transition disabled:opacity-50 cursor-pointer text-main"
            >
              <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        <div className="flex space-x-6 border-b border-sub pb-2">
          <button 
            onClick={() => setActiveTab('methods')}
            className={`font-medium pb-2 border-b-2 transition-colors cursor-pointer ${activeTab === 'methods' ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-sub'}`}
          >
            Methods
          </button>
          <button 
            onClick={() => setActiveTab('info')}
            className={`font-medium pb-2 border-b-2 transition-colors cursor-pointer ${activeTab === 'info' ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-sub'}`}
          >
            Info & FAQ
          </button>
        </div>

        {activeTab === 'methods' ? (
          <>
            <section className="bg-surface p-4 rounded-lg flex flex-wrap gap-6 items-center z-10 relative">
              <div className="flex flex-col relative">
                <label className="text-xs text-muted mb-1">Skill Filter</label>
                <button
                  onClick={() => setIsSkillSelectorOpen(!isSkillSelectorOpen)}
                  className="bg-input border border-main hover:border-sub focus:border-accent focus:ring-1 focus:ring-accent rounded py-1.5 px-3 text-sm outline-none text-main cursor-pointer min-w-32 flex justify-between items-center transition-colors"
                >
                  <span>{selectedSkills.length === 0 ? 'All Skills' : `${selectedSkills.length} selected`}</span>
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
                <label className="text-xs text-muted mb-1">AFK Time (seconds)</label>
                <div className="relative flex items-center">
                  <select 
                    value={minAfk} 
                    onChange={e => setMinAfk(Number(e.target.value))}
                    className="appearance-none w-full bg-input border border-main hover:border-sub focus:border-accent focus:ring-1 focus:ring-accent rounded py-1.5 pl-3 pr-8 text-sm outline-none text-main cursor-pointer transition-colors"
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
                <label className="text-xs text-muted mb-1">Minimum XP/hr</label>
                <div className="relative flex items-center">
                  <select 
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

              <label className="flex items-center space-x-2 text-sm mt-4 cursor-pointer text-main">
                <input 
                  type="checkbox" 
                  checked={profitableOnly}
                  onChange={e => setProfitableOnly(e.target.checked)}
                  className="rounded bg-input border-main text-accent focus:ring-accent cursor-pointer"
                />
                <span>Profitable only</span>
              </label>

              <div className="flex flex-col border-l border-main pl-6 ml-auto">
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
              </div>
            </section>

            <MethodTable 
              results={filteredResults} 
              loading={loading && !lastUpdated} 
              showAfkColumn={showAfkColumn}
              showEconomicsColumn={showEconomicsColumn}
              showGeLimitColumn={showGeLimitColumn}
              showGpXpColumn={showGpXpColumn}
            />
          </>
        ) : (
          <div className="bg-surface p-8 rounded-lg text-sub space-y-6">
            <h2 className="text-2xl font-bold text-main mb-4">Frequently Asked Questions</h2>
            
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-accent">Why do the prices in this app differ from the official GE website?</h3>
              <p>
                The official Jagex website shows the "GE Guide Price," which only updates once per day and is artificially restricted by Jagex so that it cannot change by more than 5% in a single day. Because of this limit, the official website often heavily lags behind an item's true street value.
              </p>
              <p>
                This app uses the <strong>OSRS Wiki Prices API</strong>, which is powered by real-time crowdsourced data from RuneLite users. It tracks the exact GP amounts that items are actually being traded for right this second. It looks at the actual active high (insta-buy) and low (insta-sell) margins to give you a much more accurate estimate of true profit.
              </p>
              <p className="text-profit font-medium">
                In short: The prices shown here are more accurate than the official Jagex website because they reflect live, real-world trading data!
              </p>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-accent">Where do the AFK Time and XP/hr numbers come from?</h3>
              <p>
                All AFK times (uninterrupted typical seconds before requiring an interaction) and XP/hr rates are carefully referenced from the official <a href="https://oldschool.runescape.wiki/" target="_blank" rel="noreferrer" className="text-accent hover:underline">OSRS Wiki</a>. These are accurate estimations based on realistic high-level setups and modern mechanics (such as the automatic casting time of Plank Make or fixed timers for Shooting Stars).
              </p>
            </div>

            <div id="crab-profit" className="space-y-2 p-4 rounded-md">
              <h3 className="text-lg font-semibold text-accent">How is the Gemstone Crab profit calculated?</h3>
              <p>
                The profit displayed for the Gemstone Crab is an <strong>average expected value per hour</strong>, calculated using the official drop rates from the OSRS Wiki.
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
                The profit displayed for Motherlode Mine is an <strong>average expected value per hour</strong>, calculated based on the ore distribution for a player with roughly Level 85 Mining.
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
                The profit displayed for Infernal Eels is an <strong>average expected value per hour</strong> based on the loot table from smashing them with a hammer.
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
                The profit displayed for Sailing shipwrecks (Mercenary, Fremennik, and Merchant) is an <strong>average expected value per hour</strong> based on the loot tables from sorting the salvage.
              </p>
              <p>
                Because the raw salvage itself (Opulent, Fremennik, Martial) is untradeable, we multiply the OSRS Wiki's estimated salvage catches per hour by the drop rate of every tradeable item in the sorting loot table. We then fetch live GE prices for all of these constituent items to give you a highly accurate, dynamic profit estimation. 
              </p>
            </div>

            <div id="plank-make-profit" className="space-y-2 p-4 rounded-md">
              <h3 className="text-lg font-semibold text-accent">How is the Plank Make profit calculated?</h3>
              <p>
                The profit displayed for Plank Make methods is an <strong>average expected value per hour</strong>, calculated by simulating 960 casts per hour (typical for auto-casting).
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
        )}
      </div>
    </div>
  );
}

export default App;
