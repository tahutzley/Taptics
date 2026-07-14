# Phase 7 handoff: accessibility, performance, cleanup, and final QA

## Completion boundary

Phase 7 is the release-hardening boundary for the seven-phase siege-ledger redesign. Its accessibility, performance, cleanup, and verification gates apply to the current lobby, stacked Deck builder, battle, queue, dialogs, and results without changing server authority, match rules, balance, or the art direction.

The full 29-card display-name refactor is complete and pinned by `test/catalogue.test.js` and `CARD_INVENTORY.md`. Canonical keys remain stable for saved profiles, Socket.IO payloads, server resolvers, CPU decks, and generated sprite classes. Cannon and Volley retain their names.

Phase 5 owns the current Deck surface: five autosaved loadout tabs, two permanent-weapon roots, six stable slots in Opening Hand/Next in Cycle rows, and 29 stable art-first Armory roots. Search/filter/sort/grouping, shared fixed-height Deck/Armory anatomy, click-expanded actions, visible order numbers, weapon stats, separate Info and position dialogs, explicit insertion/replacement, contextual Remove, single-step Undo, and pointer/touch/keyboard reorder all remain inside the active-complete-loadout and Phase 7 release contracts.

## Accessibility findings and remediation

- Every major surface now participates in a shared 320x700, 390x600 short-height, 390x844, 720x900 shell, and 1440x900 release matrix. The viewport remains scalable, horizontal clipping is rejected, and nonempty live actions retain at least 48px CSS targets.
- Focus uses a 3px charred outline, 3px offset, and 6px heraldic-gold outer ring. The browser gate verifies lobby, selected Deck weapon, arena, leave-dialog action, and result-heading focus after entering keyboard modality.
- Battle cards, staged actions, weapons, and rival inspection targets expose the documented `I`/F2 path. Blocked weapons and pending staged cards remain focusable with `aria-disabled=true`, their activation guards reject Enter/Space, and their inspection path spends nothing. Enter/Space siphoning is tested in a real two-client match. Nonsiphonable rival targets expose `aria-disabled=true`; counterable targets expose `false`.
- The rival reserve is a numeric progressbar whose current value follows the authoritative snapshot. Structure grids are named lists; each built structure is a named list item and empty tiles are hidden decoration.
- Wall-break and high-threat events use one combat live announcement. A duplicate visual toast uses `aria-live=off`; hidden toasts also use `off`. Reconnection clears a stale offline toast.
- Fortify, Clash, Overload, Double Taps, category, pending, disabled, Shield, Wall, delta, focus, result, and locked-Challenges colors were reviewed with their non-color labels, borders, patterns, meters, or emblems. Phase heading/rule contrast and the final result-title colors meet their applicable thresholds.
- Pending project, weapon, and queued-action states are static double-outline/meter cues. Reduced motion removes deployment/effect travel, result particles, result/banner motion, and the siphon tap pulse without removing state information.
- Dialog entry, Tab containment, Escape/cancel policy, background inertness, overlay cleanup, result-heading focus, and deliberate restoration/next-screen focus remain intact.
- Deck Info and position choice are distinct labeled modal surfaces with immediate app-shell inertness, focus containment, Escape/backdrop/visible close-or-cancel behavior, and restoration to the originating control. Info is inspection-only and does not add, remove, or replace cards.
- The Deck uses a naturally scrolling stacked layout, a keyboard-operable five-tab switcher, a stable 3x2 slot tray, and a two/three/four-column Armory that collapses at narrow effective widths. Collapsed cards remain uniform; one expanded action panel may overlap the following row. Search, filters, sort, disclosures, contextual Remove, position choices, Undo, and drag controls retain keyboard equivalents and at least 48px primary targets.
- Deck motion communicates press, selection, status, replacement, reorder, filtering, dialogs, and persistence with bounded transforms/opacity. Reduced motion removes travel, lift, bounce, shift, and expansion while preserving static labels, outlines, insertion positions, final order, focus, and announcements.

## Performance findings and remediation

