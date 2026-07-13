"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const GAME_DATA = require("../public/game-data.js");

const MEDIEVAL_CARD_NAMES = {
  overclock: ["War Drums", "WD"],
  berserker: ["Blood Oath", "BO"],
  piercingShot: ["Bodkin Bolt", "BB"],
  siegeSalvo: ["Stonefall", "ST"],
  suppressingFire: ["Pinning Volley", "PV"],
  executionOrder: ["King's Writ", "KW"],
  tapForge: ["Bellows Guild", "BG"],
  glassReactor: ["Alchemist's Furnace", "AF"],
  scavenger: ["Roadside Forager", "RF"],
  emergencyCache: ["Hidden Stores", "HS"],
  rampart: ["Timber Rampart", "TR"],
  bulwark: ["Stone Bulwark", "SB"],
  repairDrone: ["Field Chirurgeon", "FC"],
  saboteur: ["Powder Rogue", "PR"],
  sappers: ["Keg Miners", "KM"],
  salvageGuild: ["Quartermaster's Guild", "QG"],
  watchtower: ["Beacon Tower", "BT"],
  pickpockets: ["Cutpurse Band", "CB"],
  scoutCamp: ["Outrider Camp", "OC"],
  masonCrew: ["Stonewrights", "SW"],
  phaseShield: ["Aegis Ward", "AW"],
  timeBomb: ["Hourglass Curse", "HC"],
  leechSpire: ["Bloodthorn Spire", "BS"],
  jammer: ["Hushing Hex", "HH"],
  echoRelay: ["Echo Stones", "ES"],
  arcLightning: ["Stormcall", "SL"],
  gravityWell: ["Grasping Void", "GV"],
  nullSigil: ["Unmaking Sigil", "US"],
  growthRune: ["Verdant Menhir", "VM"]
};

test("all 29 stable card keys use the approved medieval names and short labels", () => {
  assert.deepEqual(Object.keys(GAME_DATA.cards).sort(), Object.keys(MEDIEVAL_CARD_NAMES).sort());
  for (const [key, [name, short]] of Object.entries(MEDIEVAL_CARD_NAMES)) {
    assert.deepEqual([GAME_DATA.cards[key].name, GAME_DATA.cards[key].short], [name, short], key);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(GAME_DATA.weapons).map(([key, weapon]) => [key, weapon.name])), { cannon: "Cannon", volley: "Volley" });
});
