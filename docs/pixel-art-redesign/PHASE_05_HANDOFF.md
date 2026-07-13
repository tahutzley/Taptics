# Phase 5 handoff: quartermaster Deck builder

## Completion boundary

Phase 5 is complete. The full-screen quartermaster Deck builder, strict client/server validation, version-5 profile migration, durable drafts, storage-failure behavior, matchmaking cancellation, responsive and reduced-motion treatment, focused tests, full suite, Edge workflow, and routed documentation gate pass. Phase 6 may change result and lifecycle surfaces without changing the saved-loadout boundary, battle rules, or Phase 3 event schema.

## Delivered interaction

- The six selected slots are the exact opening draw and queue order. Every occupied slot exposes Details, Move Left, Remove, and Move Right controls with logical disabled endpoints, keyboard activation, focus restoration, and scroll preservation.
- The complete 29-card armory uses the Phase 4 portraits and shared `cardFrame()` anatomy. Separate Details and Add/Remove controls keep inspection available when the deck is full; filters expose the exact 6 Attack, 14 Crew, 9 Magic, and 29-card totals.
- Cannon and Volley use the same shared frame through the weapon source option and expose exclusive `aria-pressed` state.
- Six slot roots, 29 library roots, two weapon controls, and one details surface are created lazily and retain DOM identity. Four parent surfaces own stable delegated listeners; renders do not attach per-card handlers.
- Invalid, dirty, saving, saved, full, and storage-error conditions are visually distinct. Save remains above the library and keeps the player on Deck. Restore Saved Loadout is the explicit draft-discard action.
- Essential Deck copy is at least 12px, section labels wrap with a readable gap, action targets remain at least 48px, and the one-, two-, and three-column layouts do not clip.

## Persistence and authority

- Local profile version 5 preserves progression and valid ordered loadouts while migrating malformed data in place. A saved deck must be exactly six unique own-property card keys; invalid decks reset atomically to the default six. Invalid weapons reset independently to Cannon.
- `deckDraft` may contain zero through six unique known cards and one known weapon. It persists after every mutation, survives Battle navigation and reload, and clears when it matches the saved loadout, on Restore, or after Save. CPU/online starts always send only `profile.deck` and `profile.weapon`.
- Opening Deck emits `cancelSearch` before editing. A two-client server probe proves the canceled socket leaves the queue rather than merely updating optimistic local UI.
- Browser storage writes are transactional for Save and Restore. A failed write cannot change the in-memory battle loadout or claim success; the current editor remains usable, reports that its draft is memory-only, and permits a retry.
- `server.js::validateLoadout()` independently rejects malformed, short, oversized, duplicate, unknown, inherited, and non-array decks. Client validation is convenience; server validation remains authoritative.

## Visual assets

Phase 5 creates no additional visual assets. It reuses the original deterministic Phase 4 card and weapon atlases plus the existing UI atlas. Across the redesign so far, all raster art is original deterministic repository output; no AI-generated, copied, remote, or third-party artwork is shipped.

## Verification

- `npm test`: 25/25 passing.
- `npm run assets:check`: 8 generated files / 67 sprites validated.
- `npm run test:browser`: passing in installed Edge with no HTTP, failed-request, console, or page errors.
- Deck browser matrix: 320x700, 390x844, and 1440x900; a 320-CSS-pixel / DPR-2 fixture representing a 640-device-pixel effective 200% layout; and a separate doubled-content approximation. Captures prove responsive reflow, doubled touch targets, local portraits, legible wrapped labels, and no horizontal document clipping.
- Edge workflow covers all 29 details and toggles, exact filters, stable roots/details identity, pointer and keyboard mutations, focus/scroll preservation, strict saved/draft migrations, draft navigation and reload, Volley persistence through lobby and CPU battle, transactional storage failure, authoritative queue cancellation, and reduced-motion add/remove/reorder with zero Deck animations or transitions.
- `git diff --check`: passing apart from informational line-ending warnings where applicable.

## Files and ownership

- Deck structure and status surfaces: `public/index.html`.
- Validation, profile migration, draft persistence, stable catalogue rendering, delegated input, and transactional Save/Restore: `public/app.js`.
- Quartermaster layout, shared-frame Deck variants, state grammar, responsive breakpoints, and reduced motion: `public/styles.css`.
- Authoritative loadout validation: `server.js`.
- Focused/static coverage: `test/frontend.test.js`, `test/matchmaking.test.js`.
- Live workflow: `scripts/browser-smoke.js`.
- Player and agent context: `README.md`, `public/AGENTS.md`, `test/AGENTS.md`, `docs/agent/`, and this handoff.

## Preserved decisions, deviations, and limitations

- Stable canonical card keys, the complete Phase 4 visible-name refactor, costs, balance, three-card hand, cycle rules, Socket.IO event names, and server-authoritative outcomes are unchanged.
- Draft preservation is used instead of a leave-confirmation dialog. It prevents data loss across navigation, reload, and late matchmaking races while keeping Battle on the last saved loadout.
- Opening Deck cancels matchmaking rather than allowing an edited draft to race a queued saved loadout.
- The Phase 5 automated proof combined an effective 320px layout viewport with 2x raster scale and a doubled-content stress fixture. The final Phase 7 handoff records the replacement release-wide effective-narrow, reduced-motion, and manual accessibility audit.
- Phase 5 deliberately adds no art because the complete Phase 4 card, weapon, and UI atlases already cover every required Deck surface.

## Exact Phase 6 starting point

Begin from the last saved loadout boundary and leave Deck root identity, draft semantics, and battle input untouched. Phase 6 owns online search/cancel feedback, explicit leave confirmation during an active match, game-over/result entry and focus, rematch/lobby paths, toast/inspector lifecycle cleanup, sound and disabled-Challenges consistency, and any original deterministic result/status sprites required by those surfaces. Add lifecycle-focused browser and Socket.IO coverage before changing the phase status.
