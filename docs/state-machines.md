# App state machines

The GE controller owns asynchronous request state. The calculation layer owns what can be known from the current prices. Other interactions keep their state in the components that handle their events.

## Grand Exchange requests

[The React hook](../src/hooks/useMarketData.ts) starts and stops [the controller](../src/market/marketData.ts). Startup requests prices and mapping independently. The refresh button and the five-minute timer share the same refresh entry point. Each resource skips a trigger while its request is pending, and mapping stops retrying after its first success.

| Resource | Event | Transition |
|---|---|---|
| Prices | Startup or retry without a snapshot | `loading` → `ready` on success or `unavailable` on failure |
| Prices | Refresh with a snapshot | `ready` or `stale` → `refreshing` → `ready` on success or `stale` on failure |
| Mapping | Startup or refresh after failure | `loading` → `ready` on success or `unavailable` on failure |
| Both | App cleanup | Stop the timer, abort web requests, and ignore late results from the stopped session |

Only a successful price request replaces the snapshot and its timestamp. Refreshing and stale states retain both. [The transport](../src/market/marketTransport.ts) validates responses and gives each attempt 15 seconds. The [desktop commands](../src-tauri/src/lib.rs) use the existing Tauri bridge. Rejection, timeout, or unusable native data allows a web fallback. Partial data with usable quotes is valid. A missing or unusable item quote remains unknown.

## Derived results

[The calculation layer](../src/calculations/profit.ts) resolves fixed currency values, prefers the appropriate buy or sell quote with fallback to the other side, and applies GE tax. An unpriced nonzero input makes cost unavailable. An unpriced nonzero output makes revenue unavailable. Profit requires both totals, GP/XP also requires positive XP, and “Profitable only” requires known positive profit.

[App](../src/App.tsx) applies skill, XP, and AFK filters before the profitability filter, so both views can distinguish a base filter with no matches from a lack of confirmed profit. [The table](../src/components/MethodTable.tsx) shows available methods during startup, labels missing economics, and sorts unknown economic values after known ones in either direction. [The graph](../src/components/graph/MethodGraph.tsx) keeps price-independent plots usable, reports omitted methods with [the reason for each omission](../src/components/graph/graphData.ts), and only waits on prices when they can affect an empty plot. The header reports the price lifecycle. The Methods view reports mapping availability when GE Limit is visible.

## Local interactions

| Flow and owner | Events, states, and invariants |
|---|---|
| Tabs and FAQ · [App](../src/App.tsx) | Click, Arrow Left/Right, Home, and End select Methods, Graph, or Info. An economics link dispatches `open-faq`, selects Info, then scrolls to and briefly highlights its target. Leaving Methods or Graph unmounts that view. |
| Skill selection · [App](../src/App.tsx) | Trigger and backdrop open and close the selector. An empty selection means all skills. The first click narrows it to one, subsequent clicks toggle skills, and clearing restores all. The filters are shared by Methods and Graph. |
| Preferences · [App](../src/App.tsx), [storage hook](../src/hooks/useLocalStorage.ts) | Theme, filter, and column values initialize from their existing `afk-*` keys and write back on change. Storage errors leave defaults or the in-memory value usable. Theme changes also update the document's theme attribute. |
| Table sorting · [MethodTable](../src/components/MethodTable.tsx) | A new field starts with its default direction. A second click reverses it. The field and direction persist separately, including when the corresponding column is hidden. |
| Economics popover and item links · [MethodTable](../src/components/MethodTable.tsx) | Pointer entry opens and positions the portal. Leaving schedules a 150 ms close. Re-entry cancels it, and unmount clears the timer. Special economics buttons open FAQ sections. Item links try the desktop shell, then fall back to the browser if it fails. |
| Chart settings and omissions · [MethodGraph](../src/components/graph/MethodGraph.tsx) | The chart can be scatter or bar, with horizontal and vertical bars. Metrics and log switches retain separate settings for scatter and bar in `afk-graph`. Missing or invalid saved settings fall back to defaults. The native disclosure owns whether the omitted methods list is expanded. |
| Chart measurement and previews · [ScatterPlot](../src/components/graph/ScatterPlot.tsx), [RankedBars](../src/components/graph/RankedBars.tsx), [GraphIcon](../src/components/graph/GraphIcon.tsx) | ResizeObserver moves the plot from unmeasured to sized and updates layout. Scatter groups can change with geometry. Hover takes priority over focus, touch skips hover, and activation opens details. A missing or failed icon uses a marker. |
| Graph details · [MethodGraph](../src/components/graph/MethodGraph.tsx), [MethodDetails](../src/components/graph/MethodDetails.tsx) | A marker or bar opens a selected method or a chooser for overlapping methods. Selecting a method opens its detail, and Back returns to the chooser. A change in results can leave the original selection unavailable. Escape and Close use the native dialog close event and restore focus to the trigger or graph heading. |

Run `npm test` for request transition and economics regressions. Run `npm run build` followed by `npm run test:browser` for the Methods, Graph, and Info flows with controlled responses.
