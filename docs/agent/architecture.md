# Runtime architecture

This is the current architectural source of truth for Taptics. Read `AGENTS.md` first. Verify details against the code whenever changing them.

## System shape

Taptics is a single-process Node.js prototype with no database and no build step.

```text
Browser (public/) -- Socket.IO actions --> server.js authoritative match state
Browser (public/) <-- snapshots/events ----- server.js 100ms match ticker
        |                                      |
        +------ public/game-data.js -----------+
                 shared definitions
```

Express serves `public/`. Socket.IO handles CPU starts, online matchmaking, actions, state snapshots, match completion, and disconnects. Profile statistics and the chosen loadout are the only durable state, stored locally in the browser. Matches and the queue live in server memory and disappear when the process exits.

## File ownership

- `server.js`: HTTP/Socket.IO setup, queue and match maps, loadout validation, private player state, public serialization, tap/siphon validation, card and weapon resolution, regeneration, phases, bots, and game-over decisions.
- `public/game-data.js`: universal definitions. Node imports it for validation/resolution; the browser reads `window.GAME_DATA` for the builder and UI.
- `public/app.js`: client-only profile, rendering, events, selection, Socket.IO consumption, and presentation feedback.
- `public/index.html`: lobby, battlefield, deck modal, result modal, and accessibility landmarks/live regions.
- `public/styles.css`: all layout, responsive behavior, cues, and animations.
- `test/matchmaking.test.js`: direct server rule tests plus Socket.IO integration and narrow client-contract checks.

## Authoritative flow

1. A client emits `startCpu` or `findMatch` with `{ deck, weapon }`.
2. `validateLoadout()` accepts exactly six known unique cards and a known weapon; invalid input falls back to the default deck and Cannon.
3. `makeMatch()` creates both private player states. Human and CPU players start from the same resource/rule model.
4. A client emits `action` with `type: "tap" | "siphon"`, `source: "weapon" | "card"`, and an optional card `key`.
5. `handleTap()` or `handleSiphon()` revalidates reserve, cooldown, hand membership, pending state, lane ownership, and target progress.
6. Completed commitments become pending jobs with server timestamps. Cards cycle immediately when fully committed; effects resolve after wind-up.
7. `tickMatch()` regenerates resources, resolves jobs, advances the CPU, detects core destruction, and broadcasts a serialized snapshot every 100ms.

Never trust client-reported costs, progress, damage, time, target legality, deck validity, or outcomes.

## State boundaries

Private player state includes exact resource counters, queue order, cooldowns, effect timers, pending jobs, structures, siphon locks, stats, and bot decision state. `publicPlayer()` explicitly constructs the state sent to both clients. Add new public fields there deliberately; do not serialize the private object wholesale.

The public match snapshot has:

- `id`, `mode`, `elapsed`, and derived `phase`
- `players[1]` and `players[2]` public player snapshots
- one monotonic `lastEvent` used for transient animation/audio

Socket events are:

- client -> server: `startCpu`, `findMatch`, `cancelSearch`, `action`, `leaveMatch`
- server -> client: `queueStatus`, `matchFound`, `state`, `gameOver`

## Server extension points

- Change shared catalogue metadata in `public/game-data.js`.
- Change concrete card effects in `resolveCard()` and add focused tests.
- Change match pacing in `phaseAt()`, regeneration in `tickMatch()`, and core constants near the top of `server.js`.
- Change CPU loadouts in `CPU_PLANS`; change its decisions in `chooseBotTarget()`, `chooseBotSiphonTarget()`, and `tickBot()`.
- Change damage routing and Wall salvage in `dealDamage()`.

When adding timers, keep time authoritative and expressed as absolute server timestamps in public pending jobs. When adding match state, decide whether it is private, public, or derived before exposing it.
