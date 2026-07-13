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
- zoom/live-region/client markup contracts, stable delegated hand input, and complete right-click inspector metadata
- six-unique-card loadout validation, four-card hands, staged blank slots, swaps, and bottom-of-cycle rotation
- three-hit siphon bursts at the cumulative two-for-one removal rate
- one staged card per category, first-tap locking, counterplay unlocking, and Attack sharing with the permanent weapon
- Wall destruction leaving tap reserves unchanged
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
| Hand deployment, swapping, lane disabling, queued-card tap input, or right-click inspection | Existing source contract test, manual left/right-click pass while state updates, confirm right-click spends nothing, keyboard activation |
| Battlefield layout or cues | Phone-width and desktop-width visual inspection, both weapons, active/pending/siphon states |
| Accessibility | Keyboard-only pass, 200% zoom/narrow reflow, focus visibility, reduced motion, live status behavior |
| Documentation/context only | Link/path check, `git diff --check`, and `npm test` when instructions describe testable behavior |

## Manual battle smoke pass

1. Start a CPU match and confirm both sides begin with 10 taps.
2. Deploy cards from the four-card hand and confirm each flies to the correct battlefield category while its original slot becomes an outlined blank.
3. Stage one card in every category, then tap each battlefield card independently. Confirm only the tapped category locks with a readable busy label.
4. Swap an untouched staged card for a same-category hand card; confirm the old card returns and the new card's original slot becomes blank.
5. Confirm only the chosen weapon appears, Crew animates in the center, Magic animates on the right, and structures fill no more than eight slots.
6. Siphon each enemy zone, checking pips, retreating progress, reserve transfer, and swap availability at zero.
7. Let a card complete and verify its reserved blank fills immediately, the next-card label advances, and the completed card rotates.
8. Break a Wall and confirm neither player's taps jump.
9. Right-click a hand card, staged card, weapon, and visible rival card. Confirm each shows concise stats and spends no tap or progress; confirm left-click still immediately performs its normal action.

If a check cannot be run, state exactly which check and why. Do not silently treat static source inspection as runtime verification.
