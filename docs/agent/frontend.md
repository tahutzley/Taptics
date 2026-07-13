# Frontend and interaction context

The browser client is mobile-first, dependency-free HTML/CSS/JavaScript. It renders authoritative Socket.IO snapshots and stores only local profile/loadout preferences.

## Screens and ownership

- Lobby: battle-first rating home, online and CPU matchmaking, compact record/challenge/loadout cards, and persistent Battle/Deck/Challenges navigation shared with the Deck screen. The displayed ELO is a local progression score derived from the saved win/loss record, not an authoritative matchmaking rating. Challenges remains visibly disabled until that menu surface is implemented.
- Battle: enemy village, shared field, own village, compact reserve, four-card hand, permanent weapon, and up to three staged card targets positioned over their battlefield categories.
- Deck screen: a full lobby-level screen for choosing exactly six unique cards and one permanent weapon. Battle and Deck are switched exclusively through the persistent bottom navigation; there is no deck back control. Save Loadout stays on the Deck screen and remains above the long card library.
- Result modal: outcome, performance stats, tactical read, rematch, and lobby return.

`showLobby()` and `showGame()` own screen transitions. `render(state)` maps snapshots to the battle. Keep expensive or focus-disrupting DOM replacement out of the 100ms state path.

## Battlefield visual grammar

Each village uses the same readable zones:

1. Attack weapon on the left: only the selected Cannon or Volley exists visually.
2. Crew in the middle: villagers represent Crew commitments.
3. Magic on the right: a runic ground drawing represents Magic commitments.
4. A Wall between the village and frontline.
5. Eight visible structure tiles for built structures.
6. A core with persistent HP.

The arena is the dominant battle surface. Core and Wall values live on their battlefield objects rather than in a duplicate footer. The compact reserve HUD keeps the tap count prominent without competing with the arena.

`renderProjectCues()` applies normalized loading, pending, and siphon states to the three category zones. Rival intent should be legible from animation, fill, glow, pending state, and counterability; explanatory text may support accessibility but should not become the primary visual signal.

## Deployment and input contract

The hand-selection bug is guarded by a specific architecture:

- `#battle-hand` owns delegated listeners; rendered card buttons do not own listeners.
- `renderBattleHand()` computes a hand signature. It rebuilds hand markup only when card keys/order change. A `null` slot renders as a noninteractive outlined placeholder until that deployed card completes.
- Primary `pointerdown` immediately performs the normal deploy, tap, or siphon. Right-click/`contextmenu` reveals the stat inspector without performing the action; right-clicking the same card again, the next left click, or Escape closes it. Right-clicking a different card switches the inspector directly.
- `click` and explicit keyboard handling cover assistive, Enter, and Space activation without duplicating primary-pointer input. Every pointer action must reject non-primary buttons so right-click can never spend a tap or move a card.
- Deploying emits authoritative `action:place`, spends no tap, and animates a visual clone from the hand to `#own-action-attack`, `#own-action-crew`, or `#own-action-magic`.
- `renderQueuedAction()` shows the staged or pending card independently in every category for both players, including its exact `progress/cost` value. These six solid controls are direct children of their `.base`, use `target-attack/crew/magic` positioning, and must not be nested inside decorative zone art where clipping or stacking can make them disappear.
- An untouched staged card may swap with a same-category hand card. Once progress or wind-up occupies the category, related hand cards and the conflicting permanent weapon use native `disabled` plus a readable busy label.
- The permanent weapon is tapped directly from its persistent card and shares the authoritative Attack lock.
- Battle cards show category through color rather than repeated category/type copy. A blocked card receives a high-contrast `ATTACK/CREW/MAGIC IS BUSY` label over the card.
- Right-click inspector numbers come from `cardStats` and `weaponStats` in `game-data.js`. Keep those concise arrays complete whenever definitions are added or balance values change.

Do not call `renderBattleHand()` in a way that replaces the button under an active pointer unless the actual hand cycled. Do not attach listeners inside `cardButton()` or after every state snapshot.

## State and data

- `window.GAME_DATA` supplies all definitions.
- `players[*].placed` maps each category to `null` or `{ key, slot }`. Treat it as server-owned staging state and never infer deployment only from the DOM.
- `matchState` is replaceable snapshot state; do not mutate it to simulate authoritative outcomes.
- Local storage key `taptics-prototype-v3` contains profile, deck, weapon, and challenge progress. Be deliberate about migrations if its shape changes.
- `lastEventId` prevents replaying transient effects from repeated snapshots.

## Accessibility and responsive baseline

- Keep the viewport scalable; never add `user-scalable=no` or a restrictive maximum scale.
- Primary interactive targets should remain at least 48px. Tactical text should normally remain 12px or larger, with body copy around 14-16px.
- Preserve strong contrast, non-color state differences, and a visible `:focus-visible` treatment.
- Keep live status regions for changing reserve guidance and toasts. Compact or visually hidden guidance must remain available to assistive technology.
- Respect `prefers-reduced-motion`; important state must remain understandable without animation.
- Narrow layouts must reflow instead of horizontally clipping cards, records, phase information, or controls.
- Any purely visual cue needs an accessible label or equivalent state exposed to assistive technology.

## Change checklist

- New public snapshot field: update serialization first, then render defensively.
- New action: define and validate server payload before wiring input.
- New card metadata: update only `game-data.js`; the builder and hand should remain data-driven.
- Changed DOM ID/class: search `app.js`, `styles.css`, and tests for every consumer.
- Changed category or zone: update HTML, cue mapping, CSS, siphon input binding, accessible labels, and tests together.
- Layout/input change: verify selection under a running 100ms state stream, not just on a static page.
