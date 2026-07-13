# Phase 4 handoff: complete catalogue art and battle effects

## Completion boundary

Phase 4 is complete. The deterministic pipeline, runtime integration, metadata-driven effects, complete player-facing name refactor, focused tests, full suite, browser smoke, responsive checks, and documentation gate pass. Phase 5 may begin from the Deck screen without changing battle rules or Phase 3's event schema.

## Delivered art

- 29 unique 48x48 card portraits, one for every canonical key in `GAME_DATA.cards`.
- Two unique 48x48 permanent-weapon portraits: Cannon and Volley.
- Six unique 64x64 battlefield structures: Bellows Guild, Alchemist's Furnace, Quartermaster's Guild, Beacon Tower, Outrider Camp, and Verdant Menhir.
- Ten unique 32x32 effect-family sprites: projectile, siege, restoration, build, resource, buff, delay, counter, ritual, and echo.
- Phase 1-3 UI and battle sprites remain intact. Total committed coverage is eight generated files and 67 sprites.

All artwork is original deterministic raster output authored through repository drawing recipes. No generative-image output, copied asset, remote asset, or third-party artwork is present. Initials remain visible, readable fallbacks; accessible labels and stats remain authoritative.

## Runtime integration and metadata

- `public/game-data.js` remains the only catalogue. Every card and weapon has an `art` token and supported `effectFamily`; each family defines shared presentation color, intensity, and pitch. Canonical keys, costs, categories, wind-ups, rule fields, default-deck order, and balance are unchanged.
- All 29 approved medieval display names, short labels, descriptions, challenge copy, runtime threat copy, README copy, routed gameplay context, tests, and handoffs use the current visible catalogue in `CARD_INVENTORY.md`. Canonical keys remain stable for saved profiles, server rules, Socket.IO payloads, CPU behavior, and asset class names.
- The shared `cardFrame()` supplies portraits to lobby loadout, battle hand, and own/rival queued commitments. The permanent weapon control, right-click/F2 inspector, and built-structure grid use their matching atlases. The current Deck layout is intentionally unchanged for Phase 5.
- `effectPresentation()` and one parameterized effect engine select family sprite, source color, intensity, side, and target from `GAME_DATA`. Damage events travel target-relatively; non-damage resolution events use authoritative outcome sides/layers where available and a semantic own/rival fallback where the event has no numeric delta. Snapshots remain the only resource/result authority.
- Temporary effects remain capped at 18 nodes and remove themselves. Reduced motion uses static destination-local family frames, target emphasis, and authoritative values instead of travel or disappearing feedback.
- Phase 3's server implementation and event schema did not change. Closing SHA-256 for `server.js`: `D1F2123CF96C1445B2BC1B3A15E298910D1CCC5C80AE3E2794289723D4520834`.

## Pipeline and budgets

- Sources: `assets-src/pixel/catalog-assets.js` and `effect-assets.js`, driven by `GAME_DATA`; there is no second card registry.
- Generator records atlas SHA-256 plus raw-RGBA SHA-256 and opaque-pixel count for every sprite region.
- Validator proves exact registry coverage and dimensions, 8-bit RGBA, nonblank sprites, 31 distinct card/weapon portraits, unique art tokens, complete/supported family use, no missing/orphan outputs, current bytes/hashes, atlas edges at most 1024px, and transfer budgets.
- Critical raster total: 5,107 bytes / 300KB ceiling. Optional card catalogue: 5,144 bytes / 500KB ceiling. Largest atlas: 384x192 / 1024px-per-edge ceiling.
- The optional card atlas is demand-loaded when the active six-card lobby loadout renders. Because active and library portraits share one compact 5KB atlas, the complete portrait bytes arrive before opening Deck; this is a documented size-for-simplicity tradeoff, not an unbounded preload.

## Verification

- `npm run assets:generate` twice: byte-identical eight-file output.
- `npm run assets:check`: 8 files / 67 sprites validated.
- `npm test`: 23/23 passing.
- `npm run test:browser`: passing in installed Edge; no HTTP, failed-request, console, or page errors.
- Browser matrix: 320x700, 390x844, and 1440x900 lobby/battle; six illustrated lobby cards; three illustrated battle cards; illustrated queued and inspector states; Cannon and Volley portraits; ten family sprites in the battle layer; constructed Bellows Guild; two-window keyboard siphon; high-threat Hourglass Curse; and reduced-motion static family treatment.
- `git diff --check`: passing apart from PowerShell's informational line-ending warnings where applicable.

## Files and ownership

- Art sources/output: `assets-src/pixel/`, `scripts/pixel-art/`, `public/assets/pixel/`.
- Catalogue/presentation: `public/game-data.js`, `public/app.js`, `public/index.html`, `public/styles.css`.
- Coverage: `test/assets.test.js`, `test/frontend.test.js`, `test/matchmaking.test.js`, `scripts/browser-smoke.js`.
- Context: `README.md`, `docs/agent/frontend.md`, `docs/agent/gameplay.md`, `docs/agent/testing.md`, and `docs/pixel-art-redesign/`.

## Preserved decisions, deviations, and limitations

- The user explicitly expanded the original visual-only Phase 4 boundary to include the complete visible-name refactor. This changed presentation copy and metadata only; stable keys and gameplay are preserved.
- The permanent names Cannon and Volley were retained because they already fit the medieval direction.
- The higher-priority repository input contract remains immediate primary `pointerdown` plus right-click/F2 inspection; no delayed hold interaction was introduced.
- The six structures have permanent battlefield art. Other cards intentionally use a portrait plus a reusable effect-family treatment rather than one-off village sprites or 29 animation engines.
- Phase 5 still owns the Deck interaction/layout redesign, stable delegated library input, details, filters, ordering, persistence validation, and draft-loss behavior.

## Exact Phase 5 starting point

Begin by reading the root/public/test routes, this handoff, `MASTER_PLAN.md`, `CARD_INVENTORY.md`, and the current Deck renderer. Verify `npm test`, `npm run assets:check`, and `npm run test:browser`. Reuse `cardFrame()` and catalogue classes for selected slots, the 29-card library, weapon rack, and details, but do not disturb battle rendering, the stable hand delegation path, effect/event contracts, or authoritative server validation.
