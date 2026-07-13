const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { io: connect } = require("socket.io-client");
const { server, io, ticker, GAME_DATA, RECENT_EVENT_LIMIT, makeMatch, handlePlaceCard, handleTap, handleSiphon, resolveCard, phaseAt, validateLoadout, serialize, addEvent, dealDamage } = require("../server");

function once(socket, event) { return new Promise(resolve => socket.once(event, resolve)); }
function stateMatching(socket, predicate, timeout = 1800) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for game state")), timeout);
    const listener = state => {
      if (!predicate(state)) return;
      clearTimeout(timer);
      socket.off("state", listener);
      resolve(state);
    };
    socket.on("state", listener);
  });
}

test.before(async () => { await new Promise(resolve => server.listen(0, resolve)); });
test.after(async () => {
  clearInterval(ticker);
  await new Promise(resolve => io.close(() => server.close(resolve)));
});

test("phase rules escalate toward an elimination endgame", () => {
  assert.deepEqual(phaseAt(0), { key: "fortify", number: 1, regen: .78, damage: .75, wallPower: 1, tapMultiplier: 1 });
  assert.equal(phaseAt(25).key, "clash");
  assert.equal(phaseAt(120).key, "overload");
  assert.equal(phaseAt(179.9).tapMultiplier, 1);
  assert.equal(phaseAt(180).tapMultiplier, 2);
  assert.ok(phaseAt(240).damage > phaseAt(120).damage);
  assert.ok(phaseAt(240).wallPower < phaseAt(120).wallPower);
});