- The 100ms snapshot path uses guarded text, attribute, style, dataset, and class helpers. Phase, structure, hand, and weapon identity signatures prevent redundant replacement or identity work.
- A warmed 500-identical-snapshot browser benchmark requires an average below 5ms, at most four mutation records, stable hand/structure roots and node count, and no effect or card-flight creation. These thresholds, rather than a recorded machine-specific duration, are the durable release contract.
- Ten clean lobby/game transitions preserve hand roots, exact public Socket.IO listener counts, singleton overlays, and total DOM size while clearing effects and card flights. Repeated Deck visits preserve the six slot roots, all 29 Armory roots, two weapon roots, and one each of the Info and position dialogs; Deck motion clones, drag avatars, and inline transforms are bounded and cleared.
- Battle effects remain capped at 18; result decoration remains capped at six/four and clears; the completed browser workflow enforces its configured DOM ceiling without depending on an exact captured node count.
- Initial loading is same-origin and requests only the UI and compact card atlases. The browser then fetches and decodes every atlas, checks natural dimensions, verifies every generated sprite class and exact 29-card/2-weapon/6-structure/10-family coverage, and reports any HTTP, request, console, or page error.
- The final CSS removes the obsolete blue lobby owner block and provably unused hero, loadout-card, challenge-row, rules, projectile, impact, reserve-notch, actor-shape, and proof selectors/nodes. The active style system remains dependency-free and uses local font stacks.

## Asset and visual cleanup

The final asset set keeps every runtime sprite name, atlas coordinate, CSS class, and output slot stable while authoring the imagery on explicit 8x8, 12x12, or 16x16 logical canvases. Nearest-neighbor 2x/3x/4x expansion produces uniform coarse blocks, so 131,584 output cells require only 13,072 authored cells. Catalogue recipes route exact `art` tokens to distinct silhouettes; effect families use transparent standalone glyphs; seeded texture, fuzzy motif sharing, and nonsemantic signature strips are absent.

The unused `panel-proof` and `icon-tap` pipeline sprites remain removed, and their former recipe owner remains `assets-src/pixel/ui-assets.js`. The current UI atlas contains 12 sprites and 952 bytes; the complete output contains 69 sprites across eight generated files, with 4,027 critical raster bytes and 3,435 optional catalogue bytes.

All shipped raster art remains original deterministic programmatic repository output. No AI-generated, copied, remote, or third-party visual asset is shipped.

## Files and ownership

- Hot rendering, Deck persistence/mutation/reorder/motion, cleanup, ARIA/live state, inspection shortcuts, and reconnect cleanup: `public/app.js`.
- Progressbar/list semantics, Deck workbench/Armory/dialog semantics, shortcut declarations, and retired decorative DOM removal: `public/index.html`.
- Release tokens, responsive Deck/Armory layout, focus/contrast, static pending states, reduced motion, and legacy-selector cleanup: `public/styles.css`.
- UI recipe rename/proof removal and regenerated output: `assets-src/pixel/ui-assets.js`, `scripts/pixel-art/generate.js`, `scripts/pixel-art/validate.js`, `public/assets/pixel/`, and `test/assets.test.js`.
- Release browser/performance matrix and focused source contracts: `scripts/browser-smoke.js`, `test/frontend.test.js`, `test/matchmaking.test.js`, and `test/agent-context.test.js`.
- Current player/agent truth: `README.md`, root/public/test `AGENTS.md`, `docs/agent/`, `MASTER_PLAN.md`, `DESIGN_TOKENS.md`, `ASSET_INVENTORY.md`, `CARD_INVENTORY.md`, historical handoff corrections, and this handoff.

## Verification and captures

| Check | Durable release gate |
| --- | --- |
| `npm test` | Must pass authoritative rules, Socket.IO lifecycle, catalogue, context, assets, and focused frontend contracts without relying on a fixed documented test count. |
| `npm run assets:generate` twice | Must produce byte-identical output. Root `.gitattributes` keeps generated manifest/CSS metadata on LF so Windows checkout conversion cannot falsify the comparison. |
| `npm run assets:check` | Must pass deterministic atlas, manifest, coverage, dimensions, hashes, and size limits. |
| `npm run test:browser` | Installed Edge must pass the release viewports, Deck workflows, lifecycle/result matrix, accessibility checks, stable-root/listener/DOM bounds, and the 500-render performance threshold. |
| `npm start` + HTTP probe | The local server must return the expected Taptics document. |
| `git diff --check` | Must report no whitespace errors; checkout line-ending warnings, if any, remain informational. |
| Lint / format / typecheck / build | Not configured. |

