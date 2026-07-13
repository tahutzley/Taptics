# Gameplay contracts

This file records implemented rules, not future design ideas. `public/game-data.js` and `server.js` remain executable truth.

## Match objective and pacing

- Matches end only when a core reaches zero or a player leaves/disconnects; there is no score timeout.
- The product target is a decisive match in roughly 2-4 minutes.
- Each player starts with 360 core HP, 35 Wall HP, 10 taps, and a 40-tap maximum.
- Inputs have a server-enforced 95ms minimum interval. Tapping speed matters, but cannot exceed validation or bypass resource cost.

Phases are derived from elapsed server time:

| Phase | Time | Base regeneration | Damage | Wall building | Tap generation |
| --- | --- | ---: | ---: | ---: | ---: |
| Fortify | 0-25s | 0.78/s | 0.75x | 1.0x | 1x |
| Clash | 25-120s | 0.72/s | 1.0x | 1.0x | 1x |
| Overload | 120s+ | 0.88/s | rises 1.15x -> 2.15x by 240s | falls 0.70x -> 0.35x by 240s | 2x from 180s |

Double Taps multiplies passive, Forge, Reactor, and Scout Camp generation; it does not duplicate manual commitments or card refunds.

## Loadout and cycle

- A loadout is exactly six unique known cards and one permanent Cannon or Volley.
- Three cards are visible. The remaining three form an ordered queue.
- Progress belongs to the card key while that card remains in hand.
- When a card receives its final required tap, its progress clears, it becomes a pending wind-up, the next queued card replaces its hand slot immediately, and the completed card moves to the queue bottom.
- The permanent weapon never enters the deck cycle and cannot store progress after it completes.

Permanent weapons:

| Weapon | Cost | Wind-up | Base damage | Role |
| --- | ---: | ---: | ---: | --- |
| Cannon | 8 | 1.4s | 50 | Efficient, highly telegraphed burst |
| Volley | 3 | 0.18s | 14 | Fast, flexible pressure |

## Commitment lanes

Every card belongs to Attack, Crew, or Magic. Each category permits one unfinished or pending commitment at a time.

- Attack includes the permanent weapon and Attack cards; they lock each other.
- Crew covers villagers, raids, repairs, Wall work, and most structures.
- Magic covers spells, wards, rituals, and unusual rule manipulation.
- A lane releases after its job resolves, or when opponent counterplay drains unfinished progress to zero.
- Different categories can be developed concurrently.

Both client and server mirror the rule for feedback, but `laneAvailable()` on the server is authoritative.

## Siphon counterplay

An opponent may target any visible unfinished commitment with progress above zero. Pending wind-ups cannot be siphoned.

- Each siphon tap costs one reserve tap and obeys the same input cooldown.
- Removal is cashed out in three-tap bursts.
- At tap 3, one committed tap is removed; at tap 6, two more are removed. This implements the cumulative two-siphon-taps-for-one-removal rate while requiring complete three-hit bursts.
- Removed progress returns to the siphoner's reserve, capped at 40.
- A lock is tracked per `source:key`, survives a temporary drain to zero, and clears when the target completes.

The battlefield shows counterable zones and three burst pips. Siphon legality and transfer remain server-side.

## Damage and defenses

Damage is applied Shield -> Wall -> core unless an effect is Wall-only. Core damage is normally permanent; Repair Drone is the explicit healing exception and cannot exceed the starting core value.

- Normal Wall cap: 80 HP.
- Bulwark temporarily raises the cap to 100 HP; excess decays after the effect expires.
- Shield cap: 90 HP.
- A Wall breach refunds 4 taps to its owner plus any Salvage Guild bonus.
- Overload increases damage while progressively weakening new Wall construction to prevent indefinite defense.

## Structures and catalogue

Each village exposes eight structure tiles. `buildStructure()` rejects a ninth structure and enforces per-card copy limits. Some structure cards give a fallback benefit when their build cannot be placed.

The current catalogue contains 29 cards: 6 Attack, 14 Crew, and 9 Magic. Costs, wind-ups, types, descriptions, colors, and structure flags belong in `public/game-data.js`; effects belong in `resolveCard()`. When adding a card:

1. Add one definition with a valid category.
2. Implement its authoritative effect and event behavior.
3. Decide whether it consumes a structure slot and its copy limit.
4. Add focused balance/rule coverage.
5. Update this document if the card introduces or changes a durable rule, not merely catalogue content.

## Balance guardrails

- Preserve meaningful early choices with only 10 starting taps.
- Keep defense useful without enabling permanent stalemates.
- Telegraph high-impact commitments long enough for siphon counterplay.
- Price refunds, generation, healing, and theft against both their tap cost and deck-cycle value.
- Test pacing through full matches; isolated damage-per-tap calculations miss lane locks, wind-ups, Wall salvage, and cycle opportunity cost.
