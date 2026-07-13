"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
const pixelStyles = fs.readFileSync(path.join(__dirname, "..", "public", "assets", "pixel", "pixel-art.css"), "utf8");

test("shared card-frame API stays presentation-only and drives the lobby loadout", () => {
  assert.match(appSource, /CARD_FRAME_VARIANTS = new Set\(\["lobby", "battle", "queued", "deck", "detail"\]\)/);
  assert.match(appSource, /window\.TapticsUI = Object\.freeze\(\{ cardFrame, effectPresentation, isValidDeck, presentationEvents, resultPresentation \}\)/);
  assert.match(appSource, /profile\.deck\.map\(key => cardFrame\(key, \{ variant: "lobby" \}\)\)/);
  assert.doesNotMatch(appSource.match(/function cardFrame[\s\S]*?window\.TapticsUI/)?.[0] || "", /socket\.emit|localStorage|addEventListener/);
});

test("catalogue art and effect families feed shared presentation helpers", () => {
  assert.match(appSource, /pixel-\$\{source\}-\$\{key\}/);
  assert.match(appSource, /pixel-weapon-\$\{player\.weapon\}/);
  assert.match(appSource, /pixel-structure-\$\{key\}/);
  assert.match(appSource, /function effectPresentation\(key, source = "card"\)/);
  assert.match(appSource, /function familyEffect\(event, options = \{\}\)/);
  assert.match(appSource, /pixel-family-\$\{definition\.effectFamily\}/);
  assert.match(appSource, /function showResolutionFamily\(event\)/);
  assert.doesNotMatch(appSource, /\["cannon",\s*"timeBomb",\s*"sappers",\s*"siegeSalvo"\]/);
});

