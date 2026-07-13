# Taptics: Field Prototype

A mobile-first real-time strategy experiment where taps are a finite resource rather than an unlimited input. Matches continue until one core is destroyed and are balanced to resolve in roughly 2-4 minutes.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`. **Play CPU** starts an authoritative server-simulated training match. Open the app in two browser windows and choose **Find Rival** in both to test online matchmaking.

## Core loop

- Players start with 10 of a maximum 40 taps.
- Every loadout contains exactly six unique cards, with three cards visible in the battle hand.
- Completing a card immediately replaces it with the next queued card and moves the completed card to the bottom of the cycle.
- Partial tap progress stays attached to its card while that card remains in the hand.
- Each loadout separately chooses **Cannon** or **Volley** as a permanent weapon that never enters the card cycle.
- **Cannon** costs 8 taps, winds up for 1.4 seconds, and deals 50 base damage.
- **Volley** costs 3 taps, resolves in 0.18 seconds, and deals 14 base damage.
- Only the chosen permanent weapon appears on the battlefield. It occupies the left-side Attack zone.
- Cards belong to **Attack**, **Crew**, or **Magic**. Each category has one commitment lane, so a second card in that category is disabled while another is unfinished or activating.
- The permanent weapon shares the Attack lane with Attack cards. Crew commitments animate the villagers; Magic commitments animate the rune circle.
- Selecting a hand card places its card-colored tap target directly over the matching Attack, Crew, or Magic battlefield zone; there is no detached bottom tap button.
- Constructed cards fill one of eight visible village structure tiles. A ninth structure cannot be built.
- Destroying a wall salvages 4 taps for its owner, preserving a defensive decision after a breach.
- Partial commitments, tap reserves, and action wind-ups are visible to both players.

## Siphon counterplay

Any unfinished rival commitment with at least one tap invested becomes a purple target on its Attack, Crew, or Magic zone. Tapping that zone spends from your own reserve and advances a three-hit siphon burst. The first three siphon taps remove one rival committed tap; the next three remove two more, preserving the intended rate of one removal for every two siphon taps while only cashing out complete three-hit bursts. Removed progress is transferred into your reserve.

The three purple pips show the current burst. The rival progress bar visibly retreats when a burst lands. A siphon lock survives if the project is drained to zero and resumes if the rival invests again, but it is cleared when that action completes and enters its wind-up. Pending actions cannot be siphoned.

## Prototype card set

The 29-card prototype collection includes:

- **Attack (6):** weapon amplifiers and direct pressure such as Piercing Shot, Siege Salvo, Suppressing Fire, and Execution Order.
- **Crew (14):** workers, units, thieves, repairs, and structures including Tap Forge, Watchtower, Scout Camp, Pickpocket Crew, Sapper Team, and Mason Crew.
- **Magic (9):** spells, wards, rituals, and counterplay including Phase Shield, Time Bomb, Arc Lightning, Gravity Well, Null Sigil, and Growth Rune.

Costs range from 3 to 8 taps. Effects include persistent structures, passive regeneration, unit raids, direct tap theft, delayed burst damage, Wall-specific damage, wind-up disruption, weapon amplification, lane-safe stored progress, healing, shielding, and partial-action erasure.

## Match phases

1. **Fortify (0-25s):** damage is reduced by 25%; base regeneration is `+0.78 taps/sec`.
2. **Clash (25-120s):** full damage; base regeneration is `+0.72 taps/sec`.
3. **Overload (120s+):** damage progressively rises from 1.15x to 2.15x while Wall construction falls from 70% to 35% effectiveness. At 180 seconds, **Double Taps** doubles all passive, Tap Forge, and Glass Reactor tap generation for both players.

There is no score timeout. Overload keeps raising offensive efficiency until a player destroys the opposing core.

The CPU has several complete decks and strategic plans but follows the same hand size, queue order, tap reserve, input rate, card costs, siphon bursts, wind-ups, and information rules as a human player. Once it starts a siphon burst, it tries to finish all three taps before returning to its own build plan.

## Engagement principles under test

- Short complete matches with immediate rematch access
- Visible opponent intent and counterplay instead of surprise outcomes
- Mastery feedback based on reserve efficiency and sequencing
- Varied CPU plans and optional self-imposed field tests
- Close-game recovery through wall salvage rather than hidden rubber-banding
- No paid power, forced timers, loot boxes, or penalties for leaving

## Accessibility baseline

- Body copy is set at 14-16px, with meaningful tactical labels kept at 12px or larger instead of the original 5-9px microtype.
- Primary controls use at least 48px touch areas, exceeding the WCAG 2.2 AA 24px minimum and aligning with mobile platform guidance for comfortably tappable controls.
- The enlarged arena carries core, Wall, intent, and action state directly; the compact reserve HUD and simplified color-coded hand remove duplicate bottom readouts.
- Browser zoom and text enlargement are not disabled. At very narrow effective widths, records, decks, cards, and phase information reflow instead of being clipped.
- Keyboard focus uses a high-contrast visible outline, changing reserve guidance is announced as a live status, and reduced-motion preferences remain supported.

The sizing pass follows the [WCAG guidance for text enlargement](https://www.w3.org/WAI/WCAG22/Understanding/resize-text), [WCAG target sizing](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), and [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility).

## Verify

```bash
npm test
```

The Socket.IO server owns matchmaking, deck validation, hand and queue order, tap validation, regeneration, card cycling, wind-ups, effects, damage, CPU decisions, and match results. Shared definitions live in `public/game-data.js` so the builder, client, and server use identical card data.
