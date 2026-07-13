# Phase 3 handoff: battle and authoritative feedback

Phase 3 is complete. The battle runtime uses the explicit three-card product contract, retains server authority, and presents every retained resolution through a bounded additive event history without changing gameplay arithmetic.

## Implemented boundary

- `GAME_DATA.handSize` is three. A six-card deck opens with three cards and an ordered three-card queue; staging, swapping, immediate cycling, lane locks, CPU parity, and saved canonical keys remain unchanged.
- Each match owns at most 24 `recentEvents`, ordered oldest to newest. `addEvent()` assigns protected monotonic IDs and continues to set legacy `lastEvent`; serialization exposes both.
- Damage events retain `hit`/`wallBreak` and legacy fields while adding `targetSide`, exact `{ shield, wall, core }` routing, and whitelisted `{ before, after, delta }` outcomes. Card resolution derives final core HP, Wall HP, Shield, and discrete tap changes after the existing resolver arithmetic.
- The client validates known event shapes, uses `lastEvent` fallback, deduplicates and sorts unseen IDs, isolates malformed presentation data, and advances replay protection once per selected event. Snapshots remain the only displayed resource authority.
- The medieval battlefield renders separate core, Shield, and Wall meters; selected Cannon or Volley art; distinct Crew/Magic actors; eight structure slots; shared battle/queued card frames; source-relative projectiles; bounded deltas; impact, debris/restoration, and siphon-pip effects; high-threat wind-ups; and restrained live status.
- Keyboard users can inspect own and rival cards with `I` or F2. Siphonable rival zones and cards accept Enter/Space without duplicate pointer activation. Right-click inspection remains no-cost and the delegated hand is rebuilt only when its key/order signature changes.

## Original assets and primitives

`battle-atlas.png` adds ten deterministic repository-authored sprites: core, Wall, Shield, Cannon, Volley, Crew, rune, impact, debris, and siphon pip. `assets-src/pixel/battle-assets.js` owns their recipes; the existing generator produces the atlas, manifest entries, and CSS classes. Runtime effect nodes are capped at 18 and removed after use. Card portraits remain the readable Phase 1 fallback until Phase 4 supplies complete art.

## Verification boundary

- `npm test`: 21 passing tests, including event cap/order, protected IDs, same-tick retention, exact layered damage, Wall break, Field Chirurgeon healing/Shield, Blood Oath self-damage, Bloodthorn Spire dual-sided outcomes, Cutpurse Band transfer, Socket.IO compatibility, and the three-card cycle.
- `npm run assets:check`: 4 generated files and 20 sprites validated.
- `npm run test:browser`: Microsoft Edge passes responsive lobby/battle checks at 320x700, 390x844, and 1440x900; all three lanes; inspection; swapping/cycling; two-window keyboard siphoning; Cannon/Volley; pending ritual; reduced motion; and console/network monitoring.
- Live browser inspection covered 320px, 390px, and desktop battle layouts. The generated atlas also returned HTTP 200 from the current server.
- `git diff --check` is part of the closing gate.

## Decisions and deviations to preserve

- Canonical card/weapon keys, resolver branches, costs, wind-ups, categories, and Socket.IO action/event names are stable. Phase 4 may add only presentation metadata needed by art/effect selection.
- The attached phase prompt referred to a 380 ms touch hold. Current repository contracts instead require immediate primary `pointerdown`, no pointer-time DOM replacement, right-click inspection, and keyboard `I`/F2. Phase 3 preserves that higher-priority input contract; it does not introduce a delayed long-press path that could spend or suppress a tap unpredictably.
- Passive regeneration, Verdant Menhir ticks, and Stone Bulwark decay remain snapshot-only to avoid event flooding.
- Phase 3 does not create the 29 unique portraits, redesign Deck/results, change hidden information, or alter balance.

## Phase 4 starting point

Keep the Phase 3 event schema and battle DOM stable. Implement every display name in `CARD_INVENTORY.md` while preserving canonical keys, add presentation metadata to `public/game-data.js` as the sole catalogue, generate exact 29-card/2-weapon/6-structure art coverage, and map every card to a supported reusable effect family. Integrate art through `cardFrame()` and the existing structures/effect boundary, retain initials as fallback, and rerun asset generation twice before the Phase 4 gate.