test("Deck uses stable delegated catalogue nodes, strict drafts, details, and ordering controls", () => {
  assert.match(appSource, /function isValidDeck\(deck\)/);
  assert.match(appSource, /Object\.hasOwn\(registry, key\)/);
  assert.match(appSource, /new Set\(deck\)\.size === DATA\.deckSize/);
  assert.match(appSource, /function ensureDeckCatalogue\(\)/);
  assert.match(appSource, /function updateDeckSlots\(focus = null\)/);
  assert.match(appSource, /function updateLibraryState\(\)/);
  assert.match(appSource, /function renderDeckDetails\(key = builderDetailKey/);
  assert.match(appSource, /#card-library"\)\.addEventListener\("click"/);
  assert.match(appSource, /#builder-deck"\)\.addEventListener\("click"/);
  assert.match(appSource, /#deck-filters"\)\.addEventListener\("click"/);
  assert.match(appSource, /const deckDraft = deckIsDirty\(\) \? \{ deck: \[\.\.\.builderDeck\], weapon: builderWeapon \} : null/);
  assert.match(appSource, /function saveProfile\(candidate = profile\) \{[\s\S]*?return false;/);
  assert.match(appSource, /const candidate = \{ \.\.\.profile, deck: \[\.\.\.builderDeck\], weapon: builderWeapon, deckDraft: null \}/);
  assert.match(appSource, /if \(!saveProfile\(candidate\)\) \{[\s\S]*?LOADOUT NOT SAVED/);
  assert.match(appSource, /if \(canceledSearch\) \{[\s\S]*?socket\.emit\("cancelSearch"\)/);
  assert.match(appSource, /const preservedDraft = deckIsDirty\(\)/);
  assert.doesNotMatch(appSource, /\$\$\("\[data-library-card\]"\)[\s\S]{0,120}addEventListener/);
  for (const hook of ["deck-status", "deck-details", "deck-detail-toggle", "deck-filters", "builder-deck", "card-library"]) assert.match(html, new RegExp(`id="${hook}"`));
  for (const state of ["invalid", "dirty", "saving", "saved", "error"]) assert.match(appSource, new RegExp(`"${state}"`));
  assert.match(html, /id="deck-status" class="deck-status pixel-panel"><\/div>/);
  assert.match(html, /id="deck-announcer" class="sr-only" role="status" aria-live="polite"/);
  for (const action of ["details", "left", "right", "remove"]) assert.match(appSource, new RegExp(`data-slot-action=\\"${action}\\"`));
});

test("lobby uses local pixel assets and exposes pressed navigation state", () => {
  assert.match(html, /href="\/assets\/pixel\/pixel-art\.css"/);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  assert.match(html, /id="sound-toggle"[^>]+aria-pressed="true"/);
  assert.match(html, /id="online-button"[^>]+aria-pressed="false"/);
  assert.match(html, /pixel-nav-battle/);
});

test("lifecycle dialogs preserve focus, authority, bounded feedback, and non-result interruptions", () => {
  assert.match(html, /id="leave-modal"[^>]+role="dialog"[^>]+aria-modal="true"[^>]+aria-labelledby="leave-title"[^>]+aria-describedby="leave-copy"/);
  assert.match(html, /id="result-modal"[^>]+role="dialog"[^>]+aria-modal="true"[^>]+aria-labelledby="result-title"[^>]+aria-describedby="result-copy result-read"/);
  assert.match(html, /id="result-title" tabindex="-1"/);
  assert.match(html, /id="lifecycle-status" class="sr-only" role="status" aria-live="polite"/);
  assert.match(html, /id="toast" class="toast pixel-modal-frame hidden"[^>]+role="status" aria-live="polite"/);
  assert.match(html, /id="card-inspector" class="card-inspector pixel-modal-frame hidden" role="tooltip"/);
  assert.match(html, /pixel-result-victory/);
  assert.match(html, /pixel-status-warning/);
  assert.match(html, /disabled aria-disabled="true" aria-label="Challenges locked, coming soon"[^>]*>[\s\S]*?<small>LOCKED<\/small>/);

  assert.match(appSource, /function resultPresentation\(\{ winner, reason \} = \{\}, side = ownSide, interruption = false\)/);
  assert.match(appSource, /reason === "leave" \? "RIVAL FORFEITED" : reason === "disconnect" \? "RIVAL CONNECTION LOST"/);
  assert.match(appSource, /if \(interruption\) return Object\.freeze\(\{ outcome: "interrupted"[\s\S]*?record was not changed/);
  assert.match(appSource, /shell\.inert = value;[\s\S]*?shell\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(appSource, /function openLifecycleDialog\(dialog, initialFocus, returnFocus = document\.activeElement\)[\s\S]*?initialFocus\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(appSource, /function closeLifecycleDialog\(dialog, \{ restoreFocus = true \} = \{\}\)[\s\S]*?returnFocus\.focus\(\{ preventScroll: true \}\)/);
  assert.match(appSource, /function handleDialogKeydown\(event\)[\s\S]*?event\.key === "Escape"[\s\S]*?event\.key !== "Tab"/);

  const leaveRequest = appSource.match(/function requestLeaveBattle\(\)[\s\S]*?function cancelLeaveBattle/)?.[0] || "";
  const leaveConfirmation = appSource.match(/function confirmLeaveBattle\(\)[\s\S]*?function returnToLobbyFromResult/)?.[0] || "";
  assert.doesNotMatch(leaveRequest, /socket\.emit\("leaveMatch"\)/);
  assert.match(leaveConfirmation, /socket\.emit\("leaveMatch"\)/);
  assert.match(appSource, /const count = outcome === "victory" \? 6 : 4/);
  assert.match(appSource, /if \(outcome === "interrupted" \|\| matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return/);
  assert.match(appSource, /function showConnectionInterruption\(\)[\s\S]*?renderResult\(\{ winner: null, reason: "connection", state: matchState \}, \{ interruption: true \}\)/);
  assert.match(appSource, /function endGame\(\{ winner, reason, state \}\) \{[\s\S]*?matchState\?\.id && state\.id && state\.id !== matchState\.id/);
  assert.match(appSource, /socket\.on\("gameOver", payload => endGame\(payload\)\)/);
  assert.match(appSource, /socket\.on\("disconnect", \(\) => \{[\s\S]*?if \(gameActive\) showConnectionInterruption\(\)/);
});

test("battle presentation keeps ordered feedback, layered defenses, and keyboard counterplay", () => {
  assert.match(appSource, /const MAX_EFFECT_NODES = 18/);
  assert.match(appSource, /while \(overlay\.children\.length >= MAX_EFFECT_NODES\) overlay\.firstElementChild\.remove\(\)/);
  assert.match(appSource, /for \(const event of presentationEvents\(state, lastEventId\)\) \{/);
  assert.match(appSource, /Number\.isSafeInteger\(event\.id\)/);
  assert.match(appSource, /function validPresentationEvent\(event\)/);
  assert.match(appSource, /unique\.set\(event\.id, event\)/);
  assert.match(appSource, /const tabIndex = target \|\| inspectable \? 0 : -1/);
  assert.match(appSource, /setAttribute\(element, "aria-disabled", !target\)/);
  assert.match(appSource, /aria-keyshortcuts="I F2"/);
  assert.match(html, /id="enemy-tap-meter"[^>]+role="progressbar"[^>]+aria-valuemin="0"[^>]+aria-valuemax="40"/);
  assert.match(html, /id="own-structures" class="structure-grid" role="list"/);
  assert.match(appSource, /Press Enter or Space to siphon/);
  assert.match(appSource, /finally \{ lastEventId = Math\.max\(lastEventId, event\.id\); \}/);
  assert.match(appSource, /pixel-effect-impact/);
  assert.match(appSource, /pixel-effect-debris/);
  assert.match(appSource, /pixel-effect-siphon-pip/);
  assert.match(appSource, /function siphonTapKey\(event\)/);
  for (const handler of ["placeHandCardKey", "activateCommitKey", "commitWeaponKey", "siphonTapKey"]) {
    assert.match(appSource, new RegExp(`function ${handler}\\(event\\)`));
  }
  assert.match(html, /id="battle-effects" class="battle-effects" aria-hidden="true"/);
  assert.match(html, /id="combat-status" class="sr-only" role="status" aria-live="polite"/);
  for (const prefix of ["own", "enemy"]) {
    assert.match(html, new RegExp(`id="${prefix}-shield-bar"`));
    assert.match(html, new RegExp(`id="${prefix}-wall-bar"`));
    assert.match(html, new RegExp(`id="${prefix}-core-bar-board"`));
  }
  assert.equal((html.match(/class="queued-frame-slot"/g) || []).length, 6);
});

test("release hardening keeps hot renders guarded and removes retired proof components", () => {
  for (const helper of ["setText", "setAttribute", "setStyle", "setDataset", "toggleClass", "actionUnavailable", "clearBattlePresentation"]) assert.match(appSource, new RegExp(`function ${helper}\\(`));
  assert.match(appSource, /banner\.dataset\.signature !== signature/);
  assert.match(appSource, /element\.dataset\.signature === signature/);
  assert.match(appSource, /weaponButton\.dataset\.weaponKey !== player\.weapon/);
  assert.match(appSource, /showLobby\(\)[\s\S]*?clearBattlePresentation\(\)/);
  assert.match(appSource, /showGame\(\)[\s\S]*?clearBattlePresentation\(\)/);
  assert.match(appSource, /toast\(message, toneName = "notice", announce = true\)/);
  assert.match(appSource, /element\.setAttribute\("aria-live", announce \? "polite" : "off"\)/);
  assert.match(appSource, /actionUnavailable\(element\)[\s\S]*?aria-disabled/);
  assert.match(appSource, /if \(weaponButton\.disabled\) weaponButton\.disabled = false;[\s\S]*?setAttribute\(weaponButton, "aria-disabled", weaponBlocked\)/);
  assert.match(appSource, /actionUnavailable\(button\) \|\| button\.dataset\.placing/);
  assert.match(styles, /\.siphon-tap::before,[\s\S]*?animation: none !important/);
  assert.match(styles, /#result-title:focus-visible[\s\S]*?outline: 3px solid var\(--siege-shadow\)[\s\S]*?box-shadow: 0 0 0 6px var\(--siege-focus\)/);
  assert.doesNotMatch(`${html}\n${styles}\n${pixelStyles}`, /panel-proof|icon-tap|weapon-barrel|volley-team|crew-people|rune-mark|reserve-notches/);
  assert.doesNotMatch(styles, /\.rules\b/);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "assets-src", "pixel", "proof-assets.js")), false);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "assets-src", "pixel", "ui-assets.js")), true);
});
