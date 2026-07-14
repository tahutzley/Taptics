# Phase 5 handoff: quartermaster Deck builder

## Completion boundary

Phase 5 is complete. It owns the current full-screen stacked quartermaster Deck builder, strict client/server validation, version-6 five-loadout profile migration, automatic persistence with durable per-deck drafts, storage-failure behavior, matchmaking cancellation, responsive and reduced-motion treatment, and Deck regression contract. Later lifecycle work may not change the complete-loadout battle boundary, battle rules, or Phase 3 event schema.

## Delivered interaction

- Five fixed tabs switch between local loadout records at the top of the workbench. Six stable slot roots form a 3x2 tray: positions `#1`-`#3` are the Opening Hand and positions `#4`-`#6` are Next in Cycle. Order, artwork, name, cost, stats, disclosure, replacement, drag, and empty ADD CARD states update inside those roots without recreating them.
- The complete 29-card Armory uses Phase 4 portraits and shared `cardFrame()` anatomy. Filled Deck slots and Armory entries have the same fixed collapsed height, artwork, name, cost, category/type, and first two `cardStats` facts. Clicking a face expands an overlapping action panel with `INFO` first and `CHOOSE POSITION`/`IN DECK #N` for Armory cards or `REMOVE` for Deck cards. Only one panel remains expanded, and its actions keep 48px targets.
- Search by name, All/Attack/Crew/Magic filters, recommended/cost/name sorting, category groups, visible counts, Reset, and no-results recovery hide or reparent the same 29 roots. The collection uses two columns on phones, three at medium widths, and four at wide widths without nested scrolling or compressed text.
- Cannon and Volley are two stable illustrated roots in an exclusive radio group. Their portraits are centered; each shows its first two `weaponStats` facts, has its own accessible `INFO` action, and remains labeled Always Available.
- Choosing an unowned Armory card opens the explicit position dialog. A complete deck offers six atomic replacement targets; a partial packed deck offers its valid insertion targets. Existing members report `IN DECK #N` and are never duplicated or removed implicitly. Remove appears only in the expanded action panel of a filled Deck slot.
- Reordering has no arrow or drag-handle controls. Pointer movement on the card face, a brief touch hold on that same face, and Space plus Arrow/Home/End keyboard input produce the same exact order; an ordinary vertical touch swipe scrolls, while cancellation and invalid drops restore the original order. Focus, scroll, and announcements remain stable.
- The latest add, remove, replacement, reorder, or weapon change receives one bounded Undo snapshot, and Undo is auto-saved through the same complete-versus-partial rules. Add/remove/replace travel, stable-root shifts, status, filters, dialogs, and control feedback use bounded motion; reduced motion applies the same final state immediately with static labels and outlines.
- Battle-ready, partial-draft, and storage-error conditions are visually and textually distinct. Every mutation auto-saves and keeps the player on Deck; there is no manual Save or Restore action. Undo remains in normal flow above the Armory, while only Armory browsing controls stay sticky.
- Essential Deck copy is at least 12px, primary actions remain at least 48px, browser zoom stays enabled, and Info/position dialogs make the app shell inert, contain focus, support Escape/backdrop/visible close or cancel, and restore focus to the origin.

## Persistence and authority

- Local profile version 6 preserves progression while normalizing exactly five loadout records and active/selected indices. Each record's complete deck must contain exactly six unique own-property card keys; invalid decks reset atomically to the default six, and invalid weapons reset independently to Cannon. Legacy version-5 top-level deck/weapon/draft data migrates into record one.
- Each record may also contain `deckDraft` with zero through six unique known cards and one known weapon. After a successful autosave, a complete mutation promotes its deck/weapon to the battle-ready snapshot and clears the draft. An incomplete mutation persists only the draft, which survives Battle navigation, tab switches, and reload while CPU/online starts continue sending the selected active record's last complete deck and weapon.
- Undo restores and attempts to persist the immediately previous editor snapshot. After a successful write, a complete Undo result becomes battle-ready; an incomplete result remains a draft and cannot replace the complete battle loadout.
- Opening Deck emits `cancelSearch` before editing. A two-client server probe proves the canceled socket leaves the queue rather than merely updating optimistic local UI.
- Automatic browser-storage writes are transactional. A failed write cannot change the in-memory profile/Battle loadout or claim success; the current editor remains usable through page-lifetime volatile records while Battle uses the last successfully persisted active complete loadout. A later successful mutation or deck switch materializes and flushes all pending volatile edits together.
- `server.js::validateLoadout()` independently rejects malformed, short, oversized, duplicate, unknown, inherited, and non-array decks. Client validation is convenience; server validation remains authoritative.

