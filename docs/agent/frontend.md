# Frontend and interaction context

The browser client is mobile-first, dependency-free HTML/CSS/JavaScript. It renders authoritative Socket.IO snapshots and stores only local profile/loadout preferences.

## Screens and ownership

- Lobby: a finished medieval siege-ledger slice built from deterministic pixel icons, parchment, timber, iron, stone, cloth, and hard shadows. It contains online and CPU matchmaking, compact record/challenge/loadout panels, sound state, and persistent Battle/Deck/Challenges navigation shared with Deck. The displayed ELO is local progression derived from the saved record, not authoritative matchmaking rating. Challenges remains visibly disabled until that menu surface is implemented.
- Battle: enemy village, shared field, own village, compact reserve, three-card hand, permanent weapon, and up to three staged card targets positioned over their battlefield categories.
- Deck screen: a full quartermaster-table screen for choosing exactly six unique cards and one permanent weapon. Battle and Deck are switched exclusively through the persistent bottom navigation; there is no deck back control. Save Loadout stays on the Deck screen and remains above the long card library. The six selected slots are the ordered opening draw and queue, not an unordered collection.
- Result modal: non-color victory/defeat/draw/interrupted state, authoritative terminal reason, core and performance stats, tactical read, rematch, and lobby return.

`showLobby()` and `showGame()` own screen transitions. `render(state)` maps snapshots to the battle. The 100ms state path uses guarded text, attribute, style, dataset, and class helpers; a phase signature; structure signatures; a weapon-identity cache; and the stable hand signature. Identical snapshots must not write attributes or replace roots. Both transitions clear bounded battle effects and card-flight clones before entering the next surface.

`cardFrame(key, options)` is the single presentation-only card-frame helper and is exposed as read-only `window.TapticsUI.cardFrame`. Its supported variants are `lobby`, `battle`, `queued`, `deck`, and `detail`; state options are `selected`, `busy`, and `pending`. `options.source` selects the card registry by default or the weapon registry for permanent weapons. It reads `GAME_DATA`, emits no actions, owns no listeners, and leaves interaction with the surrounding screen. Lobby loadout, battle hand, staged-card controls, Deck slots/library/details, and weapon choices consume the same anatomy and local portraits; readable initials remain layered as the missing-art fallback.

## Deck interaction and persistence contract

- The 29 library roots, six ordered slot roots, and two weapon controls are created lazily on the first Deck visit and retain their DOM identity. Mutations update state within those roots; they do not rebuild the catalogue or attach per-card listeners.
- `#card-library`, `#builder-deck`, `#weapon-options`, and `#deck-filters` each own one delegated listener. Native buttons provide pointer, Enter, and Space behavior. Separate Details and Add/Remove actions keep inspection available even when the six-card deck is full.
- One bounded details surface reads names, descriptions, cost/type/category, and concise stats from `GAME_DATA`. Category filters hide stable roots rather than recreating them.
- Selected cards expose explicit Remove, Move Left, and Move Right controls. Reordering preserves the exact draw order, restores logical focus to the moved card, and keeps the Deck scroll position stable.
- Status is explicit: fewer than six unique known cards is `invalid`; a complete loadout different from the saved order or weapon is `dirty`; persistence briefly reports `saving`, then `saved`. Save is enabled only for a strict valid loadout and keeps the player on Deck. Restore Saved Loadout deliberately discards the current draft.
- Save and Restore write a candidate profile before replacing the in-memory saved loadout. If browser storage throws, the editor reports `error`, retains the current draft in memory, leaves Battle on the previous saved loadout, and offers Save as a retry when the draft is otherwise valid. The visual status is not live; concise mutation/error messages use only `#deck-announcer`.
- `taptics-prototype-v3` profile version 5 stores the last valid saved `deck`/`weapon` plus an optional `deckDraft`. A draft may contain zero through six unique known cards and a known weapon. It is persisted after every mutation, survives Battle navigation and reload, never enters a match, and is cleared on Save, restore, or when it exactly matches the saved loadout.
- Opening Deck cancels active online search before editing. A late match-found race cannot lose edits because each draft mutation is already durable; match entry and lobby/CPU summaries always use the last saved loadout.

## Match lifecycle and result contract

