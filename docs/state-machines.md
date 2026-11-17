# App state machines

The GE and player controllers own their independent asynchronous request states. The calculation layer owns what can be known from the current prices. Other interactions keep their state in the components that handle their events.

## Grand Exchange requests

[The React hook](../src/hooks/useMarketData.ts) starts and stops [the controller](../src/market/marketData.ts). Startup requests prices and mapping independently. The refresh button and the five-minute timer share the same refresh entry point. Each resource skips a trigger while its request is pending, and mapping stops retrying after its first success.

| Resource | Event | Transition |
|---|---|---|
| Prices | Startup or retry without a snapshot | `loading` → `ready` on success or `unavailable` on failure |
| Prices | Refresh with a snapshot | `ready` or `stale` → `refreshing` → `ready` on success or `stale` on failure |
| Mapping | Startup or refresh after failure | `loading` → `ready` on success or `unavailable` on failure |
| Both | App cleanup | Stop the timer, abort web requests, and ignore late results from the stopped session |

Only a successful price request replaces the snapshot and its timestamp. Refreshing and stale states retain both. [The transport](../src/market/marketTransport.ts) validates responses and gives each attempt 15 seconds. The [desktop commands](../src-tauri/src/lib.rs) use the existing Tauri bridge. Rejection, timeout, or unusable native data allows a web fallback. Partial data with usable quotes is valid. A missing or unusable item quote remains unknown.

## Player levels and eligibility

[The player hook](../src/hooks/usePlayerData.ts) restores validated `afk-player-v1` storage and starts/stops [the controller](../src/player/playerData.ts). Startup never requests levels. The saved record contains one profile (normalized username, display name, known skill levels, snapshot time, local fetch time) and the eligibility checkbox. Invalid records use defaults, and storage errors leave in-memory use available. [The header lookup](../src/components/PlayerLookup.tsx) owns the draft RSN separately from the active profile and remains mounted across tab changes. The “RSN level filter” checkbox lives beside “Profitable only” in the shared method filters.

| Event | Transition and invariants |
|---|---|
| Restore or fresh visit | `ready` with saved profile/filter, or `idle` without a profile and with the filter off. No request is made. Saved levels are labeled with the original snapshot time. |
| Inline reload icon or Enter in the header field | A nonempty name is validated and normalized. Invalid names report guidance without requesting. A valid request enters `loading`; the previous profile/filter remain active and labeled in the popout. The same action loads a new player or refreshes the entered player. |
| Duplicate or replacement request | The same pending username is ignored. A different accepted username aborts the earlier request; only the current request can publish results. |
| Successful POST | `loading` → `ready`; replace and persist the profile, retaining the checkbox. Record a 60-second same-player update cooldown. |
| HTTP 429 | Attempt one GET of the existing profile. Success enters `ready` with the original snapshot timestamp and a refresh-limit warning; failure enters `error`. Respect `Retry-After` (60 seconds by default) across player requests. No automatic retries. |
| Timeout, missing player, refused tracking, malformed response, network/service failure | `loading` → `error`; retain the previous profile, filter, and storage. Without a previous profile, eligibility remains disabled. |
| Cooldown submission | Keep the current request/profile state and report how many seconds remain. No request or retry timer is started. |
| Toggle eligibility | A profile is required. Persist profile and checkbox together. |
| Submit an empty name | Abort pending work, enter `idle`, clear profile/draft/filter, and remove the saved record. Keep session cooldowns so clearing does not bypass them. No separate clear control is shown. |
| Hover or focus within the header lookup | Reveal the single submit icon. With a profile, pending request, or message, open a popout below the field. Moving from the field into the popout keeps it open. Touch uses focus and always shows the icon. |
| Leave and blur, or Escape | Close the popout when neither hovered nor focused. Escape dismisses it without moving focus; a new pointer entry, focus event, edit, or submission allows it to open again. No timers or additional requests are involved. |
| Hook cleanup | Abort the request and ignore late successes/failures, including after restarting in React Strict Mode. |

[The transport](../src/player/playerTransport.ts) uses the browser-accessible Wise Old Man API without credentials, keys, or a server proxy. Every POST/GET attempt has a 15-second deadline, including response-body reading. Only an explicit lookup creates/updates a public tracking profile. The Info tab explains this and links to the provider. Valid unranked levels remain usable; invalid/missing levels remain unknown. [Normalization](../src/player/profile.ts) maps `runecrafting` to `Runecraft`, includes Sailing, and caps individual levels at 99.

The pure eligibility predicate checks the existing primary skill/level plus structured `additionalSkillRequirements`. `Combat 1` has no skill gate. Unknown required levels do not exclude a method; only a known primary or secondary level below its requirement excludes it. Quests, diaries, membership, equipment, recommended setups, and indirect quest skill prerequisites are not checked or inferred. App applies eligibility before calculations and profitability and shares the results with Methods and Graph. The Info tab explains these limits and that entry levels do not guarantee listed rates.

The popout uses the traditional three-column, eight-row OSRS skill order, local skill icons, and the RuneScape font. Hiscores contain base levels only, so both values in each skill tile show the same loaded level. Unknown levels show `?`; total level is shown only when every skill level is known. Snapshot time, saved state, and any lookup failure or refresh warning appear inside the popout. A separate visually hidden status announces lookup results even while the popout is closed.

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
