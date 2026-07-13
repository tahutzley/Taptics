# Phase 7 handoff: accessibility, performance, cleanup, and final QA

## Completion boundary

Phase 7 completes the seven-phase siege-ledger redesign. It hardens the existing lobby, Deck, battle, queue, dialogs, and results without adding a screen, mode, rule, balance change, or new art direction. The work stayed on `codex/taptics-prototype`, preserved the cumulative unstaged phase work, and did not commit or push.

The full 29-card display-name refactor is complete and pinned by `test/catalogue.test.js` and `CARD_INVENTORY.md`. Canonical keys remain stable for saved profiles, Socket.IO payloads, server resolvers, CPU decks, and generated sprite classes. Cannon and Volley retain their names.

## Accessibility findings and remediation

- Every major surface now participates in a shared 320x700, 390x600 short-height, 390x844, 720x900 shell, and 1440x900 release matrix. The viewport remains scalable, horizontal clipping is rejected, and nonempty live actions retain at least 48px CSS targets.
- Focus uses a 3px charred outline, 3px offset, and 6px heraldic-gold outer ring. The browser gate verifies lobby, selected Deck weapon, arena, leave-dialog action, and result-heading focus after entering keyboard modality.
- Battle cards, staged actions, weapons, and rival inspection targets expose the documented `I`/F2 path. Blocked weapons and pending staged cards remain focusable with `aria-disabled=true`, their activation guards reject Enter/Space, and their inspection path spends nothing. Enter/Space siphoning is tested in a real two-client match. Nonsiphonable rival targets expose `aria-disabled=true`; counterable targets expose `false`.
- The rival reserve is a numeric progressbar whose current value follows the authoritative snapshot. Structure grids are named lists; each built structure is a named list item and empty tiles are hidden decoration.
- Wall-break and high-threat events use one combat live announcement. A duplicate visual toast uses `aria-live=off`; hidden toasts also use `off`. Reconnection clears a stale offline toast.
- Fortify, Clash, Overload, Double Taps, category, pending, disabled, Shield, Wall, delta, focus, result, and locked-Challenges colors were reviewed with their non-color labels, borders, patterns, meters, or emblems. Phase heading/rule contrast and the final result-title colors meet their applicable thresholds.
- Pending project, weapon, and queued-action states are static double-outline/meter cues. Reduced motion removes deployment/effect travel, result particles, result/banner motion, and the siphon tap pulse without removing state information.
- Dialog entry, Tab containment, Escape/cancel policy, background inertness, overlay cleanup, result-heading focus, and deliberate restoration/next-screen focus remain intact.

## Performance findings and remediation

- The 100ms snapshot path uses guarded text, attribute, style, dataset, and class helpers. Phase, structure, hand, and weapon identity signatures prevent redundant replacement or identity work.
- A warmed 500-identical-snapshot browser benchmark requires an average below 5ms, at most four mutation records, stable hand/structure roots and node count, and no effect or card-flight creation. The current verified run completed 500 renders in 21.4ms total (0.043ms average) with zero mutations, stable roots, and no effect or card-flight creation.
- Ten clean lobby/game transitions preserve hand roots, exact public Socket.IO listener counts, singleton overlays, and total DOM size while clearing effects and card flights. Ten Deck visits preserve six slot roots, all 29 library roots, the details root, and exact node count.
- Battle effects remain capped at 18; result decoration remains capped at six/four and clears; the completed workflow enforces a final DOM ceiling of 1,200 nodes.
- Initial loading is same-origin and requests only the UI and compact card atlases. The browser then fetches and decodes every atlas, checks natural dimensions, verifies every generated sprite class and exact 29-card/2-weapon/6-structure/10-family coverage, and reports any HTTP, request, console, or page error.
- The final CSS removes the obsolete blue lobby owner block and provably unused hero, loadout-card, challenge-row, rules, projectile, impact, reserve-notch, actor-shape, and proof selectors/nodes. The active style system remains dependency-free and uses local font stacks.

## Asset and visual cleanup

The final asset set keeps every runtime sprite name, atlas coordinate, CSS class, and output slot stable while authoring the imagery on explicit 8x8, 12x12, or 16x16 logical canvases. Nearest-neighbor 2x/3x/4x expansion produces uniform coarse blocks, so 131,584 output cells require only 13,072 authored cells. Catalogue recipes route exact `art` tokens to distinct silhouettes; effect families use transparent standalone glyphs; seeded texture, fuzzy motif sharing, and nonsemantic signature strips are absent.

The unused `panel-proof` and `icon-tap` pipeline sprites remain removed, and their former recipe owner remains `assets-src/pixel/ui-assets.js`. The current UI atlas contains 12 sprites and 952 bytes; the complete output contains 69 sprites across eight generated files, with 4,027 critical raster bytes and 3,435 optional catalogue bytes.

