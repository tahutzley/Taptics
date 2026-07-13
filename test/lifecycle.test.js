const test = require("node:test");
const assert = require("node:assert/strict");
const { io: connect } = require("socket.io-client");
const { server, io, ticker } = require("../server");

const EVENT_TIMEOUT_MS = 2000;

function eventMatching(socket, event, predicate = () => true, timeout = EVENT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    const listener = payload => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

async function connectClient(t) {
  const socket = connect(`http://localhost:${server.address().port}`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false
  });
  t.after(() => socket.close());
  await eventMatching(socket, "connect");
  return socket;
}

async function queue(socket) {
  const status = eventMatching(socket, "queueStatus", payload => payload?.searching === true);
  socket.emit("findMatch");
  return status;
}

async function pair(first, second) {
  const firstFound = eventMatching(first, "matchFound");
  const secondFound = eventMatching(second, "matchFound");
  first.emit("findMatch");
  second.emit("findMatch");
  const [one, two] = await Promise.all([firstFound, secondFound]);
  assert.equal(one.matchId, two.matchId);
  assert.deepEqual([one.side, two.side].sort(), [1, 2]);
  return { one, two };
}

function assertFreshOnlineMatch(one, two, previousMatchId) {
  assert.notEqual(one.matchId, previousMatchId);
  assert.equal(one.state.mode, "online");
  assert.equal(two.state.mode, "online");
  for (const state of [one.state, two.state]) {
    assert.equal(state.players[1].coreHp, 360);
    assert.equal(state.players[2].coreHp, 360);
    assert.equal(state.players[1].taps, 10);
    assert.equal(state.players[2].taps, 10);
    assert.equal(state.players[1].stats.tapsSpent, 0);
    assert.equal(state.players[2].stats.tapsSpent, 0);
  }
}

function assertGameOverPayload(payload, { matchId, winner, reason }) {
  assert.deepEqual(Object.keys(payload).sort(), ["reason", "state", "winner"]);
  assert.equal(payload.winner, winner);
  assert.equal(payload.reason, reason);
  assert.equal(payload.state.id, matchId);
  assert.equal(payload.state.mode, "online");
}

test.before(async () => {
  await new Promise(resolve => server.listen(0, resolve));
});

test.after(async () => {
  clearInterval(ticker);
  await new Promise(resolve => io.close(() => server.close(resolve)));
});

test("canceling search and starting CPU both remove a player from the online queue", async t => {
  const canceled = await connectClient(t);
  await queue(canceled);
  const stopped = eventMatching(canceled, "queueStatus", payload => payload?.searching === false);
  canceled.emit("cancelSearch");
  assert.deepEqual(await stopped, { searching: false });

  let canceledMatch = null;
  canceled.on("matchFound", payload => { canceledMatch = payload; });
  const first = await connectClient(t);
  const second = await connectClient(t);
  await pair(first, second);
  assert.equal(canceledMatch, null, "a canceled search must not consume the next opponent");

  const interrupted = await connectClient(t);
  await queue(interrupted);
  const cpuFound = eventMatching(interrupted, "matchFound", payload => payload?.state?.mode === "cpu");
  interrupted.emit("startCpu");
  const cpu = await cpuFound;
  assert.equal(cpu.side, 1);

  let interruptedOnlineMatch = null;
  interrupted.on("matchFound", payload => {
    if (payload.state.mode === "online") interruptedOnlineMatch = payload;
  });
  const third = await connectClient(t);
  const fourth = await connectClient(t);
  await pair(third, fourth);
  assert.equal(interruptedOnlineMatch, null, "starting CPU must interrupt the pending online search");
});

test("leaving emits the authoritative final payload to both players and permits a fresh rematch", async t => {
  const first = await connectClient(t);
  const second = await connectClient(t);
  const initial = await pair(first, second);
  const matchId = initial.one.matchId;
  const leaverSide = initial.one.side;
  const survivorSide = initial.two.side;
  const survivorOrder = [];
  const survivorStateListener = state => {
    if (state.id === matchId) survivorOrder.push({ type: "state", payload: state });
  };
  second.on("state", survivorStateListener);
  t.after(() => second.off("state", survivorStateListener));

  const leaverOver = eventMatching(first, "gameOver", payload => payload?.state?.id === matchId);
  const survivorOver = eventMatching(second, "gameOver", payload => payload?.state?.id === matchId);
  second.once("gameOver", payload => survivorOrder.push({ type: "gameOver", payload }));
  first.emit("leaveMatch");
  const [leftPayload, survivedPayload] = await Promise.all([leaverOver, survivorOver]);

  assertGameOverPayload(leftPayload, { matchId, winner: survivorSide, reason: "leave" });
  assertGameOverPayload(survivedPayload, { matchId, winner: survivorSide, reason: "leave" });
  assert.equal(leftPayload.winner === leaverSide, false);
  assert.deepEqual(leftPayload, survivedPayload);
  assert.deepEqual(survivorOrder.slice(-2).map(entry => entry.type), ["state", "gameOver"]);
  assert.deepEqual(survivorOrder.at(-2).payload, survivedPayload.state);

  const rematch = await pair(first, second);
  assertFreshOnlineMatch(rematch.one, rematch.two, matchId);
});

test("disconnecting emits a victory to the survivor and that survivor can match again from clean state", async t => {
  const disconnected = await connectClient(t);
  const survivor = await connectClient(t);
  const initial = await pair(disconnected, survivor);
  const matchId = initial.one.matchId;
  const survivorSide = initial.two.side;
  const survivorOrder = [];
  const survivorStateListener = state => {
    if (state.id === matchId) survivorOrder.push({ type: "state", payload: state });
  };
  survivor.on("state", survivorStateListener);
  t.after(() => survivor.off("state", survivorStateListener));

  const gameOver = eventMatching(survivor, "gameOver", payload => payload?.state?.id === matchId);
  survivor.once("gameOver", payload => survivorOrder.push({ type: "gameOver", payload }));
  disconnected.close();
  const payload = await gameOver;

  assertGameOverPayload(payload, { matchId, winner: survivorSide, reason: "disconnect" });
  assert.deepEqual(survivorOrder.slice(-2).map(entry => entry.type), ["state", "gameOver"]);
  assert.deepEqual(survivorOrder.at(-2).payload, payload.state);

  const newOpponent = await connectClient(t);
  const rematch = await pair(survivor, newOpponent);
  assertFreshOnlineMatch(rematch.one, rematch.two, matchId);
});