The browser workflow writes ignored PNG captures under `artifacts/browser/`; the exact capture count is diagnostic, not a release contract. It uses software compositing and settled captures for deterministic visual review and covers the five release viewports, a 320-CSS-pixel/2x-scale reduced-motion proxy, idle/searching/offline queue states, all phases, both weapons, all three lanes, all effect families and structures, layered defenses, high-threat pending state, keyboard siphoning, Leave/Info/position dialogs, all result reasons, and reduced-motion states.

Deck coverage includes the stacked workbench; five tabs; stable 3x2 draw order with `#1`-`#6`; responsive Armory; shared Deck/Armory card anatomy; collapsed/expanded actions; permanent-weapon stats; search/filter/sort/no-results recovery; membership identification; contextual Remove; explicit insertion/replacement choices; single-step Undo; pointer and keyboard reorder completion/cancellation; version-6 migration; complete autosave versus partial per-deck battle authority; active-loadout reload and CPU use; transactional storage failure/recovery; focus/scroll restoration; absent Save/Restore controls; and cleanup of bounded motion nodes. The automated 2x-scale fixture remains a reproducible effective-narrow/raster-scale proxy, not a claim of true browser zoom; real 200% zoom remains a manual check when the browser surface exposes it.

The CPU/browser smoke retains initial taps, staged blanks, same-category swap, independent Crew/Magic commitments, weapon use, three-hit keyboard siphoning and reset pips, card completion/cycle advance, Wall-break feedback, `I` inspection without spending, authoritative result handling, fresh rematch paths, and lobby return.

## Preserved decisions and known limitations

- Server authority, event names/payloads, card math, phase math, CPU parity, three-card hand, six-card ordered deck, one unfinished commitment per category, weapon/Attack sharing, and eight-structure cap are unchanged.
- The catalogue stays in `public/game-data.js`; no second gameplay or display-name registry exists.
- Battles use only the selected active record's successfully persisted complete six-card order and weapon. After a successful autosave, complete edits, replacements, reorders, weapon changes, and Undo results promote immediately; incomplete results persist as that record's draft without replacing its battle payload. Failed writes stay volatile and cannot change Battle authority. There is no manual Save/Restore path.
- Online Run It Back remains a fresh global search, not an opponent-specific rematch. A local disconnect remains an unrecorded interruption with no resume path.
- Challenges remains visibly locked. There is no settings screen, pause/resume, active-match persistence, reconnect recovery, account system, database, service worker, lint, formatter, type checker, bundler, or build command.
- The card atlas is marked optional but the six-card lobby loadout demand-loads the same compact 3.4KB atlas before Deck opens. This is an explicit size-for-simplicity tradeoff.
- Real browser zoom stays enabled. Automated coverage uses effective 320px reflow at 2x raster scale because device scale is not itself browser zoom; the live 320px pass and no-clipping matrix are retained as the repeatable release evidence. The in-app browser surface did not expose a directly verifiable zoom percentage, so a true 200% browser-zoom reading was not claimed.

## Decisions to preserve

Keep guarded hot-path writes; phase/structure/hand/weapon signatures; transition cleanup; delegated Deck/hand input; five autosaved loadout records; six stable 3x2 slot roots, 29 stable Armory roots, and two stable weapon roots; shared fixed-height card anatomy and one-card disclosures; explicit atomic position selection; contextual Remove; single-step Undo; arrow-free pointer/touch/keyboard reorder; separate bounded Info/position dialogs; active-complete-loadout authority; declared `I`/F2 inspection; numeric rival reserve; named structure lists; single live announcements; static reduced-motion equivalents; dark/gold focus; bounded effects/results; deterministic 69-sprite output; explicit coarse-grid scales; and the full approved card-name mapping.
