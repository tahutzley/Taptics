const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { io: connect } = require("socket.io-client");
const { server, io, ticker, GAME_DATA, makeMatch, handleTap, handleSiphon, resolveCard, phaseAt, validateLoadout } = require("../server");

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
  assert.match(html, /id="toast" class="toast hidden" role="status" aria-live="polite"/);
  assert.match(html, /id="own-weapon"/);
  assert.match(html, /id="own-crew"/);
  assert.match(html, /id="own-magic"/);
  assert.doesNotMatch(html, /id="own-(?:cannon|volley)"/);
  assert.match(html, /class="base own-base"[\s\S]*id="commit-button" class="lane-commit/);
  assert.doesNotMatch(html, /class="(?:commit-note|own-status)"|id="own-(?:core-value|core-bar|wall-footer)"/);
  assert.match(client, /hand\.dataset\.signature !== handSignature/);
  assert.match(client, /#battle-hand"\)\.addEventListener\("pointerdown", selectHandCard\)/);
  assert.match(client, /data-busy-label="\$\{category\.name\.toUpperCase\(\)\} IS BUSY"/);
  assert.match(client, /button\.className = `lane-commit target-\$\{categoryKey\}/);
  assert.match(client, /#commit-button"\)\.addEventListener\("click", activateCommit\)/);
  assert.match(client, /#commit-button"\)\.addEventListener\("keydown", activateCommitKey\)/);
  assert.doesNotMatch(battleCardRenderer, /card\.type\.toUpperCase\(\)/);
  assert.doesNotMatch(client, /data-hand-slot[^\n]+addEventListener/);
});

test("validates six unique cards and cycles a completed card to the bottom", () => {
  const deck = ["emergencyCache", "rampart", "saboteur", "timeBomb", "echoRelay", "tapForge"];
  assert.deepEqual(validateLoadout({ deck, weapon: "volley" }), { deck, weapon: "volley" });
  const match = makeMatch("cycle-one", "cycle-two", { firstLoadout: { deck, weapon: "volley" } });
  const started = Date.now();
  for (let index = 0; index < GAME_DATA.cards.emergencyCache.cost; index++) {
    assert.equal(handleTap(match, 1, { source: "card", key: "emergencyCache" }, started + index * 100), true);
  }
  assert.deepEqual(match.players[1].hand, ["timeBomb", "rampart", "saboteur"]);
  assert.equal(match.players[1].queue.at(-1), "emergencyCache");
  assert.ok(match.players[1].pending.some(job => job.key === "emergencyCache"));
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

test("one unfinished action owns its category lane until completion or counterplay", () => {
  const deck = ["phaseShield", "timeBomb", "arcLightning", "tapForge", "piercingShot", "rampart"];
  const match = makeMatch("lane-one", "lane-two", { firstLoadout: { deck, weapon: "cannon" } });
  const started = Date.now();
  assert.equal(handleTap(match, 1, { source: "card", key: "phaseShield" }, started), true);
  assert.equal(handleTap(match, 1, { source: "card", key: "timeBomb" }, started + 100), false, "a second Magic card is locked");
  for (let index = 0; index < 3; index++) assert.equal(handleSiphon(match, 2, { source: "card", key: "phaseShield" }, started + index * 100), true);
  assert.equal(match.players[1].cardProgress.phaseShield, 0);
  assert.equal(handleTap(match, 1, { source: "card", key: "timeBomb" }, started + 400), true, "draining the first spell releases Magic");
});

test("the permanent weapon and Attack cards share one visible lane", () => {
  const deck = ["piercingShot", "rampart", "phaseShield", "tapForge", "timeBomb", "echoRelay"];
  const match = makeMatch("attack-one", "attack-two", { firstLoadout: { deck, weapon: "volley" } });
  const started = Date.now();
  assert.equal(handleTap(match, 1, { source: "weapon" }, started), true);
  assert.equal(handleTap(match, 1, { source: "card", key: "piercingShot" }, started + 100), false);
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
  assert.equal(state.timeLeft, undefined, "elimination matches should not have a score timeout");

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
  player.close();
});
