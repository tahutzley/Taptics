# Taptics

A mobile-first real-time tapping strategy prototype. Choose whether each tap generates Energy, pulses enemy units, or repairs your defense—then use a compact deck to send a winning push and break the opposing Core.

## Play locally

```bash
npm install
npm start
```

Open `http://localhost:3000`. Choose **Battle CPU** for a solo match. Open the app in two browser windows and choose **Find Random Rival** in each to test live random matchmaking.

## Prototype controls

- **Mine** taps give Energy to play cards. Tapping too quickly builds Heat and lowers mining output.
- **Pulse** taps damage the closest incoming unit, or chip the enemy Core when their lane is clear.
- **Build** taps repair your tower; without one, they build a short-lived Core shield.
- Cards use Energy: Scout, Ram, Spark Swarm, Defense Tower, and Shield.
- Destroy the opponent's 1,000-HP Core, or hold more Core health at the three-minute mark.

## Online play

The included Socket.IO server owns random matchmaking and game state, so live matches work wherever this Node app is hosted. Deploy with the `npm start` command (for example, on Render, Railway, or Fly.io); use a host that supports persistent WebSocket connections.

This is an intentionally compact prototype: no accounts, rating, persistence, anti-cheat hardening, card collection, or crate inventory are included yet.
