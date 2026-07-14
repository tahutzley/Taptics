# Taptics siege-ledger redesign

This directory is the durable implementation plan for the medieval pixel-art redesign. The executable repository remains authoritative; each phase handoff records the verified boundary before the next phase begins.

## Product decisions

- The root `AGENTS.md` contract governs the hand-size conflict: battle uses three visible cards. Phase 3 aligns runtime, UI, tests, README, and routed context; earlier phases remain hand-size-neutral.
- The user authorized a complete card-name refactor. Canonical keys remain stable for protocol, resolver, CPU, asset, and saved-profile compatibility; all 29 player-facing names and related copy change to the approved siege-ledger set in `CARD_INVENTORY.md` during Phase 4.
- Server snapshots remain authoritative. Presentation events are additive and may never predict resources, damage, or outcomes.
- Original runtime art is generated deterministically from repository source. No generative image output or third-party artwork is shipped.
- Generated sprite slots and runtime classes remain stable while source recipes use explicit coarse logical grids and nearest-neighbor 2x/3x/4x expansion. Catalogue art routes by exact art token so every card, weapon, and structure keeps a distinct readable silhouette without seeded texture noise.

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation, tokens, deterministic pipeline, proof sprites | Complete |
| 2 | Shared primitives and lobby/navigation | Complete |
| 3 | Battle, three-card alignment, recent event feedback | Complete |
| 4 | Complete art, effect families, full display-name refactor | Complete |
| 5 | Stacked five-loadout Deck builder, autosave/drafts, shared art-first cards, position choice, reorder, and Info | Complete |
| 6 | Results and lifecycle states | Complete |
| 7 | Accessibility, performance, cleanup, final QA | Complete |

## Invariants

- One catalogue: `public/game-data.js`.
- Six unique cards plus one permanent weapon; canonical keys are stable.
- Three visible hand cards after Phase 3.
- Attack, Crew, and Magic each allow one unfinished commitment; weapon shares Attack.
- Selected weapon only; distinct Crew and Magic zones; eight structure slots.
- Stable delegated hand input and server-authoritative snapshots.
- Five switchable autosaved loadout records; each incomplete per-deck draft leaves its last valid complete battle snapshot authoritative.
- Stable six-slot 3x2 Deck tray, 29-root responsive Armory, two weapon roots with basic stats, shared fixed-height Deck/Armory anatomy, click-expanded Info plus choose/membership/remove actions, visible `#1`-`#6` order, explicit atomic position selection, single-step Undo, and pointer/touch/keyboard reorder without arrows.
- Deck Info and position choice remain separate bounded dialogs; Armory browsing reuses `GAME_DATA`, preserves root identity, and supports search/filter/sort/grouping without a second registry.
- Scalable viewport, visible focus, non-color state grammar, large targets, restrained live status, and reduced-motion equivalence.
- Deterministic 69-sprite coverage, fixed atlas topology, explicit per-sprite pixel scale, and uniform coarse-pixel blocks.

## Verification gates

Every phase runs its focused checks, `npm test`, `git diff --check`, configured asset/browser checks, and an appropriate runtime smoke pass. A phase advances only after its acceptance criteria pass or a limitation is explicitly recorded in its handoff.