All shipped raster art remains original deterministic programmatic repository output. No AI-generated, copied, remote, or third-party visual asset is shipped.

## Files and ownership

- Hot rendering, cleanup, ARIA/live state, inspection shortcuts, and reconnect cleanup: `public/app.js`.
- Progressbar/list semantics, shortcut declarations, and retired decorative DOM removal: `public/index.html`.
- Release tokens, focus/contrast, static pending states, reduced motion, and legacy-selector cleanup: `public/styles.css`.
- UI recipe rename/proof removal and regenerated output: `assets-src/pixel/ui-assets.js`, `scripts/pixel-art/generate.js`, `scripts/pixel-art/validate.js`, `public/assets/pixel/`, and `test/assets.test.js`.
- Release browser/performance matrix and focused source contracts: `scripts/browser-smoke.js`, `test/frontend.test.js`, `test/matchmaking.test.js`, and `test/agent-context.test.js`.
- Current player/agent truth: `README.md`, root/public/test `AGENTS.md`, `docs/agent/`, `MASTER_PLAN.md`, `DESIGN_TOKENS.md`, `ASSET_INVENTORY.md`, `CARD_INVENTORY.md`, historical handoff corrections, and this handoff.

## Verification and captures

| Check | Final result |
| --- | --- |
| `npm test` | 32/32 passing |
| `npm run assets:generate` twice | Byte-identical generated output across both runs |
| `npm run assets:check` | 8 generated files / 69 sprites passing |
| `npm run test:browser` | Passing in installed Edge; 58 captures; 500 identical renders in 21.4ms with 0 mutations; final DOM 500 nodes |
| `npm start` + HTTP probe | HTTP 200 at temporary `http://localhost:3017` with the expected Taptics title |
| `git diff --check` | Passing; informational checkout line-ending warnings only if emitted |
| Lint / format / typecheck / build | Not configured; no command run. |

The current browser run writes 58 ignored PNG captures under `artifacts/browser/`. It uses software compositing and settled, animation-disabled captures for deterministic visual review, and covers all five release viewports, 320-CSS-pixel/2x-scale reduced-motion lobby/Deck/battle/leave/result fixtures, idle/searching/offline queue states, all phases, both weapons, all three lanes, all ten effect families, all six structures, Shielded/broken defenses, high-threat pending state, keyboard siphoning, leave dialog, victory/defeat/draw/leave/disconnect/interrupted results, and reduced-motion result state.

The automated 320-CSS-pixel/2x-scale fixture is the reproducible effective-narrow/raster-scale proxy. A live in-app pass also used the explicit 320x700 viewport and inspected the responsive lobby. The complete CPU smoke verified initial taps, staged blanks, same-category swap, independent Crew/Magic commitments, weapon use, three-hit keyboard siphoning and reset pips, card completion/cycle advance, Wall-break feedback, `I` inspection without spending, authoritative defeat, and lobby return. The configured Edge workflow separately covers all three categories, two-window online play, exact same-category cycling, all result/rematch paths, Deck persistence, keyboard-only actions, reduced motion, and the five-viewport matrix.

## Preserved decisions and known limitations

- Server authority, event names/payloads, card math, phase math, CPU parity, three-card hand, six-card ordered deck, one unfinished commitment per category, weapon/Attack sharing, and eight-structure cap are unchanged.
- The catalogue stays in `public/game-data.js`; no second gameplay or display-name registry exists.
- Online Run It Back remains a fresh global search, not an opponent-specific rematch. A local disconnect remains an unrecorded interruption with no resume path.
- Challenges remains visibly locked. There is no settings screen, pause/resume, active-match persistence, reconnect recovery, account system, database, service worker, lint, formatter, type checker, bundler, or build command.
- The card atlas is marked optional but the six-card lobby loadout demand-loads the same compact 3.4KB atlas before Deck opens. This is an explicit size-for-simplicity tradeoff.
- Real browser zoom stays enabled. Automated coverage uses effective 320px reflow at 2x raster scale because device scale is not itself browser zoom; the live 320px pass and no-clipping matrix are retained as the repeatable release evidence. The in-app browser surface did not expose a directly verifiable zoom percentage, so a true 200% browser-zoom reading was not claimed.

## Decisions to preserve

Keep guarded hot-path writes, phase/structure/hand/weapon signatures, transition cleanup, delegated Deck/hand listeners, declared `I`/F2 inspection, numeric rival reserve, named structure lists, single live announcements, static pending cues, dark/gold focus, bounded effects/results, deterministic 69-sprite output, explicit coarse-grid scales, and the full approved card-name mapping intact in future work.
