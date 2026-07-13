# Pixel asset inventory

## Pipeline ownership

- Sources: `assets-src/pixel/` (palette and deterministic drawing recipes); shared UI/status recipes live in `assets-src/pixel/ui-assets.js`.
- Generator/validator: `scripts/pixel-art/`.
- Committed runtime output: `public/assets/pixel/`.
- Catalogue metadata: `public/game-data.js` only.
- Commands: `npm run assets:generate`, then `npm run assets:check`.

Runtime never generates assets. The manifest records coordinates, dimensions, byte counts, critical/lazy grouping, atlas hashes, and each sprite region's raw-RGBA hash and opaque-pixel count. Validation rejects stale bytes, missing or orphan output, duplicate sprite names, overlapping atlas regions, invalid/non-RGBA PNGs, blank or duplicate portraits, dimension/hash mismatches, incomplete catalogue coverage, atlases over 1024x1024, and transfer-budget overruns.

## Critical UI set

| Sprite | Logical size | Runtime group | Status |
| --- | ---: | --- | --- |
| Missing-card portrait | 48x48 | Critical UI | Complete |
| Heraldic Taptics crest | 32x32 | Critical UI | Complete |
| Battle, Deck, Challenges navigation | 16x16 each | Critical UI | Complete |
| Sound on/off | 16x16 each | Critical UI | Complete |
| Match search | 16x16 | Critical UI | Complete |
| Lifecycle warning | 16x16 | Critical UI | Complete |
| Victory, defeat, and draw emblems | 32x32 each | Critical UI | Complete |

The Phase 1-2 boundary supplied ten UI sprites, including the temporary `panel-proof` and `icon-tap` pipeline proofs. Phase 6 added four original deterministic programmatic sprites: `status-warning`, `result-victory`, `result-defeat`, and `result-draw`. Phase 7 proved the two pipeline proofs unused and removed them. The current 12 UI sprites remain packed into the same 256x64 `ui-atlas.png`; no extra request or atlas is introduced. The critical budget remains 300KB, and the UI atlas is 1,128 bytes.

## Battlefield and catalogue sets

| Atlas | Dimensions | Sprites | Loading group | Raster bytes |
| --- | ---: | ---: | --- | ---: |
| `ui-atlas.png` | 256x64 | 12 | Critical | 1,128 |
| `battle-atlas.png` | 256x128 | 10 | Critical | 1,388 |
| `effects-atlas.png` | 320x32 | 10 | Critical | 1,003 |
| `weapons-atlas.png` | 96x48 | 2 | Critical | 546 |
| `structures-atlas.png` | 384x64 | 6 | Critical | 1,256 |
| `cards-atlas.png` | 384x192 | 29 | Optional catalogue | 5,144 |

The 69 original deterministic sprites cover the live UI/battle set, the four Phase 6 lifecycle sprites, all 29 unique 48x48 card portraits, both unique 48x48 permanent-weapon portraits, all six 64x64 permanent structures, and one 32x32 sprite for each of ten effect families. The active lobby loadout and battle hand demand-load the optional card atlas through shared frames; it is not explicitly preloaded. Because active cards share the same compact 5KB atlas as the library, its transfer occurs before opening Deck, a deliberate size-for-simplicity tradeoff rather than a missing lazy boundary.

## Complete catalogue set

- Card portraits: 29/29 canonical card keys.
- Weapon portraits: Cannon and Volley, 2/2.
- Permanent structures: Bellows Guild, Alchemist's Furnace, Quartermaster's Guild, Beacon Tower, Outrider Camp, and Verdant Menhir, 6/6.
- Effect families: projectile, siege, restoration, build, resource, buff, delay, counter, ritual, and echo, 10/10.
- Lifecycle status/results: warning, victory, defeat, and draw, 4/4.

Critical raster transfer is 5,321 bytes against the 300KB ceiling. Optional catalogue raster transfer is 5,144 bytes against the 500KB ceiling. The largest atlas is 384x192 against the 1024px-per-edge ceiling. The generated output remains eight files and 69 sprites.

Initials and accessible text remain the missing-art fallback. Generated sprite images are decorative relative to authoritative labels.
