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
- Deck coverage must prove strict malformed-profile migration, stable delegated roots, all-card details/toggles, exact reordering and persistence into a CPU match, draft survival, queue cancellation, narrow/2x-scale reflow, and 48px actions.
- Keep queue, leave, disconnect, and fresh-rematch network behavior in `lifecycle.test.js`. Assert terminal event order and the exact `{ winner, reason, state }` shape instead of reproducing result rules in a client fixture.
- Browser lifecycle coverage must prove dialog focus containment/restoration, inert background, cleanup of inspector/toast overlays, non-color result states, progression deduplication, local interruption as a non-result, phone/desktop reflow, and reduced-motion equivalence.
- The release browser matrix must cover 320x700, 390x600, 390x844, the 720px shell, and 1440x900; a 320-CSS-pixel/2x-scale proxy; visible focus and ARIA/live semantics; atlas fetch/decode and all 29/2/6 registry assets; every phase; and bounded render mutations, nodes, effects, and public Socket.IO listeners.

Run the full `npm test` suite before finishing. If the testing approach or suite scope changes, update `../docs/agent/testing.md` in the same patch.

For live browser work, also run `npm run test:browser`; its ignored captures are diagnostic artifacts, not source fixtures.
