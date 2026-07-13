# Browser client scope

These instructions apply to `public/`. Also obey the root `AGENTS.md`.

## Required context

- For any browser change, read `../docs/agent/frontend.md`.
- For card, weapon, category, or visible rule changes, also read `../docs/agent/gameplay.md`.
- For state payload assumptions or emitted actions, also read `../docs/agent/architecture.md`.

## Ownership

- `game-data.js`: one universal data registry for cards, categories, weapons, deck size, hand size, and default deck. It must remain usable through both `require()` and `window.GAME_DATA`.
- `index.html`: semantic screen and battlefield structure. Keep script order `socket.io` -> `game-data.js` -> `app.js`.
- `app.js`: local profile/loadout persistence, Socket.IO presentation, selection and tap input, state rendering, sound, and results.
- `styles.css`: the complete responsive visual system. There is no CSS framework or build step.

## Client contracts

- Treat every server snapshot as authoritative. Send only `{ type, source, key }` actions.
- Keep the three hand buttons stable between state ticks. `renderBattleHand()` may replace their HTML only when the hand signature changes, then updates state in place.
- Hand and weapon selection use `pointerdown` for immediate touch response plus a filtered `click` fallback for keyboard/assistive activation. Do not add per-card listeners during render.
- A blocked lane disables commitment without making an unrelated card impossible to select unless the lane rule requires it.
- Render one chosen Attack weapon on the left, Crew villagers in the middle, Magic runes on the right, one Wall, and eight structure slots per village.
- Rival intent is communicated primarily through battlefield loading/pending/counterable cues. Do not replace it with dense intent text.
- Do not disable pinch zoom. Retain visible `:focus-visible`, live regions, reduced-motion support, readable type, and at least 48px primary touch areas.

## Verification

Run `npm test` after client changes. For layout, interaction, or responsive work, also inspect the running app at phone and desktop widths as described in `../docs/agent/testing.md`.

If a durable client contract changes, update `../docs/agent/frontend.md` in the same patch.
