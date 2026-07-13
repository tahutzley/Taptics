# Taptics: Field Prototype

A mobile-first real-time strategy experiment where taps are a finite resource rather than an unlimited input. Matches continue until one core is destroyed and are balanced to resolve in roughly 2-4 minutes.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`. **Battle CPU** starts an authoritative server-simulated training match. Open the app in two browser windows and choose **Search for Battle** in both to test online matchmaking.

## Main menu

The medieval siege-ledger home screen centers the player's local ELO, online matchmaking, and CPU training using original pixel icons, parchment, timber, iron, stone, and heraldic cloth. A compact daily challenge and active loadout sit below the battle controls. Persistent bottom navigation switches between Battle and the full-screen six-card Deck builder at any time; Challenges is visible but disabled for now. The Deck builder has no separate back control and keeps **Save Loadout** above the full card library.

The quartermaster-style Deck screen shows the six-card draw order, both permanent weapons, category filters, all 29 illustrated cards, and a complete card-details surface. Cards have separate Details and Add/Remove controls; selected cards can move left or right with pointer or keyboard controls. Only a valid six-unique-card order can be saved. Unsaved drafts survive Battle navigation and reloads while battles continue using the last saved loadout. Opening Deck cancels active matchmaking so a queued stale loadout cannot interrupt editing; **Restore Saved Loadout** explicitly discards a draft.

If browser storage is unavailable, Deck remains usable for the current page but clearly marks the draft as memory-only. A failed Save never changes the loadout used by Battle and can be retried after storage becomes available.

## Match lifecycle

**Search for Battle** changes into an explicit cancel action while matchmaking is active and reports offline state if the Socket.IO connection is unavailable. Starting a CPU battle or opening Deck cancels an active online search before continuing.

**Leave Battle** opens a confirmation instead of forfeiting immediately. Cancel, Escape, and the safe Stay action return to the running battle; confirming forfeits and returns to the siege ledger. Result screens distinguish victory, defeat, stalemate, rival forfeit, rival disconnect, and a local connection interruption with separate text and original pixel emblems rather than color alone. They include the final core totals, match stats, a tactical read, and clear Run It Back and Lobby actions.

Run It Back always starts fresh: CPU mode creates a new training match, while online mode returns to global matchmaking. A local connection interruption cannot resume the abandoned duel and does not change the local record; after reconnection, the player may begin a new battle. Challenges remains visibly locked, and there is no pause, resume, settings, or reconnect-recovery mode in this prototype.

## Core loop

- Players start with 10 of a maximum 40 taps.
- Every loadout contains exactly six unique cards, with three cards visible in the battle hand and three in the ordered queue.
- Clicking a card deploys it to its Attack, Crew, or Magic battlefield zone and leaves an outlined blank in its original hand slot.
- Up to three cards can be staged at once, one per category. An untouched staged card can be swapped for another hand card in the same category.
- The first committed tap locks that category. Completing the card fills its reserved hand slot with the next queued card and moves the completed card to the bottom of the cycle.
- Each loadout separately chooses **Cannon** or **Volley** as a permanent weapon that never enters the card cycle.
- **Cannon** costs 8 taps, winds up for 1.4 seconds, and deals 50 base damage.
- **Volley** costs 3 taps, resolves in 0.18 seconds, and deals 14 base damage.
- Only the chosen permanent weapon appears on the battlefield. It occupies the left-side Attack zone.
- Cards belong to **Attack**, **Crew**, or **Magic**. Each category has one visible staging lane; it becomes busy only after progress begins or while an action is activating.
- The permanent weapon shares the Attack lane with Attack cards. Crew commitments animate the villagers; Magic commitments animate the rune circle.
- Deployed cards become their own card-colored tap targets over the matching battlefield zones. Both players see the queued identity and exact committed-tap count.
- Constructed cards fill one of eight visible village structure tiles. A ninth structure cannot be built.
- Destroying a Wall does not refund taps or change passive income. Quartermaster's Guild provides steady regeneration instead of breach salvage.
- Partial commitments, tap reserves, and action wind-ups are visible to both players.
- Shield and Wall have separate battlefield meters. Server events preserve every same-tick resolution and report exact Shield, Wall, core, heal, and tap-transfer outcomes for localized feedback.
- Right-click any battle card to inspect its cost and core effect numbers without playing it or spending a tap. Right-click the same card again to close the panel, or right-click another card to switch it. Left click retains its immediate deploy/tap action; left click elsewhere or press Escape also closes the inspector.
- Keyboard players can use `I` or F2 to inspect focused cards, including lane-blocked or winding-up cards and weapons that cannot currently activate, and Enter or Space to siphon a focused rival commitment.

## Siphon counterplay

Any unfinished rival commitment with at least one tap invested becomes a purple target on its Attack, Crew, or Magic zone. Tapping that zone spends from your own reserve and advances a three-hit siphon burst. The first three siphon taps remove one rival committed tap; the next three remove two more, preserving the intended rate of one removal for every two siphon taps while only cashing out complete three-hit bursts. Removed progress is transferred into your reserve.

The three purple pips show the current burst. The rival progress bar visibly retreats when a burst lands. A siphon lock survives if the project is drained to zero and resumes if the rival invests again, but it is cleared when that action completes and enters its wind-up. Pending actions cannot be siphoned.

## Prototype card set

The 29-card prototype collection includes:

- **Attack (6):** War Drums, Blood Oath, Bodkin Bolt, Stonefall, Pinning Volley, and King's Writ.
- **Crew (14):** Bellows Guild, Alchemist's Furnace, Roadside Forager, Hidden Stores, Timber Rampart, Stone Bulwark, Field Chirurgeon, Powder Rogue, Keg Miners, Quartermaster's Guild, Beacon Tower, Cutpurse Band, Outrider Camp, and Stonewrights.
- **Magic (9):** Aegis Ward, Hourglass Curse, Bloodthorn Spire, Hushing Hex, Echo Stones, Stormcall, Grasping Void, Unmaking Sigil, and Verdant Menhir.

Costs range from 3 to 8 taps. Effects include persistent structures, passive regeneration, unit raids, direct tap theft, delayed burst damage, Wall-specific damage, wind-up disruption, weapon amplification, lane-safe stored progress, healing, shielding, and partial-action erasure.

## Match phases

1. **Fortify (0-25s):** damage is reduced by 25%; base regeneration is `+0.78 taps/sec`.
2. **Clash (25-120s):** full damage; base regeneration is `+0.72 taps/sec`.
3. **Overload (120s+):** damage progressively rises from 1.15x to 2.15x while Wall construction falls from 70% to 35% effectiveness. At 180 seconds, **Double Taps** doubles all passive, Bellows Guild, and Alchemist's Furnace tap generation for both players.

There is no score timeout. Overload keeps raising offensive efficiency until a player destroys the opposing core.

The CPU has several complete decks and strategic plans but follows the same hand size, queue order, tap reserve, input rate, card costs, siphon bursts, wind-ups, and information rules as a human player. Once it starts a siphon burst, it tries to finish all three taps before returning to its own build plan.

## Engagement principles under test

- Short complete matches with immediate rematch access
- Visible opponent intent and counterplay instead of surprise outcomes
- Mastery feedback based on reserve efficiency and sequencing
- Varied CPU plans and optional self-imposed field tests
- Stable, readable tap income with no hidden Wall-break rubber-banding
- No paid power, forced timers, or loot boxes; leaving has no separate penalty beyond forfeiting the current duel

## Accessibility baseline

- Body copy is set at 14-16px, with meaningful tactical labels kept at 12px or larger instead of the original 5-9px microtype.
- Primary controls use at least 48px touch areas, exceeding the WCAG 2.2 AA 24px minimum and aligning with mobile platform guidance for comfortably tappable controls.
- The enlarged arena carries core, Wall, intent, and action state directly; the compact reserve HUD and simplified color-coded hand remove duplicate bottom readouts.
- Browser zoom and text enlargement are not disabled. At very narrow effective widths, records, decks, cards, and phase information reflow instead of being clipped.
- Keyboard focus uses a high-contrast visible outline, changing reserve guidance is announced as a live status, and reduced-motion preferences remain supported.
- The rival tap reserve exposes an authoritative numeric progress value, and each village exposes constructed structures as a named list. Visual-only combat notices do not duplicate the dedicated combat announcement.

The sizing pass follows the [WCAG guidance for text enlargement](https://www.w3.org/WAI/WCAG22/Understanding/resize-text), [WCAG target sizing](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), and [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility).

## Verify

```bash
npm test
npm run assets:check
npm run test:browser
```

The browser check uses an installed Microsoft Edge and writes ignored responsive captures under `artifacts/browser/`.

All shipped raster art is original deterministic output from the repository's pixel pipeline. The runtime generates no artwork and fetches no remote fonts, images, or third-party visual assets.

The Socket.IO server owns matchmaking, deck validation, hand and queue order, tap validation, regeneration, card cycling, wind-ups, effects, damage, CPU decisions, and match results. Shared definitions live in `public/game-data.js` so the builder, client, and server use identical card data.
