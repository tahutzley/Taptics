(function exposeGameData(root) {
  const data = {
    effectFamilies: {
      projectile: { name: "Projectile", className: "projectile", color: "#d46b3e", intensity: 1, pitch: 180 },
      siege: { name: "Siege", className: "siege", color: "#a85b43", intensity: 1.45, pitch: 90 },
      restore: { name: "Restoration", className: "restore", color: "#65a25c", intensity: 1, pitch: 520 },
      build: { name: "Build", className: "build", color: "#787064", intensity: 1.15, pitch: 240 },
      resource: { name: "Resource", className: "resource", color: "#d3a53b", intensity: .9, pitch: 620 },
      buff: { name: "War Chant", className: "buff", color: "#b4713e", intensity: 1.1, pitch: 320 },
      delay: { name: "Hex", className: "delay", color: "#76639b", intensity: 1, pitch: 210 },
      counter: { name: "Counter", className: "counter", color: "#9479b2", intensity: 1.2, pitch: 390 },
      ritual: { name: "Ritual", className: "ritual", color: "#8f4f65", intensity: 1.5, pitch: 120 },
      echo: { name: "Echo", className: "echo", color: "#6c8790", intensity: .95, pitch: 460 }
    },
    weapons: {
      cannon: { name: "Cannon", short: "C", cost: 8, windup: 1400, damage: 50, color: "#d3a53b", art: "iron-bombard", effectFamily: "siege", description: "A heavy iron bombard with an efficient shot and visible wind-up." },
      volley: { name: "Volley", short: "V", cost: 3, windup: 180, damage: 14, color: "#8ca34a", art: "three-archers", effectFamily: "projectile", description: "Three archers loose fast pressure with little warning and lower efficiency." }
    },
    categories: {
      attack: { name: "Attack", short: "ATK", color: "#d46b3e", description: "Direct strikes and weapon tactics" },
      crew: { name: "Crew", short: "CRW", color: "#8ca34a", description: "Villagers, structures, repairs and raids" },
      magic: { name: "Magic", short: "MAG", color: "#896bb5", description: "Spells, wards and unusual rule-breaking effects" }
    },
    cards: {
      tapForge: { name: "Bellows Guild", short: "BG", cost: 8, windup: 1700, type: "structure", category: "crew", structure: true, color: "#8ca34a", art: "anvil-bellows", effectFamily: "build", description: "Build a bellows guild: +0.20 taps/sec and refund 2 taps. Maximum three." },
      glassReactor: { name: "Alchemist's Furnace", short: "AF", cost: 6, windup: 900, type: "structure", category: "crew", structure: true, color: "#9aaa58", art: "alembic-furnace", effectFamily: "build", description: "Build an alchemical furnace: +0.28 taps/sec for 18 core HP. Maximum two." },
      scavenger: { name: "Roadside Forager", short: "RF", cost: 4, windup: 1100, type: "unit", category: "crew", color: "#a98748", art: "forager-sack", effectFamily: "resource", description: "Send a forager beyond the Wall and recover 8 taps after a delay." },
      emergencyCache: { name: "Hidden Stores", short: "HS", cost: 3, windup: 350, type: "support", category: "crew", color: "#b49a62", art: "chest-bandage", effectFamily: "restore", description: "Reveal hidden stores to recover 5 taps and patch 10 Wall HP." },
      rampart: { name: "Timber Rampart", short: "TR", cost: 5, windup: 650, type: "build", category: "crew", color: "#7e744f", art: "fresh-palisade", effectFamily: "build", description: "Raise a timber rampart for 28 Wall HP. Weaker during Overload." },
      bulwark: { name: "Stone Bulwark", short: "SB", cost: 8, windup: 1500, type: "build", category: "crew", color: "#787064", art: "shield-stone", effectFamily: "build", description: "Raise 48 Wall HP and support a temporary 100 HP cap." },
      phaseShield: { name: "Aegis Ward", short: "AW", cost: 6, windup: 700, type: "ward", category: "magic", color: "#6195a2", art: "runed-shield", effectFamily: "restore", description: "Draw an aegis that creates 45 Shield HP before your Wall." },
      repairDrone: { name: "Field Chirurgeon", short: "FC", cost: 7, windup: 2200, type: "unit", category: "crew", color: "#65a25c", art: "satchel-lantern", effectFamily: "restore", description: "Restore 30 core HP, or create 20 Shield HP at full core health." },
      saboteur: { name: "Powder Rogue", short: "PR", cost: 5, windup: 750, type: "unit", category: "crew", color: "#8d6753", art: "rogue-powder", effectFamily: "resource", description: "A powder rogue deals 12 damage and destroys 2 rival reserve taps." },
      sappers: { name: "Keg Miners", short: "KM", cost: 6, windup: 1200, type: "unit", category: "crew", color: "#a85b43", art: "miners-keg", effectFamily: "siege", description: "Keg miners deal 55 Wall damage, or 15 if the Wall is gone." },
      timeBomb: { name: "Hourglass Curse", short: "HC", cost: 8, windup: 4000, type: "ritual", category: "magic", color: "#a8473b", art: "bound-hourglass", effectFamily: "ritual", description: "A visible four-second curse erupts for 65 base damage." },
      leechSpire: { name: "Bloodthorn Spire", short: "BS", cost: 7, windup: 1800, type: "ritual", category: "magic", color: "#8f4f65", art: "bloodthorn-spire", effectFamily: "ritual", description: "Deal 25 damage and weave it into up to 25 Wall HP." },
      jammer: { name: "Hushing Hex", short: "HH", cost: 5, windup: 500, type: "hex", category: "magic", color: "#76639b", art: "broken-bell", effectFamily: "delay", description: "Delay rival wind-ups by 1.5s and halve regeneration for 5s." },
      overclock: { name: "War Drums", short: "WD", cost: 5, windup: 450, type: "tactic", category: "attack", color: "#b4713e", art: "hide-drums", effectFamily: "buff", description: "Beat a war rhythm: your next weapon deals 60% more damage." },
      berserker: { name: "Blood Oath", short: "BO", cost: 4, windup: 250, type: "tactic", category: "attack", color: "#a8473b", art: "helm-blood-rune", effectFamily: "buff", description: "The next weapon deals 35% more damage, but your core immediately loses 12 HP." },
      echoRelay: { name: "Echo Stones", short: "ES", cost: 6, windup: 1000, type: "rune", category: "magic", color: "#6c8790", art: "mirror-runestones", effectFamily: "echo", description: "Store 2 taps in one available card from each commitment lane." },
      salvageGuild: { name: "Quartermaster's Guild", short: "QG", cost: 5, windup: 1000, type: "structure", category: "crew", structure: true, color: "#9b7a45", art: "cart-crates", effectFamily: "build", description: "Build a quartermaster's guild for steady +0.10 taps/sec. Maximum three." },

      piercingShot: { name: "Bodkin Bolt", short: "BB", cost: 5, windup: 550, type: "strike", category: "attack", color: "#c47a45", art: "bolt-shield", effectFamily: "projectile", description: "Loose a bodkin strike for 30 damage. Reliable, fast attack-lane pressure." },
      siegeSalvo: { name: "Stonefall", short: "ST", cost: 6, windup: 1100, type: "siege", category: "attack", color: "#a85b43", art: "trebuchet-stones", effectFamily: "siege", description: "Drop 48 damage onto a Wall, or 28 damage when no Wall remains." },
      suppressingFire: { name: "Pinning Volley", short: "PV", cost: 4, windup: 350, type: "tactic", category: "attack", color: "#c18b45", art: "arrow-rain", effectFamily: "projectile", description: "Deal 18 damage and delay a pending rival weapon by 0.8 seconds." },
      executionOrder: { name: "King's Writ", short: "KW", cost: 7, windup: 900, type: "strike", category: "attack", color: "#a8473b", art: "writ-sword", effectFamily: "projectile", description: "Deal 42 damage, increased to 60 against a core below half health." },

      watchtower: { name: "Beacon Tower", short: "BT", cost: 6, windup: 1200, type: "structure", category: "crew", structure: true, color: "#a98748", art: "tower-brazier", effectFamily: "build", description: "Build a beacon tower: permanent weapons deal 10% more damage. Maximum two." },
      pickpockets: { name: "Cutpurse Band", short: "CB", cost: 4, windup: 700, type: "unit", category: "crew", color: "#7d6a58", art: "hand-purse", effectFamily: "resource", description: "Steal up to 3 taps directly from the rival reserve." },
      scoutCamp: { name: "Outrider Camp", short: "OC", cost: 5, windup: 900, type: "structure", category: "crew", structure: true, color: "#7f984b", art: "tent-banner", effectFamily: "build", description: "Build an outrider camp: scouts generate +0.12 taps/sec. Maximum two." },
      masonCrew: { name: "Stonewrights", short: "SW", cost: 4, windup: 500, type: "unit", category: "crew", color: "#787064", art: "mallet-stone", effectFamily: "restore", description: "Rapidly restore 22 Wall HP without occupying a structure tile." },

      arcLightning: { name: "Stormcall", short: "SL", cost: 6, windup: 800, type: "spell", category: "magic", color: "#6195a2", art: "forked-lightning", effectFamily: "projectile", description: "Call a storm for 36 damage with almost no warning." },
      gravityWell: { name: "Grasping Void", short: "GV", cost: 5, windup: 700, type: "spell", category: "magic", color: "#725994", art: "vortex-stone", effectFamily: "delay", description: "Delay all rival wind-ups by 0.8s and halve regeneration for 3s." },
      nullSigil: { name: "Unmaking Sigil", short: "US", cost: 6, windup: 450, type: "counterspell", category: "magic", color: "#9479b2", art: "crossed-rune", effectFamily: "counter", description: "Erase up to 3 taps from the rival's most-developed unfinished action." },
      growthRune: { name: "Verdant Menhir", short: "VM", cost: 5, windup: 1000, type: "structure", category: "magic", structure: true, color: "#65a25c", art: "vine-menhir", effectFamily: "build", description: "Raise a verdant menhir that slowly regenerates Shield HP. Maximum two." }
    },
    weaponStats: {
      cannon: ["50 DAMAGE", "1.4s WIND-UP"],
      volley: ["14 DAMAGE", "0.18s WIND-UP"]
    },
    cardStats: {
      tapForge: ["+0.20 TAPS/SEC", "+2 TAPS", "MAX 3"],
      glassReactor: ["+0.28 TAPS/SEC", "-18 CORE HP", "MAX 2"],
      scavenger: ["+8 TAPS"],
      emergencyCache: ["+5 TAPS", "+10 WALL HP"],
      rampart: ["+28 WALL HP"],
      bulwark: ["+48 WALL HP", "100 WALL CAP", "20s"],
      phaseShield: ["+45 SHIELD HP"],
      repairDrone: ["+30 CORE HP", "+20 SHIELD AT FULL CORE"],
      saboteur: ["12 DAMAGE", "-2 ENEMY TAPS"],
      sappers: ["55 WALL DAMAGE", "15 DAMAGE IF BREACHED"],
      timeBomb: ["65 DAMAGE", "4s WIND-UP"],
      leechSpire: ["25 DAMAGE", "+UP TO 25 WALL HP"],
      jammer: ["+1.5s ENEMY WIND-UPS", "-50% ENEMY TAP REGEN", "5s"],
      overclock: ["+60% NEXT WEAPON DAMAGE"],
      berserker: ["+35% NEXT WEAPON DAMAGE", "-12 CORE HP"],
      echoRelay: ["+2 PROGRESS", "EACH AVAILABLE LANE"],
      salvageGuild: ["+0.10 TAPS/SEC", "MAX 3"],
      piercingShot: ["30 DAMAGE"],
      siegeSalvo: ["48 WALL DAMAGE", "28 DAMAGE IF BREACHED"],
      suppressingFire: ["18 DAMAGE", "+0.8s ENEMY WEAPON WIND-UP"],
      executionOrder: ["42 DAMAGE", "60 BELOW HALF CORE"],
      watchtower: ["+10% WEAPON DAMAGE", "MAX 2"],
      pickpockets: ["STEAL UP TO 3 TAPS"],
      scoutCamp: ["+0.12 TAPS/SEC", "MAX 2"],
      masonCrew: ["+22 WALL HP"],
      arcLightning: ["36 DAMAGE"],
      gravityWell: ["+0.8s ENEMY WIND-UPS", "-50% ENEMY TAP REGEN", "3s"],
      nullSigil: ["-UP TO 3 ACTION TAPS"],
      growthRune: ["+0.16 SHIELD/SEC", "MAX 2"]
    },
    defaultDeck: ["rampart", "phaseShield", "piercingShot", "tapForge", "timeBomb", "suppressingFire"],
    deckSize: 6,
    handSize: 3
  };

  if (typeof module !== "undefined" && module.exports) module.exports = data;
  if (root) root.GAME_DATA = data;
})(typeof window !== "undefined" ? window : globalThis);