## Visual assets

Phase 5 creates no additional visual assets. It reuses the original deterministic Phase 4 card and weapon atlases plus the existing UI atlas. Across the redesign so far, all raster art is original deterministic repository output; no AI-generated, copied, remote, or third-party artwork is shipped.

## Verification

- `npm test` covers client/server validation, five-record profile migration, stable roots, delegated tabs/disclosures, shared card anatomy, atomic position mutations, automatic persistence, Undo, dialog semantics, reorder contracts, and complete-loadout authority without pinning a count in this handoff.
- `npm run assets:generate` and `npm run assets:check` retain deterministic generated output; root `.gitattributes` pins generated manifest/CSS metadata to LF for byte-stable Windows checkouts.
- `npm run test:browser` owns the 320x700, 390x600, 390x844, 720x900, and 1440x900 matrix plus the 320-CSS-pixel/2x-scale reduced-motion proxy. Real 200% browser zoom remains a manual check because device scale is not browser zoom.
- The Deck workflow covers all five tabs; all 29 card disclosures and Info actions; uniform shared Deck/Armory anatomy; visible order numbers; permanent-weapon stats; search/filter/sort/no-results states; stable root identity; explicit replacement/insertion targets; contextual Remove; Undo; card-face pointer/touch and keyboard reorder completion/cancellation; focus/scroll preservation; strict complete/draft migration; automatic reload/navigation persistence; active deck and weapon use through lobby and CPU battle; transactional storage failure and recovery; queue cancellation; absent Save/Restore controls; sticky Armory browsing; motion cleanup; and reduced-motion equivalence.
- `git diff --check` remains required; checkout line-ending warnings are informational when no whitespace error is reported.

## Files and ownership

- Deck structure and status surfaces: `public/index.html`.
- Validation, five-record profile migration, automatic complete/draft persistence, stable shared-card rendering, position selection/Undo/reorder/motion, delegated input, and transactional storage failure/recovery: `public/app.js`.
- Quartermaster workbench, responsive equal-height shared cards, action disclosures/overlap, order labels, weapon stats, state grammar, sticky Armory controls, dialogs, and reduced motion: `public/styles.css`.
- Authoritative loadout validation: `server.js`.
- Focused/static coverage: `test/frontend.test.js`, `test/matchmaking.test.js`.
- Live workflow: `scripts/browser-smoke.js`.
- Player and agent context: `README.md`, `public/AGENTS.md`, `test/AGENTS.md`, `docs/agent/`, and this handoff.

## Preserved decisions, deviations, and limitations

- Stable canonical card keys, the complete Phase 4 visible-name refactor, costs, balance, three-card hand, cycle rules, Socket.IO event names, and server-authoritative outcomes are unchanged.
- Per-record draft preservation prevents data loss across navigation, reload, and late matchmaking races while keeping Battle on the active record's last complete loadout. Active-battle leave confirmation remains a separate lifecycle concern.
- Opening Deck cancels matchmaking rather than allowing an edited loadout to race an already queued complete snapshot.
- The Phase 5 automated proof combined an effective 320px layout viewport with 2x raster scale and a doubled-content stress fixture. The final Phase 7 handoff records the replacement release-wide effective-narrow, reduced-motion, and manual accessibility audit.
- Phase 5 deliberately adds no art because the complete Phase 4 card, weapon, and UI atlases already cover every required Deck surface.

## Cross-phase boundary

Keep the active-complete-loadout boundary, five-record autosave/draft model, Deck root identity, disclosure/position-picker behavior, Undo semantics, and battle input untouched when changing queue, result, rematch, inspector/toast, sound, or Challenges lifecycle surfaces. Lifecycle-focused browser and Socket.IO coverage remains separate from Deck editor behavior.
