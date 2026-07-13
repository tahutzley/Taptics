# Phase 2 handoff

## Completion and acceptance

Goal achieved. The lobby, header, rating, matchmaking, record, challenge, active loadout, sound state, and persistent navigation now form one medieval siege-ledger slice. Shared panel, button, badge, meter, tab, modal-frame, status-chip, and card-frame primitives exist. CPU, search/cancel, challenge entry, sound, Edit Deck, and tabs remain functional.

- Responsive: verified at 320x700, 390x844, and 1440x900 with no horizontal overflow; shell caps at 720px.
- Input/accessibility: 48px live action targets, visible focus, `aria-current`, sound/search `aria-pressed`, keyboard navigation, scalable viewport, and reduced-motion transition removal verified.
- Performance: no remote-font request; one sub-1KB critical atlas; six stable lobby card frames; no console/network failures.
- Compatibility: Socket.IO payloads and gameplay unchanged; CPU battle and legacy Deck still start and render.

## Files, assets, and architecture

- Added seven production UI sprites to the three proof sprites: crest, three nav icons, sound on/off, and search.
- Added `cardFrame()` with five variants and three presentation states. It is data-driven, listener-free, action-free, and exposed read-only for later screen migrations.
- Added `playwright-core`, `scripts/browser-smoke.js`, `test:browser`, ignored browser captures, and focused source contracts.
- Replaced Google Fonts with local system stacks; no third-party visual or font asset ships.
- The Phase 2 lobby CSS was an explicit late-owned section while the battle/Deck legacy cascade remained. Phase 7 later removed the superseded lobby rules after every screen migrated.

## Verification

- Baseline `npm test`: 14/14; final `npm test`: 16/16 after focused frontend contracts.
- `npm run assets:generate` and `npm run assets:check`: 3 files / 10 sprites passed.
- `npm run test:browser`: passed; 320x700, 390x844, and 1440x900 captures written; search/cancel, sound, Deck/back, CPU entry/leave, keyboard focus, reduced motion, console, and network checks passed.
- In-app live inspection repeated the phone/desktop checks and confirmed six frames, no remote fonts, no horizontal overflow, and a 720px desktop shell.
- `git diff --check`: passed with checkout line-ending warnings only.
- Lint, format, typecheck, and build: not configured; no command run.

## Preserved decisions and Phase 3 start

Preserve server authority, stable canonical keys, the card-frame action boundary, critical-atlas loading, and all existing battle input hooks. Phase 3 starts by aligning the explicit three-card contract, adding bounded `recentEvents` with exact authoritative deltas, testing that protocol, and only then migrating the battlefield and battle cards to the shared visual system.
