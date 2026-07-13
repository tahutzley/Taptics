# Taptics agent map

This file is the entry point for coding agents. Keep it short: it routes work to the smallest relevant source of truth instead of duplicating the repository documentation.

## Start here

1. Read this file completely.
2. Read only the routes relevant to the task below. If a task crosses boundaries, read every applicable route before editing.
3. Inspect the implementation and tests named by those routes; context files summarize the code but never replace it.
4. Before finishing, follow the context-maintenance check below.

## Task routes

| Task | Read before editing |
| --- | --- |
| Runtime architecture, Socket.IO state, matchmaking, CPU behavior, or server rules | `docs/agent/architecture.md`, then `server.js` |
| Combat balance, taps, cards, weapons, lanes, siphoning, phases, or deck cycling | `docs/agent/gameplay.md`, `public/game-data.js`, and the relevant `server.js` functions |
| Browser UI, battlefield, deck builder, accessibility, input, animation, or CSS | `public/AGENTS.md` and `docs/agent/frontend.md` |
| Tests, regression coverage, or verification | `test/AGENTS.md` and `docs/agent/testing.md` |
| Repository context structure or documentation maintenance | `docs/agent/maintenance.md` |

## Repository at a glance

- `server.js` is authoritative for matches, resource validation, timing, effects, bots, and results.
- `public/game-data.js` is the universal card/weapon/category registry loaded by both Node and the browser.
- `public/app.js`, `public/index.html`, and `public/styles.css` form the dependency-free browser client.
- `test/matchmaking.test.js` covers rules, real-time integration, CPU parity, and key UI contracts.
- `README.md` is the player/developer overview; `docs/agent/` is durable implementation context for agents.

## Commands

```powershell
npm install
npm start
npm test
```

Use `npm run dev` for Node watch mode. The app is served at `http://localhost:3000` by default.

## Non-negotiable contracts

- Preserve server authority. The client may predict presentation, never results or resources.
- Keep shared definitions in `public/game-data.js`; do not create a second card or weapon registry.
- A valid loadout is six unique cards plus one always-available weapon; the battle hand shows three cards.
- Attack, Crew, and Magic each allow one unfinished commitment. The permanent weapon shares Attack.
- Only the selected permanent weapon is rendered. Crew and Magic have distinct battlefield zones.
- Preserve the delegated, stable hand-selection path described in `docs/agent/frontend.md`.
- Keep browser zoom enabled, visible focus, live status announcements, and large touch targets.
- Do not overwrite unrelated working-tree changes.

## Context-maintenance check

Treat context as part of the implementation. Before finishing any code change:

1. Review `git diff --name-only` and the routing table in `docs/agent/maintenance.md`.
2. Update the smallest applicable file in `docs/agent/` when architecture, behavior, interfaces, commands, tests, or durable UI contracts changed.
3. Update this root map only when routes, top-level ownership, or universal rules changed. Put details in routed files.
4. Update `README.md` when player-visible setup or gameplay changed.
5. Run the checks in `docs/agent/testing.md` and report anything not run.

Do not create chronological session logs or speculative documentation. Keep routed context describing the current codebase, and delete or correct stale claims in the same patch that makes them stale.
