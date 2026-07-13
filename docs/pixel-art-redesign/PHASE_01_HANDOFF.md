# Phase 1 handoff

## Completion

Goal achieved. The clean starting branch was `codex/taptics-prototype`; no pre-existing working-tree edits or visual assets existed. Phase 1 created the deterministic pixel pipeline, semantic tokens, proof atlas, inventories, master plan, routed ownership, and focused tests without changing gameplay or redesigning a screen.

## Acceptance

- Deterministic generation: met; two in-memory generations are byte-identical and committed outputs are byte-compared.
- Missing/orphan/duplicate/dimension/hash/budget checks: met for the proof pipeline.
- No second registry: met; validator imports `public/game-data.js`.
- Proof assets served from `public/`: met by Express static ownership; runtime HTTP probe recorded below.
- Gameplay unchanged and tests passing: met.
- Full-screen redesign: intentionally not started.

## Files and decisions

- Added `assets-src/pixel/`, `scripts/pixel-art/`, `public/assets/pixel/`, `test/assets.test.js`, and this documentation set.
- Added `assets:generate` and `assets:check`; no dependency or lockfile change.
- Added Phase-owned CSS variables while preserving existing aliases and visuals.
- Root three-card contract is the Phase 3 product decision.
- User-authorized naming mapping is frozen in `CARD_INVENTORY.md`; canonical keys and weapon names remain stable.
- The image-generation skill was reviewed and not used because deterministic code-native art is required. Phase 1 created original programmatic PNG assets.

## Verification

- Baseline `npm test`: 12/12 passed.
- `npm run assets:generate`: generated three files.
- `npm run assets:check`: validated three files/three sprites.
- Focused asset tests and final `npm test`: 14/14 passed.
- Repeated generation produced identical SHA-256 values and no output change.
- HTTP proof: atlas, generated CSS, and manifest each returned 200 (447, 435, and 1,289 bytes).
- `git diff --check`: passed (Git emitted only the repository's existing LF-to-CRLF checkout warnings).
- Lint, format, typecheck, build, and browser automation: not configured; no command run.

## Limits and Phase 2 start

Remote Google fonts and legacy screen styles intentionally remained at this boundary. The proof atlas established infrastructure rather than final screen art; after every surface migrated, Phase 7 removed the two unused proof entries while preserving the generator and validator.
