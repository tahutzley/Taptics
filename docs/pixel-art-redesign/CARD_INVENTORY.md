# Card naming, art, and effect inventory

Canonical keys below remain stable. Phase 4 applied every display name, short label, medieval description, portrait, and effect-family mapping together, so saved decks and Socket.IO payloads remain compatible. `public/game-data.js` is the executable source of truth; this table is the durable inventory and review aid.

| Category | Canonical key | Display name | Short | Portrait motif | Effect family |
| --- | --- | --- | --- | --- | --- |
| Attack | `overclock` | War Drums | WD | hide drums and raised mallets | buff |
| Attack | `berserker` | Blood Oath | BO | frenzy helm and blood rune | buff/self-damage |
| Attack | `piercingShot` | Bodkin Bolt | BB | bolt through a shield | projectile |
| Attack | `siegeSalvo` | Stonefall | ST | trebuchet barrage | siege |
| Attack | `suppressingFire` | Pinning Volley | PV | dense arrow rain | projectile/delay |
| Attack | `executionOrder` | King's Writ | KW | sealed writ and sword | projectile/execution |
| Crew | `tapForge` | Bellows Guild | BG | anvil, hammer, bellows | build/economy |
| Crew | `glassReactor` | Alchemist's Furnace | AF | alembic over a furnace | build/self-damage |
| Crew | `scavenger` | Roadside Forager | RF | hooded gatherer and sack | resource gain |
| Crew | `emergencyCache` | Hidden Stores | HS | supply chest and bandage | resource/heal |
| Crew | `rampart` | Timber Rampart | TR | fresh palisade | build/Wall |
| Crew | `bulwark` | Stone Bulwark | SB | tower shield and blocks | build/Wall |
| Crew | `repairDrone` | Field Chirurgeon | FC | healer's satchel and lantern | heal/Shield |
| Crew | `saboteur` | Powder Rogue | PR | hooded figure and powder jar | resource/damage |
| Crew | `sappers` | Keg Miners | KM | miners and powder keg | siege |
| Crew | `salvageGuild` | Quartermaster's Guild | QG | cart, crates, pennant | build/economy |
| Crew | `watchtower` | Beacon Tower | BT | stone tower and brazier | build/buff |
| Crew | `pickpockets` | Cutpurse Band | CB | hand and coin purse | resource transfer |
| Crew | `scoutCamp` | Outrider Camp | OC | tent, fire, banner | build/economy |
| Crew | `masonCrew` | Stonewrights | SW | mallet and dressed stone | Wall heal |
| Magic | `phaseShield` | Aegis Ward | AW | runed shield | Shield |
| Magic | `timeBomb` | Hourglass Curse | HC | bound hourglass charge | ritual/explosion |
| Magic | `leechSpire` | Bloodthorn Spire | BS | thorned blood spire | damage/Wall heal |
| Magic | `jammer` | Hushing Hex | HH | broken bell and hush rune | delay/hex |
| Magic | `echoRelay` | Echo Stones | ES | twin mirrored runestones | echo/progress |
| Magic | `arcLightning` | Stormcall | SL | forked lightning | direct spell |
| Magic | `gravityWell` | Grasping Void | GV | violet vortex stone | delay/hex |
| Magic | `nullSigil` | Unmaking Sigil | US | crossed broken rune | counter |
| Magic | `growthRune` | Verdant Menhir | VM | vine-covered menhir | build/Shield regen |

Weapons remain Cannon and Volley: their names already match the medieval art direction. Both use original deterministic bombard and archer portraits and map to the siege and projectile families respectively.
