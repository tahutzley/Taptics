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

Express serves `public/`. Socket.IO handles CPU starts, online matchmaking, actions, state snapshots, match completion, and disconnects. Profile statistics, the chosen loadout, and an optional unsaved Deck draft are the only durable state, stored locally in the browser. Matches and the queue live in server memory and disappear when the process exits. Drafts are client-only and are never sent when a match starts.

## File ownership

- `server.js`: HTTP/Socket.IO setup, queue and match maps, loadout validation, private player state, public serialization, tap/siphon validation, card and weapon resolution, regeneration, phases, bots, and game-over decisions.
- `public/game-data.js`: universal definitions. Node imports it for validation/resolution; the browser reads `window.GAME_DATA` for the builder and UI.
- `public/app.js`: client-only profile, rendering, events, selection, Socket.IO consumption, and presentation feedback.
- `public/index.html`: lobby, battlefield, full-screen Deck, result modal, and accessibility landmarks/live regions.
- `public/styles.css`: all layout, responsive behavior, cues, and animations.
- `test/matchmaking.test.js`: direct server rule tests plus online/CPU integration and narrow client-contract checks.
- `test/lifecycle.test.js`: focused Socket.IO coverage for queue cancellation, queue-to-CPU interruption, leave/disconnect terminal payloads, and clean online rematches.
- `assets-src/pixel/` and `scripts/pixel-art/`: deterministic source recipes and the dependency-free PNG generator/validator. Generated runtime files live in `public/assets/pixel/`; runtime never invokes the generator.

## Authoritative flow

1. A client emits `startCpu` or `findMatch` with `{ deck, weapon }`.
2. `validateLoadout()` accepts exactly six own-property catalogue keys with no duplicates and one own-property weapon key. Any malformed, short, oversized, duplicate, unknown, inherited, or non-array deck falls back atomically to the default deck; an invalid weapon falls back independently to Cannon.
3. `makeMatch()` creates both private player states. Human and CPU players start from the same resource/rule model.
4. A client emits `action` with `type: "place" | "tap" | "siphon"`. Placement carries `key` and `slot`; tap/siphon carry `source` and an optional card `key`.
5. `handlePlaceCard()` validates hand-slot ownership and zero-progress swaps. `handleTap()` and `handleSiphon()` revalidate reserve, cooldown, placed-card membership, pending state, lane ownership, and target progress.
6. Completed commitments become pending jobs with server timestamps. The card's reserved blank slot draws immediately; effects resolve after wind-up.
7. `tickMatch()` regenerates resources, resolves jobs, advances the CPU, detects core destruction, and broadcasts a serialized snapshot every 100ms.

Never trust client-reported costs, progress, damage, time, target legality, deck validity, or outcomes.

The browser applies the same strict saved-loadout predicate before enabling Save and when migrating local profile version 5, but this is convenience and consistency rather than authority. Opening Deck while queued emits `cancelSearch`; the server still validates the loadout again for every CPU or online start.

## State boundaries

Private player state includes exact resource counters, hand/queue order, per-category `placed` entries, cooldowns, effect timers, pending jobs, structures, siphon locks, stats, and bot decision state. `publicPlayer()` explicitly constructs the state sent to both clients. Add new public fields there deliberately; do not serialize the private object wholesale.

The public match snapshot has:

- `id`, `mode`, `elapsed`, and derived `phase`
- `players[1]` and `players[2]` public player snapshots
- legacy monotonic `lastEvent` plus a bounded, ordered `recentEvents` buffer used for transient presentation

`recentEvents` retains the latest 24 events and remains additive to `lastEvent` for older consumers. Every event has a monotonic integer `id`, `type`, `side`, and server timestamp. Damage events identify `targetSide`, report exact Shield/Wall/core routing in `damage`, and expose changed authoritative resource fields through `outcomes[side][field] = { before, after, delta }`. Card-resolution events use the same outcome schema for healing, Shield, tap transfer, and self-damage. Presentation clients deduplicate by event ID and never infer outcomes from effects.

Socket events are:

- client -> server: `startCpu`, `findMatch`, `cancelSearch`, `action`, `leaveMatch`
- server -> client: `queueStatus`, `matchFound`, `state`, `gameOver`

## Queue and terminal lifecycle

`findMatch` first validates and stores the requested loadout, clears any prior match, and removes the socket from any earlier queue position. An unmatched client receives `{ searching: true }`; `cancelSearch` removes it and returns `{ searching: false }`. `startCpu` also removes the socket from online search before creating a fresh CPU match, so a queued player cannot be consumed by a later online pairing.

`finish(match, winner, reason)` is the only terminal server path. It marks the match ended, emits the final serialized `state`, then emits exactly `{ winner, reason, state }` as `gameOver`, and finally removes the match from memory. `winner` is side `1`, side `2`, or `0` for a simultaneous core draw. `reason` is `core`, `leave`, or `disconnect`. Voluntary leave awards the other side and reaches both connected players; disconnect awards the surviving side, while the disconnected socket necessarily cannot receive its own terminal event.

There is no resumable match or private rematch room. CPU rematch creates a new CPU match, and online rematch returns to the global queue for a new authoritative match. A reconnect after a local transport interruption may begin a fresh battle only; the abandoned match is never reconstructed from client state.

## Server extension points

- Change shared catalogue metadata in `public/game-data.js`.
- Change concrete card effects in `resolveCard()` and add focused tests.
- Change match pacing in `phaseAt()`, regeneration in `tickMatch()`, and core constants near the top of `server.js`.
- Change CPU loadouts in `CPU_PLANS`; change its decisions in `chooseBotTarget()`, `chooseBotSiphonTarget()`, and `tickBot()`.
- Change damage routing and Wall-break events in `dealDamage()`.

When adding timers, keep time authoritative and expressed as absolute server timestamps in public pending jobs. When adding match state, decide whether it is private, public, or derived before exposing it.
