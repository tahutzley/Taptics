# Pixel asset inventory

## Pipeline ownership

- Sources: `assets-src/pixel/` (palette and deterministic drawing recipes); shared UI/status recipes live in `assets-src/pixel/ui-assets.js`.
- Generator/validator: `scripts/pixel-art/`.
- Committed runtime output: `public/assets/pixel/`.
- Catalogue metadata: `public/game-data.js` only.
- Commands: `npm run assets:generate`, then `npm run assets:check`.

Runtime never generates assets. Manifest schema version 2 records coordinates, output dimensions, per-sprite `pixelScale`, logical dimensions, byte counts, critical/lazy grouping, atlas hashes, and each sprite region's raw-RGBA hash and opaque-pixel count. Recipes draw directly on coarse logical canvases and the generator expands them with nearest-neighbor 2x, 3x, or 4x blocks into stable runtime slots. Validation rejects stale bytes, missing or orphan output, duplicate sprite names, overlapping atlas regions, invalid/non-RGBA PNGs, nonuniform coarse blocks, invalid scale metadata, blank or duplicate portraits, dimension/hash mismatches, incomplete catalogue coverage, atlases over 1024x1024, and transfer-budget overruns.

## Critical UI set

| Sprite | Source grid -> output slot | Runtime group | Status |
| --- | ---: | --- | --- |
| Missing-card portrait | 12x12 -> 48x48 | Critical UI | Complete |
| Heraldic Taptics crest | 16x16 -> 32x32 | Critical UI | Complete |
| Battle, Deck, Challenges navigation | 8x8 -> 16x16 each | Critical UI | Complete |
| Sound on/off | 8x8 -> 16x16 each | Critical UI | Complete |
| Match search | 8x8 -> 16x16 | Critical UI | Complete |
| Lifecycle warning | 8x8 -> 16x16 | Critical UI | Complete |
| Victory, defeat, and draw emblems | 16x16 -> 32x32 each | Critical UI | Complete |

The Phase 1-2 boundary supplied ten UI sprites, including the temporary `panel-proof` and `icon-tap` pipeline proofs. Phase 6 added four original deterministic programmatic sprites: `status-warning`, `result-victory`, `result-defeat`, and `result-draw`. Phase 7 proved the two pipeline proofs unused and removed them. The current 12 UI sprites remain packed into the same 256x64 `ui-atlas.png`; no extra request or atlas is introduced. The critical budget remains 300KB, and the UI atlas is 952 bytes.

## Battlefield and catalogue sets

| Atlas | Dimensions | Sprites | Loading group | Raster bytes |
| --- | ---: | ---: | --- | ---: |
| `ui-atlas.png` | 256x64 | 12 | Critical | 952 |
| `battle-atlas.png` | 256x128 | 10 | Critical | 1,144 |
| `effects-atlas.png` | 320x32 | 10 | Critical | 622 |
| `weapons-atlas.png` | 96x48 | 2 | Critical | 349 |
| `structures-atlas.png` | 384x64 | 6 | Critical | 960 |
| `cards-atlas.png` | 384x192 | 29 | Optional catalogue | 3,435 |

The 69 original deterministic sprites cover the live UI/battle set, the four Phase 6 lifecycle sprites, all 29 unique 16x16 card glyphs enlarged into 48x48 portraits, both 16x16 permanent-weapon glyphs enlarged into 48x48 portraits, all six 16x16 permanent structures enlarged into 64x64 slots, and one transparent 8x8 glyph enlarged into 32x32 for each of ten effect families. Exact `art` tokens route catalogue recipes; seeded scratches, random texture, fuzzy motif routing, and nonsemantic signature strips are absent. The active lobby loadout and battle hand demand-load the optional card atlas through shared frames; it is not explicitly preloaded. Because active cards share the same compact 3.4KB atlas as the library, its transfer occurs before opening Deck, a deliberate size-for-simplicity tradeoff rather than a missing lazy boundary.

## Complete catalogue set

- Card portraits: 29/29 canonical card keys.
- Weapon portraits: Cannon and Volley, 2/2.
- Permanent structures: Bellows Guild, Alchemist's Furnace, Quartermaster's Guild, Beacon Tower, Outrider Camp, and Verdant Menhir, 6/6.
- Effect families: projectile, siege, restoration, build, resource, buff, delay, counter, ritual, and echo, 10/10.
- Lifecycle status/results: warning, victory, defeat, and draw, 4/4.

The unchanged output slots contain 131,584 physical raster cells, but their recipes now author only 13,072 logical cells: about 10.1x fewer design pixels. Critical raster transfer is 4,027 bytes against the 300KB ceiling. Optional catalogue raster transfer is 3,435 bytes against the 500KB ceiling. The largest atlas is 384x192 against the 1024px-per-edge ceiling. The generated output remains eight files and 69 sprites.

Initials and accessible text remain the missing-art fallback. Generated sprite images are decorative relative to authoritative labels.
