const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const GAME_DATA = require("./public/game-data.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));

const MAX_TAPS = 40;
const STARTING_CORE = 360;
const STARTING_WALL = 35;
const TAP_COOLDOWN_MS = 95;
const queue = [];
const matches = new Map();

const CPU_PLANS = [
  { key: "architect", name: "THE ARCHITECT", label: "BUILD / SCALE", pace: [160, 245], weapon: "cannon", deck: ["tapForge", "watchtower", "rampart", "phaseShield", "piercingShot", "growthRune"] },
  { key: "raider", name: "REDLINE", label: "CREW / PRESSURE", pace: [140, 220], weapon: "cannon", deck: ["glassReactor", "overclock", "pickpockets", "sappers", "executionOrder", "timeBomb"] },
  { key: "counter", name: "THE MIRROR", label: "HEX / ADAPT", pace: [165, 255], weapon: "volley", deck: ["jammer", "phaseShield", "nullSigil", "salvageGuild", "suppressingFire", "masonCrew"] }
];

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function opponent(side) { return side === 1 ? 2 : 1; }
function randomBetween([min, max]) { return min + Math.random() * (max - min); }
function phaseAt(elapsed) {
  if (elapsed < 25) return { key: "fortify", number: 1, regen: .78, damage: .75, wallPower: 1, tapMultiplier: 1 };
  if (elapsed < 120) return { key: "clash", number: 2, regen: .72, damage: 1, wallPower: 1, tapMultiplier: 1 };
  const pressure = Math.min(1, (elapsed - 120) / 120);
  return { key: "overload", number: 3, regen: .88, damage: 1.15 + pressure, wallPower: .7 - pressure * .35, tapMultiplier: elapsed >= 180 ? 2 : 1 };
}
function validateLoadout(input = {}) {
  const deck = Array.isArray(input.deck) ? input.deck.filter((key, index, list) => GAME_DATA.cards[key] && list.indexOf(key) === index) : [];
  return {
    deck: deck.length === GAME_DATA.deckSize ? deck : [...GAME_DATA.defaultDeck],
    weapon: GAME_DATA.weapons[input.weapon] ? input.weapon : "cannon"
  };
}
function makePlayer(id, isBot = false, loadout = {}) {
  const valid = validateLoadout(loadout);
  return {
    id, isBot, coreHp: STARTING_CORE, wallHp: STARTING_WALL, shield: 0, taps: 10,
    deck: [...valid.deck], hand: valid.deck.slice(0, GAME_DATA.handSize), queue: valid.deck.slice(GAME_DATA.handSize),
    placed: { attack: null, crew: null, magic: null },
    cardProgress: Object.fromEntries(valid.deck.map(key => [key, 0])), weapon: valid.weapon, weaponProgress: 0,
    pending: [], nextTapAt: 0, structures: [], forges: 0, glassReactors: 0, scoutCamps: 0, watchtowers: 0, growthRunes: 0,
    weaponBoost: 1, guilds: 0,
    jammedUntil: 0, bulwarkUntil: 0, siphons: {},
    stats: { tapsSpent: 0, damage: 0, capWaste: 0, wallsBuilt: 0, structuresBuilt: 0, cannons: 0, volleys: 0, wallBreaks: 0, cardsPlayed: 0, siphonTaps: 0, stolenTaps: 0 },
    bot: null
  };
}
function makeMatch(firstId, secondId, options = {}) {
  const id = `match-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const first = makePlayer(firstId, false, options.firstLoadout);
  let second;
  if (options.bot) {
    const plan = options.plan || CPU_PLANS[Math.floor(Math.random() * CPU_PLANS.length)];
    second = makePlayer(secondId, true, plan);
    second.bot = { key: plan.key, name: plan.name, label: plan.label, pace: plan.pace, nextDecisionAt: Date.now() + 500, target: null };
  } else second = makePlayer(secondId, false, options.secondLoadout);
  const match = { id, mode: options.bot ? "cpu" : "online", players: { 1: first, 2: second }, startedAt: Date.now(), lastTick: Date.now(), ended: false, eventId: 0, jobId: 0, lastEvent: null };
  matches.set(id, match);
  return match;
}
function currentWallCap(player, now = Date.now()) { return now < player.bulwarkUntil ? 100 : 80; }
function publicPlayer(player) {
  return {
    coreHp: Math.round(player.coreHp * 10) / 10, wallHp: Math.round(player.wallHp * 10) / 10,
    shield: Math.round(player.shield * 10) / 10, taps: Math.round(player.taps * 10) / 10,
    deck: [...player.deck], hand: [...player.hand], nextCard: player.queue[0], cardProgress: { ...player.cardProgress },
    placed: Object.fromEntries(Object.entries(player.placed).map(([category, entry]) => [category, entry ? { ...entry } : null])),
    weapon: player.weapon, weaponProgress: player.weaponProgress, structures: [...player.structures],
    forges: player.forges, glassReactors: player.glassReactors, scoutCamps: player.scoutCamps, watchtowers: player.watchtowers, growthRunes: player.growthRunes,
    weaponBoost: player.weaponBoost, guilds: player.guilds, wallCap: currentWallCap(player),
    siphons: Object.fromEntries(Object.entries(player.siphons).map(([key, lock]) => [key, { totalTaps: lock.totalTaps, burst: lock.totalTaps % 3, removed: lock.removed }])),
    pending: player.pending.map(job => ({ id: job.id, source: job.source, key: job.key, resolveAt: job.resolveAt })),
    stats: { ...player.stats }, bot: player.bot ? { key: player.bot.key, name: player.bot.name, label: player.bot.label } : null
  };
}
function serialize(match) {
  const elapsed = (Date.now() - match.startedAt) / 1000;
  return { id: match.id, mode: match.mode, elapsed, phase: phaseAt(elapsed), players: { 1: publicPlayer(match.players[1]), 2: publicPlayer(match.players[2]) }, lastEvent: match.lastEvent };
}
function broadcast(match) { io.to(match.id).emit("state", serialize(match)); }
function addEvent(match, type, side, data = {}) { match.lastEvent = { id: ++match.eventId, type, side, at: Date.now(), ...data }; }
function removeFromQueue(id) { const index = queue.indexOf(id); if (index !== -1) queue.splice(index, 1); }
function finish(match, winner, reason = "core") {
  if (!match || match.ended) return;
  match.ended = true;
  const state = serialize(match);
  io.to(match.id).emit("state", state);
  io.to(match.id).emit("gameOver", { winner, reason, state });
  matches.delete(match.id);
}
function clearSocketMatch(socket) {
  const match = matches.get(socket.data.matchId);
  if (match && !match.ended) finish(match, opponent(socket.data.side || 1), "leave");
  if (socket.data.matchId) socket.leave(socket.data.matchId);
  socket.data.matchId = null;
  socket.data.side = null;
}
function joinMatch(socket, match, side) {
  socket.join(match.id);
  socket.data.matchId = match.id;
  socket.data.side = side;
  socket.emit("matchFound", { matchId: match.id, side, state: serialize(match) });
}

function dealDamage(match, side, amount, source, options = {}) {
  const targetSide = opponent(side);
  const attacker = match.players[side];
  const target = match.players[targetSide];
  const beforeWall = target.wallHp;
  let remaining = amount;
  const shieldDamage = Math.min(target.shield, remaining);
  target.shield -= shieldDamage;
  remaining -= shieldDamage;
  const wallDamage = Math.min(target.wallHp, remaining);
  target.wallHp -= wallDamage;
  remaining -= wallDamage;
  let coreDamage = 0;
  if (!options.wallOnly) {
    coreDamage = Math.min(target.coreHp, remaining);
    target.coreHp = Math.max(0, target.coreHp - remaining);
  }
  const total = shieldDamage + wallDamage + coreDamage;
  attacker.stats.damage += total;
  if (beforeWall > 0 && target.wallHp <= 0) {
    target.stats.wallBreaks++;
    addEvent(match, "wallBreak", side, { source, amount: total, targetSide });
  } else addEvent(match, "hit", side, { source, amount: total, target: shieldDamage ? "shield" : wallDamage ? "wall" : "core" });
  return total;
}
function cyclePlacedCard(player, key) {
  const category = GAME_DATA.cards[key]?.category;
  const entry = category && player.placed[category];
  if (!entry || entry.key !== key) return false;
  const next = player.queue.shift();
  player.hand[entry.slot] = next;
  player.queue.push(key);
  player.placed[category] = null;
  return true;
}
function clearSiphonLock(match, targetSide, source, key) {
  const attacker = match.players[opponent(targetSide)];
  if (attacker) delete attacker.siphons[`${source}:${key}`];
}
function buildStructure(player, key, limit) {
  if (player.structures.length >= 8 || player.structures.filter(item => item === key).length >= limit) return false;
  player.structures.push(key);
  player.stats.structuresBuilt++;
  return true;
}
function resolveCard(match, side, key, now) {
  const player = match.players[side];
  const enemy = match.players[opponent(side)];
  const phase = phaseAt((now - match.startedAt) / 1000);
  if (key === "tapForge") {
    if (buildStructure(player, key, 3)) { player.forges++; player.taps = Math.min(MAX_TAPS, player.taps + 2); }
    else player.taps = Math.min(MAX_TAPS, player.taps + 6);
  }
  if (key === "glassReactor") {
    if (buildStructure(player, key, 2)) { player.glassReactors++; player.coreHp = Math.max(1, player.coreHp - 18); }
    else { player.weaponBoost = Math.max(player.weaponBoost, 1.25); player.taps = Math.min(MAX_TAPS, player.taps + 2); }
  }
  if (key === "scavenger") player.taps = Math.min(MAX_TAPS, player.taps + 8);
  if (key === "emergencyCache") { player.taps = Math.min(MAX_TAPS, player.taps + 5); player.wallHp = Math.min(currentWallCap(player, now), player.wallHp + 10); }
  if (key === "rampart") { player.wallHp = Math.min(currentWallCap(player, now), player.wallHp + 28 * phase.wallPower); player.stats.wallsBuilt++; }
  if (key === "bulwark") { player.bulwarkUntil = now + 20000; player.wallHp = Math.min(100, player.wallHp + 48 * phase.wallPower); player.stats.wallsBuilt++; }
  if (key === "phaseShield") player.shield = Math.min(90, player.shield + 45);
  if (key === "repairDrone") {
    if (player.coreHp < STARTING_CORE) player.coreHp = Math.min(STARTING_CORE, player.coreHp + 30);
    else player.shield = Math.min(90, player.shield + 20);
  }
  if (key === "saboteur") { enemy.taps = Math.max(0, enemy.taps - 2); dealDamage(match, side, 12 * phase.damage, key); }
  if (key === "sappers") dealDamage(match, side, (enemy.wallHp > 0 ? 55 : 15) * phase.damage, key, { wallOnly: enemy.wallHp > 0 });
  if (key === "timeBomb") dealDamage(match, side, 65 * phase.damage, key);
  if (key === "leechSpire") { const drained = dealDamage(match, side, 25 * phase.damage, key); player.wallHp = Math.min(currentWallCap(player, now), player.wallHp + Math.min(25, drained)); }
  if (key === "jammer") { enemy.pending.forEach(job => { job.resolveAt += 1500; }); enemy.jammedUntil = Math.max(enemy.jammedUntil, now + 5000); }
  if (key === "overclock") player.weaponBoost = Math.max(player.weaponBoost, 1.6);
  if (key === "berserker") { player.weaponBoost = Math.max(player.weaponBoost, 1.35); player.coreHp = Math.max(1, player.coreHp - 12); }
  if (key === "echoRelay") {
    for (const category of Object.keys(GAME_DATA.categories)) {
      if (laneOccupant(player, category)) continue;
      const placedKey = player.placed[category]?.key;
      if (placedKey) player.cardProgress[placedKey] = Math.min(GAME_DATA.cards[placedKey].cost - 1, (player.cardProgress[placedKey] || 0) + 2);
    }
  }
  if (key === "salvageGuild") {
    if (buildStructure(player, key, 3)) player.guilds++;
    else player.wallHp = Math.min(currentWallCap(player, now), player.wallHp + 12 * phase.wallPower);
  }
  if (key === "piercingShot") dealDamage(match, side, 30 * phase.damage, key);
  if (key === "siegeSalvo") dealDamage(match, side, (enemy.wallHp > 0 ? 48 : 28) * phase.damage, key, { wallOnly: enemy.wallHp > 0 });
  if (key === "suppressingFire") {
    dealDamage(match, side, 18 * phase.damage, key);
    enemy.pending.filter(job => job.source === "weapon").forEach(job => { job.resolveAt += 800; });
  }
  if (key === "executionOrder") dealDamage(match, side, (enemy.coreHp < STARTING_CORE / 2 ? 60 : 42) * phase.damage, key);
  if (key === "watchtower") {
    if (buildStructure(player, key, 2)) player.watchtowers++;
    else player.taps = Math.min(MAX_TAPS, player.taps + 3);
  }
  if (key === "pickpockets") {
    const stolen = Math.min(3, enemy.taps);
    enemy.taps -= stolen;
    player.taps = Math.min(MAX_TAPS, player.taps + stolen);
  }
  if (key === "scoutCamp") {
    if (buildStructure(player, key, 2)) player.scoutCamps++;
    else player.taps = Math.min(MAX_TAPS, player.taps + 3);
  }
  if (key === "masonCrew") { player.wallHp = Math.min(currentWallCap(player, now), player.wallHp + 22 * phase.wallPower); player.stats.wallsBuilt++; }
  if (key === "arcLightning") dealDamage(match, side, 36 * phase.damage, key);
  if (key === "gravityWell") { enemy.pending.forEach(job => { job.resolveAt += 800; }); enemy.jammedUntil = Math.max(enemy.jammedUntil, now + 3000); }
  if (key === "nullSigil") {
    const targets = [
      { source: "weapon", key: enemy.weapon, progress: enemy.weaponProgress, cost: GAME_DATA.weapons[enemy.weapon].cost },
      ...Object.values(enemy.placed).filter(Boolean).map(entry => ({ source: "card", key: entry.key, progress: enemy.cardProgress[entry.key] || 0, cost: GAME_DATA.cards[entry.key].cost }))
    ].filter(target => target.progress > 0).sort((a, b) => b.progress / b.cost - a.progress / a.cost);
    const target = targets[0];
    if (target) {
      const erased = Math.min(3, target.progress);
      if (target.source === "weapon") enemy.weaponProgress -= erased;
      else enemy.cardProgress[target.key] -= erased;
    }
  }
  if (key === "growthRune") {
    if (buildStructure(player, key, 2)) player.growthRunes++;
    else player.shield = Math.min(90, player.shield + 12);
  }
  const damageCards = ["saboteur", "sappers", "timeBomb", "leechSpire", "piercingShot", "siegeSalvo", "suppressingFire", "executionOrder", "arcLightning"];
  if (!damageCards.includes(key)) addEvent(match, "card", side, { card: key });
}
function resolveJob(match, side, job, now) {
  const player = match.players[side];
  const index = player.pending.findIndex(item => item.id === job.id);
  if (index < 0) return;
  player.pending.splice(index, 1);
  if (job.source === "weapon") {
    const weapon = GAME_DATA.weapons[player.weapon];
    const phase = phaseAt((now - match.startedAt) / 1000);
    const boost = player.weaponBoost * (1 + player.watchtowers * .1);
    player.weaponBoost = 1;
    if (player.weapon === "cannon") player.stats.cannons++;
    else player.stats.volleys++;
    dealDamage(match, side, weapon.damage * phase.damage * boost, player.weapon);
  } else resolveCard(match, side, job.key, now);
}
function hasPending(player, source, key) { return player.pending.some(job => job.source === source && job.key === key); }
function laneOccupant(player, category) {
  if (category === "attack") {
    if (player.weaponProgress > 0 || hasPending(player, "weapon", player.weapon)) return { source: "weapon", key: player.weapon };
  }
  const placed = player.placed[category];
  if (placed && (player.cardProgress[placed.key] || 0) > 0) return { source: "card", key: placed.key };
  const pending = player.pending.find(job => job.source === "card" && GAME_DATA.cards[job.key]?.category === category);
  return pending ? { source: "card", key: pending.key } : null;
}
function canPlaceCard(player, key, slot = player.hand.indexOf(key)) {
  const card = GAME_DATA.cards[key];
  if (!card || slot < 0 || player.hand[slot] !== key) return false;
  const active = laneOccupant(player, card.category);
  if (active) return false;
  const existing = player.placed[card.category];
  return !existing || ((player.cardProgress[existing.key] || 0) === 0 && !hasPending(player, "card", existing.key));
}
function handlePlaceCard(match, side, target = {}) {
  const player = match.players[side];
  const slot = Number(target.slot);
  const key = target.key;
  if (!player || match.ended || !Number.isInteger(slot) || !canPlaceCard(player, key, slot)) return false;
  const category = GAME_DATA.cards[key].category;
  const existing = player.placed[category];
  if (existing) player.hand[existing.slot] = existing.key;
  player.hand[slot] = null;
  player.placed[category] = { key, slot };
  addEvent(match, "place", side, { key, category, slot, replaced: existing?.key || null });
  return true;
}
function laneAvailable(player, source, key) {
  const category = source === "weapon" ? "attack" : GAME_DATA.cards[key]?.category;
  const occupant = category && laneOccupant(player, category);
  return !occupant || (occupant.source === source && occupant.key === key);
}
function handleTap(match, side, target = {}, now = Date.now()) {
  const player = match.players[side];
  if (!player || match.ended || player.taps < 1 || now < player.nextTapAt) return false;
  const source = target.source === "card" ? "card" : "weapon";
  const key = source === "weapon" ? player.weapon : target.key;
  const definition = source === "weapon" ? GAME_DATA.weapons[key] : GAME_DATA.cards[key];
  if (!definition || hasPending(player, source, key)) return false;
  if (source === "card" && player.placed[definition.category]?.key !== key) return false;
  if (!laneAvailable(player, source, key)) return false;

  player.nextTapAt = now + TAP_COOLDOWN_MS;
  player.taps -= 1;
  player.stats.tapsSpent++;
  if (source === "weapon") player.weaponProgress++;
  else player.cardProgress[key] = (player.cardProgress[key] || 0) + 1;
  const progress = source === "weapon" ? player.weaponProgress : player.cardProgress[key];
  if (progress >= definition.cost) {
    if (source === "weapon") player.weaponProgress = 0;
    else { player.cardProgress[key] = 0; cyclePlacedCard(player, key); player.stats.cardsPlayed++; }
    clearSiphonLock(match, side, source, key);
    const job = { id: ++match.jobId, source, key, resolveAt: now + definition.windup };
    player.pending.push(job);
    addEvent(match, "commit", side, { source, key, resolveAt: job.resolveAt });
  }
  return true;
}

function handleSiphon(match, side, target = {}, now = Date.now()) {
  const attacker = match.players[side];
  const defender = match.players[opponent(side)];
  if (!attacker || !defender || match.ended || attacker.taps < 1 || now < attacker.nextTapAt) return false;
  const source = target.source === "card" ? "card" : "weapon";
  const key = source === "weapon" ? defender.weapon : target.key;
  if (source === "weapon" && target.key && target.key !== defender.weapon) return false;
  if (source === "card" && (!GAME_DATA.cards[key] || defender.placed[GAME_DATA.cards[key].category]?.key !== key)) return false;
  if (hasPending(defender, source, key)) return false;
  const progress = source === "weapon" ? defender.weaponProgress : defender.cardProgress[key] || 0;
  if (progress <= 0) return false;

  attacker.nextTapAt = now + TAP_COOLDOWN_MS;
  attacker.taps -= 1;
  attacker.stats.tapsSpent++;
  attacker.stats.siphonTaps++;
  const lockId = `${source}:${key}`;
  const lock = attacker.siphons[lockId] || { totalTaps: 0, processedPairs: 0, removed: 0 };
  attacker.siphons[lockId] = lock;
  lock.totalTaps++;
  let removed = 0;
  if (lock.totalTaps % 3 === 0) {
    const eligiblePairs = Math.floor(lock.totalTaps / 2);
    const removalGoal = eligiblePairs - lock.processedPairs;
    lock.processedPairs = eligiblePairs;
    const currentProgress = source === "weapon" ? defender.weaponProgress : defender.cardProgress[key] || 0;
    removed = Math.min(removalGoal, currentProgress);
    if (source === "weapon") defender.weaponProgress -= removed;
    else defender.cardProgress[key] -= removed;
    lock.removed += removed;
    attacker.stats.stolenTaps += removed;
    attacker.taps = Math.min(MAX_TAPS, attacker.taps + removed);
  }
  addEvent(match, "siphon", side, { targetSide: opponent(side), source, key, burst: lock.totalTaps % 3, removed, totalRemoved: lock.removed });
  return true;
}

function validBotTarget(player, target) {
  if (!target) return false;
  if (target.source === "weapon") return !hasPending(player, "weapon", player.weapon) && laneAvailable(player, "weapon", player.weapon);
  const card = GAME_DATA.cards[target.key];
  return Boolean(card && player.placed[card.category]?.key === target.key && !hasPending(player, "card", target.key) && laneAvailable(player, "card", target.key));
}
function validSiphonTarget(player, target) {
  if (!target) return false;
  if (target.source === "weapon") return player.weapon === target.key && player.weaponProgress > 0 && !hasPending(player, "weapon", target.key);
  const card = GAME_DATA.cards[target.key];
  return Boolean(card && player.placed[card.category]?.key === target.key && (player.cardProgress[target.key] || 0) > 0 && !hasPending(player, "card", target.key));
}
function chooseBotSiphonTarget(bot, rival) {
  const candidates = [];
  if (rival.weaponProgress > 0 && !hasPending(rival, "weapon", rival.weapon)) {
    candidates.push({ source: "weapon", key: rival.weapon, progress: rival.weaponProgress / GAME_DATA.weapons[rival.weapon].cost });
  }
  for (const entry of Object.values(rival.placed).filter(Boolean)) {
    const key = entry.key;
    if ((rival.cardProgress[key] || 0) > 0 && !hasPending(rival, "card", key)) candidates.push({ source: "card", key, progress: rival.cardProgress[key] / GAME_DATA.cards[key].cost });
  }
  candidates.sort((a, b) => {
    const aLocked = bot.siphons[`${a.source}:${a.key}`]?.totalTaps % 3 ? 1 : 0;
    const bLocked = bot.siphons[`${b.source}:${b.key}`]?.totalTaps % 3 ? 1 : 0;
    return bLocked - aLocked || b.progress - a.progress;
  });
  return candidates[0] || null;
}
function chooseBotTarget(match) {
  const bot = match.players[2];
  const rival = match.players[1];
  const elapsed = (Date.now() - match.startedAt) / 1000;
  const inHand = (...keys) => keys.find(key => bot.hand.includes(key) && canPlaceCard(bot, key));
  const threatened = rival.pending.some(job => job.source === "weapon" || job.key === "timeBomb");
  const defensive = inHand("phaseShield", "rampart", "bulwark");
  if ((threatened || bot.wallHp < 28) && defensive) return { source: "card", key: defensive };
  const partialCard = Object.values(bot.placed).filter(Boolean).map(entry => entry.key).find(key => (bot.cardProgress[key] || 0) > 0 && !hasPending(bot, "card", key));
  if (partialCard) return { source: "card", key: partialCard };
  if (bot.weaponProgress > 0 && !hasPending(bot, "weapon", bot.weapon)) return { source: "weapon", key: bot.weapon };
  if (bot.coreHp < 250 && inHand("repairDrone")) return { source: "card", key: "repairDrone" };
  if (elapsed < 70 && bot.forges + bot.glassReactors < 2 && inHand("tapForge", "glassReactor")) return { source: "card", key: inHand("tapForge", "glassReactor") };
  if (bot.taps < 9 && inHand("scavenger", "emergencyCache")) return { source: "card", key: inHand("scavenger", "emergencyCache") };
  if (bot.weaponBoost === 1 && inHand("overclock", "berserker")) return { source: "card", key: inHand("overclock", "berserker") };
  const attack = inHand("timeBomb", "sappers", "saboteur", "leechSpire", "jammer", "executionOrder", "piercingShot", "suppressingFire", "arcLightning");
  if (attack && bot.taps > GAME_DATA.cards[attack].cost + 2) return { source: "card", key: attack };
  if (inHand("echoRelay", "salvageGuild") && Math.random() < .2) return { source: "card", key: inHand("echoRelay", "salvageGuild") };
  if (laneAvailable(bot, "weapon", bot.weapon)) return { source: "weapon", key: bot.weapon };
  const fallback = bot.hand.find(key => key && canPlaceCard(bot, key));
  return fallback ? { source: "card", key: fallback } : null;
}
function tickBot(match, now) {
  const bot = match.players[2];
  if (!bot.isBot || !bot.bot || now < bot.bot.nextDecisionAt || bot.taps < 1) return;
  if (!validSiphonTarget(match.players[1], bot.bot.siphonTarget)) bot.bot.siphonTarget = null;
  const counter = bot.bot.siphonTarget || chooseBotSiphonTarget(bot, match.players[1]);
  const counterLock = counter && bot.siphons[`${counter.source}:${counter.key}`];
  const continueBurst = counterLock?.totalTaps % 3 > 0;
  const startBurst = counter && bot.taps >= 4 && Math.random() < (bot.bot.key === "mirror" ? .34 : .2);
  if ((continueBurst || startBurst) && handleSiphon(match, 2, counter, now)) {
    bot.bot.siphonTarget = counter;
    if (bot.siphons[`${counter.source}:${counter.key}`]?.totalTaps % 3 === 0) bot.bot.siphonTarget = null;
    bot.bot.nextDecisionAt = now + randomBetween([120, 190]);
    return;
  }
  if (!validBotTarget(bot, bot.bot.target)) bot.bot.target = chooseBotTarget(match);
  if (bot.bot.target?.source === "card" && bot.hand.includes(bot.bot.target.key)) {
    handlePlaceCard(match, 2, { key: bot.bot.target.key, slot: bot.hand.indexOf(bot.bot.target.key) });
    bot.bot.nextDecisionAt = now + randomBetween([110, 180]);
    return;
  }
  if (bot.bot.target && !handleTap(match, 2, bot.bot.target, now)) bot.bot.target = chooseBotTarget(match);
  if (!validBotTarget(bot, bot.bot.target)) bot.bot.target = null;
  bot.bot.nextDecisionAt = now + randomBetween(bot.bot.pace);
}
function tickMatch(match) {
  if (match.ended) return;
  const now = Date.now();
  const delta = Math.min(.3, (now - match.lastTick) / 1000);
  const elapsed = (now - match.startedAt) / 1000;
  match.lastTick = now;
  const phase = phaseAt(elapsed);
  for (const side of [1, 2]) {
    const player = match.players[side];
    let regen = (phase.regen + player.forges * .2 + player.glassReactors * .28 + player.scoutCamps * .12 + player.guilds * .1) * phase.tapMultiplier;
    if (now < player.jammedUntil) regen *= .5;
    if (player.taps >= MAX_TAPS - .01) player.stats.capWaste += delta;
    player.taps = Math.min(MAX_TAPS, player.taps + regen * delta);
    if (player.growthRunes) player.shield = Math.min(90, player.shield + player.growthRunes * .16 * delta);
    const cap = currentWallCap(player, now);
    if (player.wallHp > cap) player.wallHp = Math.max(cap, player.wallHp - delta * 4);
    for (const job of [...player.pending]) if (now >= job.resolveAt) resolveJob(match, side, job, now);
  }
  tickBot(match, now);
  if (match.players[1].coreHp <= 0 || match.players[2].coreHp <= 0) {
    const winner = match.players[1].coreHp <= 0 && match.players[2].coreHp <= 0 ? 0 : match.players[1].coreHp <= 0 ? 2 : 1;
    finish(match, winner, "core");
    return;
  }
  broadcast(match);
}

const ticker = setInterval(() => { for (const match of matches.values()) tickMatch(match); }, 100);

io.on("connection", socket => {
  socket.on("startCpu", loadout => {
    removeFromQueue(socket.id);
    clearSocketMatch(socket);
    const match = makeMatch(socket.id, `cpu-${socket.id}`, { bot: true, firstLoadout: validateLoadout(loadout) });
    joinMatch(socket, match, 1);
  });
  socket.on("findMatch", loadout => {
    socket.data.loadout = validateLoadout(loadout);
    if (socket.data.matchId) clearSocketMatch(socket);
    removeFromQueue(socket.id);
    let opponentId = queue.shift();
    while (opponentId && !io.sockets.sockets.get(opponentId)) opponentId = queue.shift();
    if (!opponentId) { queue.push(socket.id); socket.emit("queueStatus", { searching: true }); return; }
    const otherSocket = io.sockets.sockets.get(opponentId);
    const match = makeMatch(opponentId, socket.id, { firstLoadout: otherSocket.data.loadout, secondLoadout: socket.data.loadout });
    joinMatch(otherSocket, match, 1);
    joinMatch(socket, match, 2);
    broadcast(match);
  });
  socket.on("cancelSearch", () => { removeFromQueue(socket.id); socket.emit("queueStatus", { searching: false }); });
  socket.on("action", ({ type, source, key, slot } = {}) => {
    const match = matches.get(socket.data.matchId);
    if (!match || !socket.data.side) return;
    if (type === "place" && handlePlaceCard(match, socket.data.side, { key, slot })) broadcast(match);
    if (type === "tap" && handleTap(match, socket.data.side, { source, key })) broadcast(match);
    if (type === "siphon" && handleSiphon(match, socket.data.side, { source, key })) broadcast(match);
  });
  socket.on("leaveMatch", () => clearSocketMatch(socket));
  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    const match = matches.get(socket.data.matchId);
    if (match && !match.ended) finish(match, opponent(socket.data.side), "disconnect");
  });
});

if (require.main === module) server.listen(PORT, () => console.log(`Taptics running on http://localhost:${PORT}`));
module.exports = { server, io, ticker, GAME_DATA, makeMatch, handlePlaceCard, handleTap, handleSiphon, resolveCard, tickMatch, phaseAt, validateLoadout };
