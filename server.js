const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const queue = [];
const matches = new Map();

const UNIT_CARDS = {
  scout: { name: "Scout", cost: 4, hp: 70, speed: 8.2, damage: 9, color: "#5eead4" },
  ram: { name: "Ram", cost: 7, hp: 235, speed: 3.6, damage: 20, color: "#fb923c" },
  swarm: { name: "Spark Swarm", cost: 5, hp: 42, speed: 10.8, damage: 6, color: "#c4b5fd", count: 3 }
};

function makePlayer(id) {
  return { id, coreHp: 1000, energy: 6, heat: 0, towerHp: 0, shield: 0, taps: 0 };
}

function makeMatch(firstId, secondId) {
  const id = `match-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const match = {
    id,
    players: { 1: makePlayer(firstId), 2: makePlayer(secondId) },
    units: [],
    startedAt: Date.now(),
    lastTick: Date.now(),
    ended: false,
    nextUnitId: 1
  };
  matches.set(id, match);
  return match;
}

function opponent(side) { return side === 1 ? 2 : 1; }

function serialize(match) {
  return {
    id: match.id,
    timeLeft: Math.max(0, 180 - Math.floor((Date.now() - match.startedAt) / 1000)),
    players: {
      1: { ...match.players[1] },
      2: { ...match.players[2] }
    },
    units: match.units.map(({ id, side, type, hp, maxHp, position, color }) => ({ id, side, type, hp, maxHp, position, color }))
  };
}

function broadcast(match) {
  io.to(match.id).emit("state", serialize(match));
}

function finish(match, winner, reason = "core") {
  if (match.ended) return;
  match.ended = true;
  broadcast(match);
  io.to(match.id).emit("gameOver", { winner, reason });
  matches.delete(match.id);
}

function unitHit(unit, amount) {
  unit.hp -= amount;
  return unit.hp <= 0;
}

function tickMatch(match) {
  if (match.ended) return;
  const now = Date.now();
  const delta = Math.min(0.35, (now - match.lastTick) / 1000);
  match.lastTick = now;
  const elapsed = (now - match.startedAt) / 1000;

  if (elapsed >= 180) {
    const one = match.players[1].coreHp;
    const two = match.players[2].coreHp;
    finish(match, one === two ? 0 : one > two ? 1 : 2, "time");
    return;
  }

  for (const side of [1, 2]) {
    const player = match.players[side];
    player.energy = Math.min(10, player.energy + delta * 0.13);
    player.heat = Math.max(0, player.heat - delta * 10);
    player.shield = Math.max(0, player.shield - delta);
  }

  const defeated = new Set();
  for (const unit of match.units) {
    const enemySide = opponent(unit.side);
    const enemyUnits = match.units.filter(other => other.side === enemySide && !defeated.has(other.id));
    const collision = enemyUnits.find(other => Math.abs(other.position - unit.position) < 5);
    if (collision) {
      if (unitHit(collision, unit.damage * delta * 1.75)) defeated.add(collision.id);
      continue;
    }

    const defender = match.players[enemySide];
    const inDefenderHalf = unit.side === 1 ? unit.position > 52 : unit.position < 48;
    if (defender.towerHp > 0 && inDefenderHalf) {
      if (unitHit(unit, 20 * delta)) defeated.add(unit.id);
    }

    unit.position += (unit.side === 1 ? 1 : -1) * unit.speed * delta;
    const reachedCore = unit.side === 1 ? unit.position >= 100 : unit.position <= 0;
    if (reachedCore) {
      const reduction = defender.shield > 0 ? 0.45 : 1;
      defender.coreHp = Math.max(0, defender.coreHp - unit.damage * 5 * reduction);
      defeated.add(unit.id);
    }
  }
  match.units = match.units.filter(unit => !defeated.has(unit.id) && unit.hp > 0);

  if (match.players[1].coreHp <= 0 || match.players[2].coreHp <= 0) {
    finish(match, match.players[1].coreHp <= 0 ? 2 : 1);
  } else {
    broadcast(match);
  }
}

const ticker = setInterval(() => {
  for (const match of matches.values()) tickMatch(match);
}, 180);

function joinMatch(socket, match, side) {
  socket.leave("queue");
  socket.join(match.id);
  socket.data.matchId = match.id;
  socket.data.side = side;
  socket.emit("matchFound", { matchId: match.id, side, state: serialize(match) });
}

function removeFromQueue(id) {
  const index = queue.indexOf(id);
  if (index !== -1) queue.splice(index, 1);
}

io.on("connection", socket => {
  socket.on("findMatch", () => {
    if (socket.data.matchId) return;
    removeFromQueue(socket.id);
    const opponentId = queue.shift();
    if (!opponentId || !io.sockets.sockets.get(opponentId)) {
      queue.push(socket.id);
      socket.emit("queueStatus", { searching: true });
      return;
    }
    const otherSocket = io.sockets.sockets.get(opponentId);
    const match = makeMatch(opponentId, socket.id);
    joinMatch(otherSocket, match, 1);
    joinMatch(socket, match, 2);
    broadcast(match);
  });

  socket.on("cancelSearch", () => {
    removeFromQueue(socket.id);
    socket.emit("queueStatus", { searching: false });
  });

  socket.on("action", ({ type, card }) => {
    const match = matches.get(socket.data.matchId);
    const side = socket.data.side;
    if (!match || !side || match.ended) return;
    const player = match.players[side];
    const enemySide = opponent(side);

    if (type === "tap") {
      const gain = player.heat > 75 ? 0.32 : 0.8;
      player.heat = Math.min(100, player.heat + 7);
      player.taps += 1;
      if (card === "mine") player.energy = Math.min(10, player.energy + gain);
      if (card === "pulse") {
        const target = match.units
          .filter(unit => unit.side === enemySide)
          .sort((a, b) => side === 1 ? a.position - b.position : b.position - a.position)[0];
        if (target) target.hp -= 28;
        else match.players[enemySide].coreHp = Math.max(0, match.players[enemySide].coreHp - 5);
      }
      if (card === "build") {
        if (player.towerHp > 0) player.towerHp = Math.min(300, player.towerHp + 12);
        else player.shield = Math.min(8, player.shield + 0.9);
      }
    }

    if (type === "play" && UNIT_CARDS[card]) {
      const definition = UNIT_CARDS[card];
      if (player.energy >= definition.cost) {
        player.energy -= definition.cost;
        const count = definition.count || 1;
        for (let i = 0; i < count; i += 1) {
          match.units.push({
            id: match.nextUnitId++, side, type: definition.name, hp: definition.hp,
            maxHp: definition.hp, speed: definition.speed, damage: definition.damage,
            color: definition.color, position: side === 1 ? 8 - i * 2 : 92 + i * 2
          });
        }
      }
    }

    if (type === "play" && card === "tower" && player.energy >= 8 && player.towerHp <= 0) {
      player.energy -= 8;
      player.towerHp = 300;
    }
    if (type === "play" && card === "shield" && player.energy >= 5) {
      player.energy -= 5;
      player.shield = 8;
    }
    broadcast(match);
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    const match = matches.get(socket.data.matchId);
    if (match && !match.ended) finish(match, opponent(socket.data.side), "disconnect");
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Taptics running on http://localhost:${PORT}`));
}

module.exports = { server, io, ticker };
