(function exposeGameData(root) {
  const data = {
    weapons: {
      cannon: { name: "Cannon", short: "C", cost: 8, windup: 1400, damage: 50, color: "#ff9e45", description: "A heavy, efficient shot with a visible wind-up." },
      volley: { name: "Volley", short: "V", cost: 3, windup: 180, damage: 14, color: "#61e4d5", description: "Fast pressure with little warning and lower efficiency." }
    },
    categories: {
      attack: { name: "Attack", short: "ATK", color: "#ff8b4f", description: "Direct strikes and weapon tactics" },
      crew: { name: "Crew", short: "CRW", color: "#d9ff43", description: "Villagers, structures, repairs and raids" },
      magic: { name: "Magic", short: "MAG", color: "#c88cff", description: "Spells, wards and unusual rule-breaking effects" }
    },
    cards: {
      tapForge: { name: "Tap Forge", short: "TF", cost: 8, windup: 1700, type: "structure", category: "crew", structure: true, color: "#d9ff43", description: "Build a Forge: +0.20 taps/sec and refund 2 taps. Maximum three." },
      glassReactor: { name: "Glass Reactor", short: "GR", cost: 6, windup: 900, type: "structure", category: "crew", structure: true, color: "#e2ff8b", description: "Build a Reactor: +0.28 taps/sec for 18 core HP. Maximum two." },
      scavenger: { name: "Scavenger", short: "SC", cost: 4, windup: 1100, type: "unit", category: "crew", color: "#f0c66c", description: "Send a scavenger beyond the Wall and recover 8 taps after a delay." },
      emergencyCache: { name: "Emergency Cache", short: "EC", cost: 3, windup: 350, type: "support", category: "crew", color: "#e8da90", description: "Workers recover 5 taps and patch 10 Wall HP. Fast cycle support." },
      rampart: { name: "Rampart", short: "RA", cost: 5, windup: 650, type: "build", category: "crew", color: "#8ea1b5", description: "Masons raise 28 Wall HP. Becomes weaker during Overload." },
      bulwark: { name: "Bulwark", short: "BW", cost: 8, windup: 1500, type: "build", category: "crew", color: "#b8c5d2", description: "A full crew raises 48 Wall HP and supports a temporary 100 HP cap." },
      phaseShield: { name: "Phase Shield", short: "PS", cost: 6, windup: 700, type: "ward", category: "magic", color: "#72d8ff", description: "Draw a ward that creates 45 Shield HP before your Wall." },
      repairDrone: { name: "Repair Drone", short: "RD", cost: 7, windup: 2200, type: "unit", category: "crew", color: "#65e6a5", description: "Restore 30 core HP, or create 20 Shield HP at full core health." },
      saboteur: { name: "Saboteur", short: "SB", cost: 5, windup: 750, type: "unit", category: "crew", color: "#c48cff", description: "A covert villager deals 12 damage and destroys 2 rival reserve taps." },
      sappers: { name: "Sapper Team", short: "ST", cost: 6, windup: 1200, type: "unit", category: "crew", color: "#ff7d69", description: "A demolition crew deals 55 Wall damage, or 15 if the Wall is gone." },
      timeBomb: { name: "Time Bomb", short: "TB", cost: 8, windup: 4000, type: "ritual", category: "magic", color: "#ff5d70", description: "A visible four-second ritual that explodes for 65 base damage." },
      leechSpire: { name: "Leech Spire", short: "LS", cost: 7, windup: 1800, type: "ritual", category: "magic", color: "#ef70c5", description: "Deal 25 damage and convert it into up to 25 Wall HP." },
      jammer: { name: "Signal Hex", short: "SH", cost: 5, windup: 500, type: "hex", category: "magic", color: "#8f9cff", description: "Delay rival wind-ups by 1.5s and halve regeneration for 5s." },
      overclock: { name: "Overclock", short: "OC", cost: 5, windup: 450, type: "tactic", category: "attack", color: "#ffb347", description: "Prepare an attack lane boost: your next weapon deals 60% more damage." },
      berserker: { name: "Berserker Protocol", short: "BP", cost: 4, windup: 250, type: "tactic", category: "attack", color: "#ff4f4f", description: "Next weapon deals 35% more damage, but your core immediately loses 12 HP." },
      echoRelay: { name: "Echo Relay", short: "ER", cost: 6, windup: 1000, type: "rune", category: "magic", color: "#59e0d0", description: "Store 2 taps in one available card from each commitment lane." },
      salvageGuild: { name: "Supply Guild", short: "SG", cost: 5, windup: 1000, type: "structure", category: "crew", structure: true, color: "#d5ad67", description: "Build a Guild: steady +0.10 taps/sec logistics. Maximum three." },

      piercingShot: { name: "Piercing Shot", short: "PI", cost: 5, windup: 550, type: "strike", category: "attack", color: "#ffb16c", description: "Fire a prepared strike for 30 damage. Reliable, fast attack-lane pressure." },
      siegeSalvo: { name: "Siege Salvo", short: "SS", cost: 6, windup: 1100, type: "siege", category: "attack", color: "#ff775d", description: "Deal 48 damage to a Wall, or 28 damage when no Wall remains." },
      suppressingFire: { name: "Suppressing Fire", short: "SF", cost: 4, windup: 350, type: "tactic", category: "attack", color: "#ffc35b", description: "Deal 18 damage and delay a pending rival weapon by 0.8 seconds." },
      executionOrder: { name: "Execution Order", short: "XO", cost: 7, windup: 900, type: "strike", category: "attack", color: "#ff5f4f", description: "Deal 42 damage, increased to 60 against a core below half health." },

      watchtower: { name: "Watchtower", short: "WT", cost: 6, windup: 1200, type: "structure", category: "crew", structure: true, color: "#f3c969", description: "Build a Watchtower: permanent weapons deal 10% more damage. Maximum two." },
      pickpockets: { name: "Pickpocket Crew", short: "PC", cost: 4, windup: 700, type: "unit", category: "crew", color: "#cf9cff", description: "Steal up to 3 taps directly from the rival reserve." },
      scoutCamp: { name: "Scout Camp", short: "SC+", cost: 5, windup: 900, type: "structure", category: "crew", structure: true, color: "#9fe36f", description: "Build a Camp: scouts generate +0.12 taps/sec. Maximum two." },
      masonCrew: { name: "Mason Crew", short: "MC", cost: 4, windup: 500, type: "unit", category: "crew", color: "#aab9c8", description: "Rapidly restore 22 Wall HP without occupying a structure tile." },

      arcLightning: { name: "Arc Lightning", short: "AL", cost: 6, windup: 800, type: "spell", category: "magic", color: "#75d9ff", description: "Deal 36 damage and flash the target zone with almost no warning." },
      gravityWell: { name: "Gravity Well", short: "GW", cost: 5, windup: 700, type: "spell", category: "magic", color: "#9d7cff", description: "Delay all rival wind-ups by 0.8s and halve regeneration for 3s." },
      nullSigil: { name: "Null Sigil", short: "NS", cost: 6, windup: 450, type: "counterspell", category: "magic", color: "#d5a3ff", description: "Erase up to 3 taps from the rival's most-developed unfinished action." },
      growthRune: { name: "Growth Rune", short: "GR+", cost: 5, windup: 1000, type: "structure", category: "magic", structure: true, color: "#7ff0b2", description: "Build a Rune: regenerate Shield HP slowly. Maximum two." }
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
    handSize: 4
  };

  if (typeof module !== "undefined" && module.exports) module.exports = data;
  if (root) root.GAME_DATA = data;
})(typeof window !== "undefined" ? window : globalThis);
