# Frontend and interaction context

The browser client is mobile-first, dependency-free HTML/CSS/JavaScript. It renders authoritative Socket.IO snapshots and stores only local profile/loadout preferences.

## Screens and ownership

- Lobby: profile record, matchmaking, saved six-card cycle, weapon, field challenge, and phase explanation.
- Battle: enemy village, shared field, own village, reserve, three-card hand, permanent weapon, and one large commit control.
- Deck modal: choose exactly six unique cards and one permanent weapon.
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

`renderProjectCues()` applies normalized loading, pending, and siphon states to the three category zones. Rival intent should be legible from animation, fill, glow, pending state, and counterability; explanatory text may support accessibility but should not become the primary visual signal.

## Selection and input contract

The hand-selection bug is guarded by a specific architecture:

- `#battle-hand` owns delegated listeners; rendered card buttons do not own listeners.
- `renderBattleHand()` computes a hand signature. It rebuilds hand markup only when card keys/order change, then updates selected, pending, disabled, and progress states in place on ordinary snapshots.
- `pointerdown` selects immediately on touch/mouse. A `click` listener handles keyboard and assistive activation only; mouse-generated clicks are filtered with `event.detail` to avoid duplicate selection.
- The permanent weapon uses the same paired input approach.
- The large `#commit-button` spends on the currently selected target; selecting a card never spends a tap.
- Lane-disabled cards use both native `disabled` and `aria-disabled`. Selection state must stay visually distinct from disabled/pending state.

Do not call `renderBattleHand()` in a way that replaces the button under an active pointer unless the actual hand cycled. Do not attach listeners inside `cardButton()` or after every state snapshot.

## State and data

- `window.GAME_DATA` supplies all definitions.
- `selectedTarget` is `{ source: "weapon" }` or `{ source: "card", slot }`; resolve the current card key from the live hand before emitting.
- `matchState` is replaceable snapshot state; do not mutate it to simulate authoritative outcomes.
- Local storage key `taptics-prototype-v3` contains profile, deck, weapon, and challenge progress. Be deliberate about migrations if its shape changes.
- `lastEventId` prevents replaying transient effects from repeated snapshots.

## Accessibility and responsive baseline

- Keep the viewport scalable; never add `user-scalable=no` or a restrictive maximum scale.
- Primary interactive targets should remain at least 48px. Tactical text should normally remain 12px or larger, with body copy around 14-16px.
- Preserve strong contrast, non-color state differences, and a visible `:focus-visible` treatment.
- Keep live status regions for changing reserve guidance and toasts.
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
