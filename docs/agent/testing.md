# Testing and verification

## Standard checks

Install once with `npm install`. The normal full check is:

```powershell
npm test
```

This uses Node's built-in test runner. Tests start the exported HTTP/Socket.IO server on an ephemeral port, clear the global ticker, close Socket.IO, and close the server during teardown.

Also run:

```powershell
git diff --check
```

Use `npm start` for manual browser verification at `http://localhost:3000`; `npm run dev` restarts Node on server changes.

## Current suite coverage

`test/matchmaking.test.js` currently verifies:

- phase escalation, Overload pressure, and Double Taps at 180 seconds
- zoom/live-region/client markup contracts and stable delegated hand input
- six-unique-card loadout validation and bottom-of-cycle rotation
- three-hit siphon bursts at the cumulative two-for-one removal rate
- one commitment per category and Attack sharing with the permanent weapon
- the eight-structure limit and valid card categories/catalogue size
- online pairing and synchronized authoritative commitments
- CPU use of the same starting taps and visible resource model

`test/agent-context.test.js` keeps the root agent map under 100 lines and fails when a required routed context file is missing or no longer named in the map.

Keep direct function tests deterministic by passing explicit timestamps. Use Socket.IO integration tests for queueing, room broadcasts, connection lifecycle, and client/server payload behavior.

## Verification by change type

| Change | Minimum verification |
| --- | --- |
| Server rule, timing, resource, card effect, or bot logic | Focused direct test plus full `npm test` |
| Socket event or public state shape | Integration test plus full `npm test` |
| Card/category/weapon data | Validation/effect test, builder inspection, full `npm test` |
| Hand selection, lane disabling, or lane-overlay tap input | Existing source contract test, manual rapid switching while state updates, keyboard activation |
| Battlefield layout or cues | Phone-width and desktop-width visual inspection, both weapons, active/pending/siphon states |
| Accessibility | Keyboard-only pass, 200% zoom/narrow reflow, focus visibility, reduced motion, live status behavior |
| Documentation/context only | Link/path check, `git diff --check`, and `npm test` when instructions describe testable behavior |

## Manual battle smoke pass

1. Start a CPU match and confirm both sides begin with 10 taps.
2. Rapidly switch among all three hand cards and the weapon while snapshots arrive; every press should select on the first attempt and move the large action target to the correct battlefield category.
3. Tap the battlefield action target to commit a card in each category and confirm only its category peers lock with a readable category-specific busy label.
4. Confirm only the chosen weapon appears, Crew animates in the center, Magic animates on the right, and structures fill no more than eight slots.
5. Siphon each enemy zone, checking pips, retreating progress, reserve transfer, and release at zero.
6. Let a card complete and verify immediate hand replacement, correct next-card label, and completed-card rotation.

If a check cannot be run, state exactly which check and why. Do not silently treat static source inspection as runtime verification.
