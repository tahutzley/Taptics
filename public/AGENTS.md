# Browser client scope

These instructions apply to `public/`. Also obey the root `AGENTS.md`.

## Required context

- For any browser change, read `../docs/agent/frontend.md`.
- For card, weapon, category, or visible rule changes, also read `../docs/agent/gameplay.md`.
- For state payload assumptions or emitted actions, also read `../docs/agent/architecture.md`.

## Ownership

- `game-data.js`: one universal data registry for cards, categories, weapons, deck size, hand size, and default deck. It must remain usable through both `require()` and `window.GAME_DATA`.
- `index.html`: semantic screen and battlefield structure. Keep script order `socket.io` -> `game-data.js` -> `app.js`.
- `app.js`: local profile/loadout persistence, Socket.IO presentation, selection and tap input, state rendering, sound, and results.
- `styles.css`: the complete responsive visual system. There is no CSS framework or build step.

## Client contracts

- Treat every server snapshot as authoritative. Send only `{ type, source, key }` actions.
- Keep the three hand buttons stable between state ticks. `renderBattleHand()` may replace their HTML only when the hand signature changes, then updates state in place.
- Keep the 100ms render path idempotent: guard text, attribute, style, dataset, and class writes; cache phase, structure, and weapon identity; and clear effect/flight nodes on screen transitions. Identical snapshots must not replace stable roots or create mutations.
- Hand and weapon selection use `pointerdown` for immediate touch response plus a filtered `click` fallback for keyboard/assistive activation. Do not add per-card listeners during render.
- Deck creates its six 3x2 slot roots, 29 Armory roots, and two weapon roots lazily, then keeps them stable. Preserve delegated input on the five-tab deck switcher, slot tray, Armory, weapon rack, and filters; search/filter/sort must hide or reparent existing roots, and targeted updates must retain focus and scroll.
- Filled Deck slots and Armory entries share the same fixed-height card anatomy. Their faces are disclosure controls: expanding one card exposes `INFO` above either `CHOOSE POSITION`/`IN DECK #N` in the Armory or `REMOVE` in the draw order. Keep only one expanded card, allow its action panel to overlay the following row without changing collapsed heights, and keep order visible as `#1` through `#6`. Permanent-weapon roots show their first two `weaponStats` facts.
- The explicit position dialog is the add/replace path. It offers six atomic replacement targets for a complete deck and valid insertion targets for a partial deck; an existing member only reports its current `IN DECK #N` position. Reordering starts on the card face through pointer movement, a brief touch hold, or Space plus Arrow/Home/End keyboard input; do not restore drag handles, left/right arrows, or per-card listeners. Keep ordinary vertical touch swipes scrollable.
- Profile version 6 contains exactly five local loadout records. Every edit and Undo result attempts an autosave to the selected record: after a successful write, a complete valid edit replaces its battle-ready snapshot and clears its draft, while an incomplete edit persists as that record's draft without changing its last complete six-card deck and weapon. A successfully selected record becomes the active lobby/match loadout. Do not restore manual Save or Restore controls, and cancel active search when Deck opens.
- Treat autosave as transactional. If storage fails, keep every affected editor state only in the volatile per-deck fallback and leave `profile`/Battle on the last successfully persisted active complete loadout. The next successful mutation or deck switch must flush all pending volatile records together before reporting success.
- Deck Info and position choice are separate labeled dialogs. Keep the app shell inert while either is open, trap focus, support Escape/backdrop/visible close or cancel, restore focus to the origin, and keep Info independent from add/replace/remove actions.
- Keep online matchmaking visibly reversible: idle, searching/cancel, and offline states must update accessible pressed/busy state and concise live status. Starting CPU also removes an active online search.
- Leave Battle must open the accessible confirmation path; only its guarded confirm action may emit `leaveMatch`. Lifecycle dialogs trap Tab, support Escape, make the app shell inert, clear inspector/toast overlays, and restore or deliberately place focus on exit.
- Render victory, defeat, draw, and interruption from server terminal data without predicting outcomes. A local socket interruption is not a loss and must not update progression; CPU and online rematches always create or search for fresh matches.
- A blocked lane disables commitment without making an unrelated card impossible to select unless the lane rule requires it. Inspectable blocked hand, staged, and weapon controls remain focusable with `aria-disabled=true`; activation guards must reject the action while `I`/F2 still opens details.
- Render one chosen Attack weapon on the left, Crew villagers in the middle, Magic runes on the right, one Wall, and eight structure slots per village.
- Expose the rival reserve as a numeric progressbar and each village structure grid as a named list. Nonsiphonable rival inspection targets remain focusable where needed but expose `aria-disabled=true`.
- Rival intent is communicated primarily through battlefield loading/pending/counterable cues. Do not replace it with dense intent text.
- Do not disable pinch zoom. Retain visible `:focus-visible`, live regions, reduced-motion support, readable type, at least 48px primary touch areas, keyboard-operable deck tabs/disclosures/position choices, and the Armory's responsive two/three/four-column ceiling without horizontal scrolling.
- Keep result particles bounded and absent under reduced motion. Result, confirmation, toast, inspector, sound, and locked Challenges states must remain legible without animation or color alone.
- Announce each combat outcome once: visual-only duplicate toasts use `aria-live=off`, while the combat status region owns the concise screen-reader message.

## Verification

Run `npm test` after client changes. For layout, interaction, or responsive work, run the full viewport, keyboard, reduced-motion, asset/network, and performance matrix in `../docs/agent/testing.md`.

If a durable client contract changes, update `../docs/agent/frontend.md` in the same patch.