test("client keeps zoom and changing battle guidance accessible", () => {
  const html = readFileSync(join(__dirname, "..", "public", "index.html"), "utf8");
  const client = readFileSync(join(__dirname, "..", "public", "app.js"), "utf8");
  const battleCardRenderer = client.match(/function cardButton[\s\S]*?function renderBattleHand/)?.[0] || "";
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/i);
  assert.match(html, /id="reserve-hint" role="status" aria-live="polite"/);
  assert.match(html, /id="toast" class="toast pixel-modal-frame hidden"[^>]+role="status" aria-live="polite"/);
  assert.match(html, /id="card-inspector" class="card-inspector pixel-modal-frame hidden" role="tooltip"/);
  assert.match(html, /id="own-weapon"/);
  assert.match(html, /id="own-crew"/);
  assert.match(html, /id="own-magic"/);
  assert.doesNotMatch(html, /id="own-(?:cannon|volley)"/);
  assert.match(html, /id="own-action-attack" class="lane-commit queued-action target-attack/);
  assert.match(html, /id="own-action-crew" class="lane-commit queued-action target-crew/);
  assert.match(html, /id="own-action-magic" class="lane-commit queued-action target-magic/);
  assert.match(html, /THREE-CARD HAND/);
  assert.doesNotMatch(html, /id="commit-button"/);
  assert.doesNotMatch(html, /class="(?:commit-note|own-status)"|id="own-(?:core-value|core-bar|wall-footer)"/);
  assert.match(client, /hand\.dataset\.signature !== handSignature/);
  assert.match(client, /function showCardInspector\(source, key, anchor\)/);
  assert.match(client, /function inspectCardContext\(event, element, source, key\)/);
  assert.match(client, /inspectedElement === element && !\$\("#card-inspector"\)\.classList\.contains\("hidden"\)/);
  assert.match(client, /#battle-hand"\)\.addEventListener\("pointerdown", placeHandCard\)/);
  assert.match(client, /#battle-hand"\)\.addEventListener\("contextmenu"/);
  assert.match(client, /type: "place", key, slot/);
  assert.match(client, /data-busy-label="\$\{category\.name\.toUpperCase\(\)\} IS BUSY"/);
  assert.match(client, /renderQueuedAction\(prefix, player, category, target\)/);
  assert.match(client, /action\.addEventListener\("click", activateCommit\)/);
  assert.match(client, /action\.addEventListener\("keydown", activateCommitKey\)/);
  assert.match(client, /action\.addEventListener\("contextmenu"/);
  assert.doesNotMatch(battleCardRenderer, /card\.type\.toUpperCase\(\)/);
  assert.doesNotMatch(client, /data-hand-slot[^\n]+addEventListener/);
});

test("every battle definition has concise right-click inspector stats", () => {
  assert.deepEqual(Object.keys(GAME_DATA.cardStats).sort(), Object.keys(GAME_DATA.cards).sort());
  assert.deepEqual(Object.keys(GAME_DATA.weaponStats).sort(), Object.keys(GAME_DATA.weapons).sort());
  assert.ok(Object.values(GAME_DATA.cardStats).every(stats => stats.length > 0 && stats.every(stat => typeof stat === "string" && stat.length <= 31)));
  assert.ok(Object.values(GAME_DATA.weaponStats).every(stats => stats.length > 0));
});

test("validates six unique cards and cycles a completed card to the bottom", () => {
  const deck = ["emergencyCache", "rampart", "saboteur", "timeBomb", "echoRelay", "tapForge"];
  assert.deepEqual(validateLoadout({ deck, weapon: "volley" }), { deck, weapon: "volley" });
  const match = makeMatch("cycle-one", "cycle-two", { firstLoadout: { deck, weapon: "volley" } });
  const started = Date.now();
  assert.equal(handlePlaceCard(match, 1, { key: "emergencyCache", slot: 0 }), true);
  assert.deepEqual(match.players[1].hand, [null, "rampart", "saboteur"]);
  for (let index = 0; index < GAME_DATA.cards.emergencyCache.cost; index++) {
    assert.equal(handleTap(match, 1, { source: "card", key: "emergencyCache" }, started + index * 100), true);
  }
  assert.deepEqual(match.players[1].hand, ["timeBomb", "rampart", "saboteur"]);
  assert.equal(match.players[1].queue.at(-1), "emergencyCache");
  assert.equal(match.players[1].placed.crew, null);
  assert.ok(match.players[1].pending.some(job => job.key === "emergencyCache"));
});

test("loadout validation rejects malformed, oversized, duplicate, and inherited catalogue keys", () => {
  const deck = ["emergencyCache", "rampart", "saboteur", "timeBomb", "echoRelay", "tapForge"];
  const invalidDecks = [
    deck.slice(0, 5),
    [...deck, "phaseShield"],
    [...deck, deck[0]],
    [...deck.slice(0, 5), deck[0]],
    [...deck.slice(0, 5), "missingCard"],
    [...deck.slice(0, 5), "toString"],
    "not-an-array"
  ];
  for (const invalid of invalidDecks) {
    const result = validateLoadout({ deck: invalid, weapon: "volley" });
    assert.deepEqual(result.deck, GAME_DATA.defaultDeck);
    assert.notEqual(result.deck, GAME_DATA.defaultDeck, "fallback decks must not share the registry array");
    assert.equal(result.weapon, "volley", "deck and weapon validation remain independent");
  }
  assert.deepEqual(validateLoadout({ deck, weapon: "missingWeapon" }), { deck, weapon: "cannon" });
  assert.deepEqual(validateLoadout({ deck, weapon: "toString" }), { deck, weapon: "cannon" });
  assert.deepEqual(validateLoadout(null), { deck: GAME_DATA.defaultDeck, weapon: "cannon" });
});

test("placing reserves a hand slot and untouched same-category cards can swap", () => {
  const deck = ["phaseShield", "timeBomb", "arcLightning", "tapForge", "piercingShot", "rampart"];
  const match = makeMatch("place-one", "place-two", { firstLoadout: { deck, weapon: "cannon" } });
  const player = match.players[1];
  const started = Date.now();
  assert.equal(handlePlaceCard(match, 1, { key: "phaseShield", slot: 0 }), true);
  assert.deepEqual(player.placed.magic, { key: "phaseShield", slot: 0 });
  assert.equal(player.hand[0], null);
  assert.equal(handlePlaceCard(match, 1, { key: "timeBomb", slot: 1 }), true);
  assert.equal(player.hand[0], "phaseShield");
  assert.equal(player.hand[1], null);
  assert.deepEqual(player.placed.magic, { key: "timeBomb", slot: 1 });
  assert.equal(handleTap(match, 1, { source: "card", key: "timeBomb" }, started), true);
  assert.equal(handlePlaceCard(match, 1, { key: "phaseShield", slot: 0 }), false, "the first committed tap locks Magic");
  for (let index = 0; index < 3; index++) assert.equal(handleSiphon(match, 2, { source: "card", key: "timeBomb" }, started + index * 100), true);
  assert.equal(player.cardProgress.timeBomb, 0);
  assert.equal(handlePlaceCard(match, 1, { key: "phaseShield", slot: 0 }), true, "counterplay returning progress to zero unlocks swapping");
  assert.deepEqual(player.placed.magic, { key: "phaseShield", slot: 0 });
  assert.equal(player.hand[1], "timeBomb");
});

test("siphon bursts steal active progress at the two-for-one rate", () => {
  const match = makeMatch("siphon-one", "siphon-two");
  const started = Date.now();
  for (let index = 0; index < 3; index++) assert.equal(handleTap(match, 2, { source: "weapon" }, started + index * 100), true);
  for (let index = 0; index < 3; index++) assert.equal(handleSiphon(match, 1, { source: "weapon", key: "cannon" }, started + index * 100), true);
  assert.equal(match.players[2].weaponProgress, 2, "the first three-tap burst removes one committed tap");
  assert.equal(match.players[1].taps, 8, "three taps are spent and one stolen tap returns to reserve");

  for (let index = 3; index < 6; index++) assert.equal(handleSiphon(match, 1, { source: "weapon", key: "cannon" }, started + index * 100), true);
  assert.equal(match.players[2].weaponProgress, 0, "the second burst cashes the next two eligible pairs");
  assert.equal(match.players[1].taps, 7);
  assert.deepEqual(match.players[1].siphons["weapon:cannon"], { totalTaps: 6, processedPairs: 3, removed: 3 });
});

test("the permanent weapon and Attack cards share one visible lane", () => {
  const deck = ["piercingShot", "rampart", "phaseShield", "tapForge", "timeBomb", "echoRelay"];
  const match = makeMatch("attack-one", "attack-two", { firstLoadout: { deck, weapon: "volley" } });
  const started = Date.now();
  assert.equal(handlePlaceCard(match, 1, { key: "piercingShot", slot: 0 }), true);
  assert.equal(handleTap(match, 1, { source: "weapon" }, started), true);
  assert.equal(handleTap(match, 1, { source: "card", key: "piercingShot" }, started + 100), false);
});

test("breaking a Wall never changes the defender's tap reserve", () => {
  const match = makeMatch("wall-one", "wall-two");
  match.players[2].wallHp = 1;
  match.players[2].taps = 6.25;
  resolveCard(match, 1, "piercingShot", Date.now());
  assert.equal(match.players[2].wallHp, 0);
  assert.equal(match.players[2].taps, 6.25);
  assert.equal(match.lastEvent.type, "wallBreak");
  assert.equal(match.lastEvent.salvage, undefined);
});

test("recent events are ordered, bounded, and retain legacy lastEvent", () => {
  const match = makeMatch("events-one", "events-two");
  for (let index = 0; index < RECENT_EVENT_LIMIT + 5; index++) addEvent(match, "card", 1, { card: "rampart", sequence: index });
  assert.equal(match.recentEvents.length, RECENT_EVENT_LIMIT);
  assert.ok(match.recentEvents.every((event, index, events) => index === 0 || event.id > events[index - 1].id));
  assert.equal(match.lastEvent.id, match.recentEvents.at(-1).id);
  const state = serialize(match);
  assert.equal(state.lastEvent.id, state.recentEvents.at(-1).id);
  assert.equal(state.recentEvents[0].sequence, 5);
  const protectedEvent = addEvent(match, "place", 2, { id: 999, type: "unknown", side: 9, key: "rampart" });
  assert.deepEqual({ id: protectedEvent.id, type: protectedEvent.type, side: protectedEvent.side }, { id: RECENT_EVENT_LIMIT + 6, type: "place", side: 2 });
});

test("same-tick resolutions remain distinct and damage reports every defense layer", () => {
  const match = makeMatch("outcomes-one", "outcomes-two");
  const now = Date.now();
  resolveCard(match, 1, "rampart", now);
  resolveCard(match, 2, "phaseShield", now);
  const sameTick = match.recentEvents.slice(-2);
  assert.deepEqual(sameTick.map(event => event.type), ["card", "card"]);
  assert.ok(sameTick[0].id < sameTick[1].id);

  match.players[2].shield = 10;
  match.players[2].wallHp = 5;
  dealDamage(match, 1, 20, "cannon");
  assert.equal(match.lastEvent.type, "wallBreak");
  assert.equal(match.lastEvent.targetSide, 2);
  assert.deepEqual(match.lastEvent.damage, { shield: 10, wall: 5, core: 5 });
  assert.deepEqual(match.lastEvent.outcomes[2].coreHp, { before: 360, after: 355, delta: -5 });
  assert.deepEqual(match.lastEvent.outcomes[2].wallHp, { before: 5, after: 0, delta: -5 });
  assert.deepEqual(match.lastEvent.outcomes[2].shield, { before: 10, after: 0, delta: -10 });
});

test("healing, full-core Shield, and self-damage expose authoritative outcomes", () => {
  const match = makeMatch("healing-one", "healing-two");
  match.players[1].coreHp = 340;
  resolveCard(match, 1, "repairDrone", Date.now());
  assert.deepEqual(match.lastEvent.outcomes[1].coreHp, { before: 340, after: 360, delta: 20 });
  resolveCard(match, 1, "repairDrone", Date.now());
  assert.deepEqual(match.lastEvent.outcomes[1].shield, { before: 0, after: 20, delta: 20 });
  resolveCard(match, 2, "berserker", Date.now());
  assert.deepEqual(match.lastEvent.outcomes[2].coreHp, { before: 360, after: 348, delta: -12 });
});

test("Bloodthorn Spire and Cutpurse Band expose both authoritative sides without extra formulas", () => {
  const match = makeMatch("dual-one", "dual-two");
  match.players[1].wallHp = 40;
  match.players[2].shield = 5;
  match.players[2].wallHp = 10;
  resolveCard(match, 1, "leechSpire", match.startedAt + 30000);
  assert.equal(match.lastEvent.type, "wallBreak");
  assert.deepEqual(match.lastEvent.damage, { shield: 5, wall: 10, core: 10 });
  assert.deepEqual(match.lastEvent.outcomes[1].wallHp, { before: 40, after: 65, delta: 25 });
  assert.deepEqual(match.lastEvent.outcomes[2].shield, { before: 5, after: 0, delta: -5 });
  assert.deepEqual(match.lastEvent.outcomes[2].wallHp, { before: 10, after: 0, delta: -10 });
  assert.deepEqual(match.lastEvent.outcomes[2].coreHp, { before: 360, after: 350, delta: -10 });
  assert.equal(match.recentEvents.filter(event => event.type === "wallBreak").length, 1);

  match.players[1].taps = 10;
  match.players[2].taps = 10;
  resolveCard(match, 1, "pickpockets", match.startedAt);
  assert.deepEqual(match.lastEvent.outcomes[1].taps, { before: 10, after: 13, delta: 3 });
  assert.deepEqual(match.lastEvent.outcomes[2].taps, { before: 10, after: 7, delta: -3 });
});

test("structures occupy a maximum of eight visible village tiles", () => {
  const match = makeMatch("build-one", "build-two");
  const player = match.players[1];
  const now = Date.now();
  for (let index = 0; index < 3; index++) resolveCard(match, 1, "tapForge", now);
  for (let index = 0; index < 2; index++) resolveCard(match, 1, "glassReactor", now);
  for (let index = 0; index < 3; index++) resolveCard(match, 1, "salvageGuild", now);
  assert.equal(player.structures.length, 8);
  resolveCard(match, 1, "watchtower", now);
  assert.equal(player.structures.length, 8, "a full village cannot create a ninth structure");
  assert.ok(Object.values(GAME_DATA.cards).every(card => GAME_DATA.categories[card.category]));
  assert.equal(Object.keys(GAME_DATA.cards).length, 29);
});

test("pairs online players and shares tap commitments", async () => {
  const port = server.address().port;
  const first = connect(`http://localhost:${port}`, { transports: ["websocket"] });
  const second = connect(`http://localhost:${port}`, { transports: ["websocket"] });
  await Promise.all([once(first, "connect"), once(second, "connect")]);

  const firstMatch = once(first, "matchFound");
  const secondMatch = once(second, "matchFound");
  first.emit("findMatch");
  second.emit("findMatch");
  const [one, two] = await Promise.all([firstMatch, secondMatch]);
  assert.equal(one.matchId, two.matchId);
  assert.deepEqual([one.side, two.side].sort(), [1, 2]);

  const playerOneSocket = one.side === 1 ? first : second;
  const observer = one.side === 1 ? second : first;
  const committed = stateMatching(observer, state => state.players[1].weaponProgress === 1);
  playerOneSocket.emit("action", { type: "tap", source: "weapon" });
  const state = await committed;
  assert.ok(state.players[1].taps < 10, "a committed tap should leave the finite reserve");
  assert.equal(state.players[1].weaponProgress, 1);
  assert.equal(GAME_DATA.weapons.cannon.cost, 8);
  assert.equal(state.players[1].deck.length, 6);
  assert.equal(state.players[1].hand.length, 3);
  assert.deepEqual(state.players[1].placed, { attack: null, crew: null, magic: null });
  assert.equal(state.timeLeft, undefined, "elimination matches should not have a score timeout");

  const placed = stateMatching(observer, next => next.players[1].placed.crew?.key === "rampart");
  playerOneSocket.emit("action", { type: "place", key: "rampart", slot: 0 });
  const placedState = await placed;
  assert.equal(placedState.players[1].hand[0], null);
  assert.deepEqual(placedState.players[1].placed.crew, { key: "rampart", slot: 0 });
  assert.ok(Array.isArray(placedState.recentEvents));
  assert.equal(placedState.recentEvents.at(-1).type, "place");
  assert.equal(placedState.lastEvent.id, placedState.recentEvents.at(-1).id);

  first.close();
  second.close();
});

test("CPU uses the same visible resource model", async () => {
  const port = server.address().port;
  const player = connect(`http://localhost:${port}`, { transports: ["websocket"] });
  await once(player, "connect");
  const found = once(player, "matchFound");
  player.emit("startCpu");
  const match = await found;
  assert.equal(match.state.mode, "cpu");
  assert.equal(match.state.players[1].taps, 10);
  assert.equal(match.state.players[2].taps, 10);
  assert.ok(match.state.players[2].bot.name);

  const botActed = await stateMatching(player, state => state.players[2].stats.tapsSpent > 0, 2500);
  assert.ok(botActed.players[2].taps < 10.5);
  assert.ok(botActed.players[2].weaponProgress > 0 || Object.values(botActed.players[2].cardProgress).some(value => value > 0));
  assert.ok(botActed.players[2].placed.attack || botActed.players[2].placed.crew || botActed.players[2].placed.magic || botActed.players[2].weaponProgress > 0);
  player.close();
});