- The online control has explicit `idle`, `searching`, and `offline` states. Search/cancel updates visible copy, its search/status sprite, `aria-pressed`, `aria-busy`, and the lifecycle live region. Starting CPU or opening Deck cancels online search first.
- Leave Battle opens a modal confirmation without emitting. The safe Stay action receives initial focus; Tab is trapped, Escape and backdrop activation cancel, and cancel restores focus to Leave Battle. Confirm is single-use, emits `leaveMatch`, returns to the lobby, and does not invent a second local result.
- Lifecycle dialogs make `.app-shell` inert and hidden from assistive technology while open. Opening one clears the card inspector and toast; closing it removes inert state and either restores focus or moves focus deliberately to the next screen. Result entry focuses its heading before actions.
- `gameOver` is consumed only while the matching battle is active. `resultPresentation()` maps server `winner` plus `core`, `leave`, or `disconnect` reason to explicit copy and original result/status sprites. The first matching event increments local duels once; wins increment wins/run/best run, losses reset run, and draws preserve run. Recent results remain capped at eight.
- A local socket interruption during battle is a non-result state: it records no duel, win, loss, or streak change, creates no celebration particles, says the battle cannot resume, and disables fresh battle until the socket reconnects. An opponent disconnect received authoritatively from the server is a victory.
- Result decoration is bounded to six particles for victory and four for defeat/draw, clears after one second, and is omitted for interruptions and reduced motion. Toast content is structured, single-instance, and always below lifecycle dialogs.
- A combat event that already uses `#combat-status` may show a visual toast only with `aria-live=off`; this prevents duplicate Wall-break or high-threat announcements. Hidden toasts also use `off`, and reconnecting clears a stale offline toast.
- CPU Run It Back requests a fresh CPU match and keeps the result modal active until `matchFound`. Online Run It Back closes the result and begins a fresh global search. Return to Lobby never resumes the finished match.
- Sound keeps a stable accessible name while `aria-pressed` and its on/off sprite expose state. Challenges remains visible, disabled, `aria-disabled`, and labeled Locked; Phase 6 adds no Challenges, settings, pause, resume, or reconnect-recovery feature.

## Battlefield visual grammar

Each village uses the same readable zones:

1. Attack weapon on the left: only the selected Cannon or Volley exists visually.
2. Crew in the middle: villagers represent Crew commitments.
3. Magic on the right: a runic ground drawing represents Magic commitments.
4. A Wall between the village and frontline.
5. Eight visible structure tiles for built structures.
6. A core with persistent HP.

The arena is the dominant battle surface. Core, Shield, and Wall values live on their battlefield objects rather than in a duplicate footer. Shield and Wall are separate stacked meters, while authoritative damage events describe the exact Shield -> Wall -> core route. The compact reserve HUD keeps the tap count prominent without competing with the arena. The rival reserve is a numeric `progressbar`; each structure grid is a named `list`, built structures are named `listitem` elements, and empty tiles are decorative.

`renderProjectCues()` applies normalized loading, pending, and siphon states to the three category zones. Rival intent should be legible from animation, fill, glow, pending state, and counterability; explanatory text may support accessibility but should not become the primary visual signal.

`presentationEvents(state, afterId)` consumes the bounded `recentEvents` buffer with legacy `lastEvent` fallback. It validates known event shapes, rejects malformed or unknown entries, deduplicates and sorts by monotonic ID, and lets the client render every unseen same-tick resolution. Each selected event is isolated so one presentation failure cannot stop later feedback. `#battle-effects` bounds transient nodes to 18, localizes projectiles, numeric deltas, impact/debris sprites, siphon pulls, and catalogue-driven family effects to battlefield targets, and leaves authoritative values to the next snapshot. `effectPresentation(key, source)` reads each card or weapon's family plus shared color/intensity/pitch metadata from `GAME_DATA`; projectile travel and non-damage resolution cues use one parameterized engine across projectile, siege, restoration, build, resource, buff, delay, counter, ritual, and echo. High-threat and Wall-break messages also use the polite combat status region. Reduced-motion mode uses a static family frame and destination emphasis without a travel arc.

## Deployment and input contract

The hand-selection bug is guarded by a specific architecture:

- `#battle-hand` owns delegated listeners; rendered card buttons do not own listeners.
- `renderBattleHand()` computes a hand signature. It rebuilds hand markup only when card keys/order change. A `null` slot renders as a noninteractive outlined placeholder until that deployed card completes.
- Primary `pointerdown` immediately performs the normal deploy, tap, or siphon. Right-click/`contextmenu` reveals the stat inspector without performing the action; right-clicking the same card again, the next left click, or Escape closes it. Right-clicking a different card switches the inspector directly.
- `click` and explicit keyboard handling cover assistive, Enter, and Space activation without duplicating primary-pointer input. Every pointer action must reject non-primary buttons so right-click can never spend a tap or move a card.
- Inspectable hand, weapon, zone, and queued-action controls declare `aria-keyshortcuts="I F2"`. Rival inspection targets that currently cannot be siphoned keep the needed inspection focus path while exposing `aria-disabled=true`; a counterable target changes it to `false` and supports Enter/Space.
- Deploying emits authoritative `action:place`, spends no tap, and animates a visual clone from the hand to `#own-action-attack`, `#own-action-crew`, or `#own-action-magic`.
- `renderQueuedAction()` shows the staged or pending card independently in every category for both players, including its exact `progress/cost` value. These six solid controls are direct children of their `.base`, use `target-attack/crew/magic` positioning, and must not be nested inside decorative zone art where clipping or stacking can make them disappear.
- An untouched staged card may swap with a same-category hand card. Once progress or wind-up occupies the category, related hand cards, the staged action, and the conflicting permanent weapon expose `aria-disabled=true` plus a readable busy label but remain focusable for `I`/F2 inspection. Every pointer/Enter/Space activation path must reject an aria-disabled action before emitting.
- The permanent weapon is tapped directly from its persistent card and shares the authoritative Attack lock.
- Battle cards show category through color rather than repeated category/type copy. A blocked card receives a high-contrast `ATTACK/CREW/MAGIC IS BUSY` label over the card.
- Right-click inspector numbers come from `cardStats` and `weaponStats` in `game-data.js`. Keep those concise arrays complete whenever definitions are added or balance values change.

Do not call `renderBattleHand()` in a way that replaces the button under an active pointer unless the actual hand cycled. Do not attach listeners inside `cardButton()` or after every state snapshot.

## State and data

- `window.GAME_DATA` supplies all definitions.
- Every card and weapon owns decorative `art` and `effectFamily` metadata in `GAME_DATA`; family definitions own presentation color, intensity, and pitch. These fields must never alter authoritative rule arithmetic.
- `players[*].placed` maps each category to `null` or `{ key, slot }`. Treat it as server-owned staging state and never infer deployment only from the DOM.
- `matchState` is replaceable snapshot state; do not mutate it to simulate authoritative outcomes.
- Local storage key `taptics-prototype-v3` contains profile version 5, progression/challenge state, the saved deck and weapon, and an optional sanitized Deck draft. Invalid saved decks reset atomically to the default six; an invalid weapon resets independently to Cannon; valid order and unrelated progression survive migration.
- `lastEventId` prevents replaying any transient event from repeated snapshots; event selection reads `recentEvents` and falls back to `lastEvent` for compatibility.

## Accessibility and responsive baseline

- Keep the viewport scalable; never add `user-scalable=no` or a restrictive maximum scale.
- Primary interactive targets should remain at least 48px. Tactical text should normally remain 12px or larger, with body copy around 14-16px.
- Preserve strong contrast, non-color state differences, and the final `:focus-visible` treatment: a 3px charred outline, 3px offset, and 6px heraldic-gold outer ring, including selected/current controls.
- Keep live status regions for changing reserve guidance and toasts. Compact or visually hidden guidance must remain available to assistive technology.
- Siphonable enemy Attack, Crew, Magic, and staged-card targets enter the tab order for Enter/Space counterplay. The permanent rival weapon and visible rival staged/pending cards remain keyboard-focusable for `I` or F2 inspection even when they cannot be siphoned. `I` or F2 also opens the inspector on own hand cards, staged cards, and the permanent weapon.
- Respect `prefers-reduced-motion`; important state must remain understandable without animation. Pending projects, weapons, and queued actions use static double outlines/meters in all modes, and reduced motion additionally removes deployment travel, family travel, result particles, and the siphon tap pulse.
- UI, weapon, structure, effect-family, and card sprites load from generated atlases and use readable text as the authoritative fallback. Artwork is decorative and never replaces accessible names or stats. Runtime has no remote-font request.
- Narrow layouts must reflow instead of horizontally clipping cards, records, phase information, or controls.
- Any purely visual cue needs an accessible label or equivalent state exposed to assistive technology.

## Change checklist

- New public snapshot field: update serialization first, then render defensively.
- New action: define and validate server payload before wiring input.
- New card metadata: update only `game-data.js`; the builder and hand should remain data-driven.
- Changed DOM ID/class: search `app.js`, `styles.css`, and tests for every consumer.
- Changed category or zone: update HTML, cue mapping, CSS, siphon input binding, accessible labels, and tests together.
- Layout/input change: verify selection under a running 100ms state stream, not just on a static page.
