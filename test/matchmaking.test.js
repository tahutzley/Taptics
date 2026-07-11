const test = require("node:test");
const assert = require("node:assert/strict");
const { io: connect } = require("socket.io-client");
const { server, io, ticker } = require("../server");

function once(socket, event) {
  return new Promise(resolve => socket.once(event, resolve));
}

function stateMatching(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for game state")), 1500);
    socket.on("state", state => {
      if (predicate(state)) {
        clearTimeout(timer);
        resolve(state);
      }
    });
  });
}

test.before(async () => {
  await new Promise(resolve => server.listen(0, resolve));
});

test.after(async () => {
  clearInterval(ticker);
  await new Promise(resolve => io.close(() => server.close(resolve)));
});

test("pairs random players and shares deployed units", async () => {
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

  const firstState = stateMatching(first, state => state.units.length === 1);
  const secondState = stateMatching(second, state => state.units.length === 1);
  const playerOneSocket = one.side === 1 ? first : second;
  playerOneSocket.emit("action", { type: "play", card: "scout" });
  const [stateOne, stateTwo] = await Promise.all([firstState, secondState]);

  assert.equal(stateOne.units[0].type, "Scout");
  assert.equal(stateTwo.units[0].side, 1);
  first.close();
  second.close();
});
