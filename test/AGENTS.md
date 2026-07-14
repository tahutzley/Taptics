# Test scope

These instructions apply to `test/`. Also obey the root `AGENTS.md` and read `../docs/agent/testing.md`.

## Test conventions

- Use the built-in `node:test` runner and `node:assert/strict`.
- Prefer testing exported authoritative functions directly for deterministic rule behavior.
- Use `socket.io-client` only when the network boundary itself matters.
- Keep integration waits predicate-based and bounded; never add fixed sleeps.
- Clean up sockets, timers, and the shared server so `npm test` exits by itself.
- For client regressions without a browser harness, narrow source/HTML contract assertions are acceptable, but rule behavior belongs in server tests.
- Add or change tests whenever a gameplay invariant, payload shape, deck rule, lane rule, timer threshold, or critical input/accessibility contract changes.
- Deck coverage must prove strict migration to five version-6 loadout records; active/selected tab persistence; complete-edit autosave into battle authority; incomplete per-deck draft survival without replacing the last valid six-card snapshot; transactional storage failure that preserves Battle authority plus later all-record recovery; six stable 3x2 slot roots, 29 stable equal-height Armory roots, and two stable weapon roots; shared Deck/Armory card anatomy; `#1`-`#6` order labels; permanent-weapon headline stats; one-card disclosure with 48px `INFO` plus `CHOOSE POSITION`/`IN DECK #N` or `REMOVE`; explicit replacement/insertion choices; single-step Undo autosave; card-face pointer/touch/keyboard reordering without handles or arrows; queue cancellation; narrow/2x-scale reflow; reduced-motion equivalence; and the absence of manual Save/Restore controls.
- Keep queue, leave, disconnect, and fresh-rematch network behavior in `lifecycle.test.js`. Assert terminal event order and the exact `{ winner, reason, state }` shape instead of reproducing result rules in a client fixture.
- Browser lifecycle coverage must prove focus containment/restoration and inert background for Leave, Result, Deck Info, and Deck position-choice dialogs; cleanup of inspector/toast/Deck motion overlays; non-color result states; progression deduplication; local interruption as a non-result; phone/desktop reflow; and reduced-motion equivalence.
- The release browser matrix must cover 320x700, 390x600, 390x844, the 720px shell, and 1440x900; a 320-CSS-pixel/2x-scale proxy; visible focus and ARIA/live semantics; atlas fetch/decode and all 29/2/6 registry assets; every phase; and bounded render mutations, nodes, effects, and public Socket.IO listeners.

Run the full `npm test` suite before finishing. If the testing approach or suite scope changes, update `../docs/agent/testing.md` in the same patch.

For live browser work, also run `npm run test:browser`; its ignored captures are diagnostic artifacts, not source fixtures.
