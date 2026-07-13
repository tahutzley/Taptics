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

Run the full `npm test` suite before finishing. If the testing approach or suite scope changes, update `../docs/agent/testing.md` in the same patch.
