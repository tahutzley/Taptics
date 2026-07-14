"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
const pixelStyles = fs.readFileSync(path.join(__dirname, "..", "public", "assets", "pixel", "pixel-art.css"), "utf8");
const gameData = require(path.join(__dirname, "..", "public", "game-data.js"));

test("shared card-frame API stays presentation-only and drives the active saved loadout", () => {
  const lobbyLoadout = appSource.match(/function renderLobbyLoadout\(\)[\s\S]*?function setMenuTab/)?.[0] || "";
  const battleLoadout = appSource.match(/function savedLoadout[\s\S]*?function currentRating/)?.[0] || "";

  assert.match(appSource, /CARD_FRAME_VARIANTS = new Set\(\["lobby", "battle", "queued", "deck", "armory", "detail"\]\)/);
  assert.match(appSource, /window\.TapticsUI = Object\.freeze\(\{ cardFrame, effectPresentation, isValidDeck, presentationEvents, resultPresentation \}\)/);
  assert.match(lobbyLoadout, /const active = savedLoadout\(\);[\s\S]*?active\.deck\.map\(key => cardFrame\(key, \{ variant: "lobby" \}\)\)/);
  assert.match(battleLoadout, /function savedLoadout\(index = profile\.activeDeck\) \{ return profile\.loadouts\[index\] \|\| profile\.loadouts\[0\]; \}/);
  assert.match(battleLoadout, /function loadout\(\) \{[\s\S]*?const active = savedLoadout\(\);[\s\S]*?return \{ deck: \[\.\.\.active\.deck\], weapon: active\.weapon \};/);
  assert.match(appSource, /socket\.emit\("startCpu", loadout\(\)\)/);
  assert.match(appSource, /socket\.emit\("findMatch", loadout\(\)\)/);
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

test("Deck lazily creates stable shared card roots with disclosure actions and weapon stats", () => {
  const ensureCatalogue = appSource.match(/function ensureDeckCatalogue\(\)[\s\S]*?function focusDeckSlot/)?.[0] || "";
  const libraryMarkup = ensureCatalogue.match(/entry\.innerHTML = `[\s\S]*?`;/)?.[0] || "";
  const slotMarkup = appSource.match(/function deckSlotMarkup\(index\)[\s\S]*?\n}/)?.[0] || "";
  const libraryState = appSource.match(/function updateLibraryState\(options = \{\}\)[\s\S]*?function setDeckSummaryValue/)?.[0] || "";

  assert.equal(Object.keys(gameData.cards).length, 29);
  assert.equal(Object.keys(gameData.weapons).length, 2);
  assert.match(appSource, /function isValidDeck\(deck\)/);
  assert.match(appSource, /Object\.hasOwn\(registry, key\)/);
  assert.match(appSource, /new Set\(deck\)\.size === DATA\.deckSize/);
  assert.match(ensureCatalogue, /if \(deckCatalogueReady\) return;/);
  assert.match(ensureCatalogue, /Object\.entries\(DATA\.weapons\)\.map/);
  assert.match(ensureCatalogue, /Object\.entries\(DATA\.cards\)\.forEach/);
  assert.equal((ensureCatalogue.match(/Array\.from\(\{ length: 3 \}/g) || []).length, 2, "opening and next-cycle rows must each create three stable slots");
  assert.equal((appSource.match(/\$\("#weapon-options"\)\.innerHTML/g) || []).length, 1, "weapon roots must only be created by the lazy catalogue initializer");
  assert.equal((appSource.match(/\$\("#builder-deck"\)\.innerHTML/g) || []).length, 1, "slot roots must only be created by the lazy catalogue initializer");
  assert.equal((appSource.match(/\$\("#card-library"\)\.innerHTML/g) || []).length, 1, "Armory roots must only be created by the lazy catalogue initializer");
  assert.match(appSource, /function headlineStats\(key, source = "card"\) \{[\s\S]*?source === "weapon" \? DATA\.weaponStats : DATA\.cardStats;[\s\S]*?\.slice\(0, 2\)/);
  assert.match(appSource, /function headlineStatsMarkup\(key, source = "card"\)/);
  assert.match(libraryMarkup, /cardFrame\(key, \{ variant: "armory" \}\)/);
  assert.match(libraryMarkup, /data-card-action="toggle"[^>]+aria-expanded="false"[^>]+aria-controls="armory-actions-\$\{key\}"/);
  assert.match(libraryMarkup, /<div id="armory-actions-\$\{key\}" class="card-action-popover library-card__actions"[^>]+hidden><button class="card-action-popover__info[^>]+data-card-action="info"[^>]*>INFO<\/button><button class="card-action-popover__primary[^>]+data-card-action="choose">CHOOSE POSITION<\/button>/, "collapsed Armory cards must disclose Info above Choose Position");
  assert.match(ensureCatalogue, /headlineStatsMarkup\(key, "weapon"\)/, "permanent weapons must show headline stats");
  assert.match(ensureCatalogue, /data-weapon-action="select"[\s\S]*?<\/button><button class="card-info-button weapon-option__info pixel-button"[^>]+data-weapon-action="info"[^>]*>INFO<\/button>/, "weapon select and text Info controls must be siblings");
  assert.match(slotMarkup, /<span class="deck-slot-order" aria-hidden="true">#\$\{index \+ 1\}<\/span>/, "draw-order badges must include a number sign");
  assert.match(slotMarkup, /class="deck-slot__select library-card__select"[^>]+aria-expanded="false"/, "Deck and Armory cards must share the same selectable anatomy");
  assert.match(slotMarkup, /class="card-action-popover deck-slot__actions"[^>]+hidden><button class="deck-slot__info card-action-popover__info[^>]*>INFO<\/button><button class="deck-slot__remove card-action-popover__remove[^>]*>REMOVE<\/button>/, "Deck cards must disclose Info above Remove");
  assert.match(ensureCatalogue, /data-armory-group="\$\{category\}"/);
  assert.match(ensureCatalogue, /entry\.dataset\.recommendedIndex = String\(recommendedIndex\)/);
  assert.match(appSource, /function updateDeckSlots\(focus = null\)/);
  assert.match(appSource, /slot\.dataset\.renderedKey !== \(key \|\| ""\)/);
  assert.match(appSource, /frameSlot\.innerHTML = key \? cardFrame\(key, \{ variant: "armory" \}\) : ""/);
  assert.match(appSource, /strengths\.innerHTML = key \? headlineStatsMarkup\(key\) : ""/);
  assert.match(appSource, /function updateLibraryState\(options = \{\}\)/);
  assert.match(libraryState, /actions\.hidden = !expanded/);
  assert.match(libraryState, /choose\.textContent = `IN DECK #\$\{position \+ 1\}`/);
  assert.match(libraryState, /choose\.textContent = "CHOOSE POSITION"/);
  assert.match(libraryState, /face\.setAttribute\("aria-expanded", String\(expanded\)\)/);
  assert.match(styles, /\.deck-screen \.library-card\.is-in-deck \.card-frame__seal \{ display: grid; \}/, "Armory members must retain the bottom-right selected check");
  assert.match(styles, /\.deck-screen \.library-card \.card-frame__seal,\s*\.deck-screen \.deck-slot \.card-frame__seal \{ display: none; \}/, "draw-order showcase cards must keep the Armory membership check hidden");
  assert.match(appSource, /categoryEntries\.forEach\(entry => grid\.append\(entry\)\)/, "sorting must reparent the same Armory roots");
  assert.match(appSource, /#card-library"\)\.addEventListener\("click"/);
  assert.match(appSource, /#builder-deck"\)\.addEventListener\("click"/);
  assert.match(appSource, /#weapon-options"\)\.addEventListener\("click"/);
  assert.match(appSource, /#deck-tabs"\)\.addEventListener\("click"/);
  assert.match(appSource, /#deck-filters"\)\.addEventListener\("click"/);
  assert.match(appSource, /#deck-search"\)\.addEventListener\("input"/);
  assert.match(appSource, /#deck-sort"\)\.addEventListener\("change"/);
  assert.doesNotMatch(appSource, /\$\$\("#card-library \[data-library-card\]"\)[\s\S]{0,160}addEventListener/);

  for (const hook of ["deck-tabs", "deck-editor", "weapon-options", "builder-deck", "deck-summary", "armory-toolbar", "deck-search", "clear-deck-search", "deck-filters", "deck-sort", "reset-deck-filters", "armory-no-results", "card-library"]) {
    assert.match(html, new RegExp(`id="${hook}"`));
  }
  assert.equal((html.match(/data-deck-tab="[0-4]"/g) || []).length, 5);
  assert.match(html, /id="deck-tabs"[^>]+role="tablist"/);
  assert.doesNotMatch(html, /Choose six unique cards/i);
  for (const sort of ["recommended", "cost-asc", "cost-desc", "name"]) assert.match(html, new RegExp(`option value="${sort}"`));
});

test("Deck mutations are atomic, undoable, and auto-save five authoritative loadouts", () => {
  const mutation = appSource.match(/function commitDeckMutation[\s\S]*?function selectDeckSlot/)?.[0] || "";
  const replacement = appSource.match(/function replaceDeckCard[\s\S]*?function removeSelectedDeckCard/)?.[0] || "";
  const armoryChoice = appSource.match(/function chooseArmoryCard[\s\S]*?function resetDeckBrowse/)?.[0] || "";
  const undo = appSource.match(/function undoDeckEdit[\s\S]*?function openDeckInfo/)?.[0] || "";
  const autoSave = appSource.match(/function autoSaveBuilderDeck[\s\S]*?function announceDeck/)?.[0] || "";
  const pendingPersistence = appSource.match(/function loadoutWithEditorState[\s\S]*?function announceDeck/)?.[0] || "";
  const profileLoad = appSource.match(/function defaultLoadout[\s\S]*?function saveProfile/)?.[0] || "";
  const deckSwitch = appSource.match(/function switchBuilderDeck[\s\S]*?function openDeckBuilder/)?.[0] || "";

  assert.match(mutation, /const before = \{ deck: \[\.\.\.builderDeck\], weapon: builderWeapon \}/);
  assert.match(mutation, /mutation\(\);[\s\S]*?setDeckUndo\(before, copy\);[\s\S]*?autoSaveBuilderDeck\(\);[\s\S]*?renderDeckBuilder/);
  assert.match(replacement, /commitDeckMutation\([\s\S]*?builderDeck\[index\] = key;/, "replacement must commit one indexed six-card mutation");
  assert.doesNotMatch(replacement, /builderDeck\.splice/, "atomic replacement must never pass through a five-card deck");
  assert.match(appSource, /const positions = full \? builderDeck\.map\([\s\S]*?label: `REPLACE #\$\{index \+ 1\}`[\s\S]*?Array\.from\([\s\S]*?label: `INSERT AS #\$\{index \+ 1\}`/, "Choose Position must expose every replacement or insertion position");
  assert.match(armoryChoice, /openReplacementSheet\(key, origin\?\.querySelector\?\.\('\[data-card-action="choose"\]'\) \|\| origin\)/, "Choose Position must preserve a focusable return target");
  assert.match(armoryChoice, /return builderDeck\.length === DATA\.deckSize \? replaceDeckCard\(index, key, origin\) : addDeckCard\(key, origin, index\)/);
  assert.match(appSource, /actions\.hidden = !selected \|\| !key/);
  assert.match(appSource, /action === "remove" && index === activeDeckSlot/);
  assert.doesNotMatch(appSource, /data-slot-action="(?:left|right|details|drag)"/);
  assert.doesNotMatch(appSource, /deck-slot__drag-handle/);
  assert.match(appSource, /function setDeckUndo\(snapshot, copy\)[\s\S]*?deckUndoState = \{ deck: \[\.\.\.snapshot\.deck\], weapon: snapshot\.weapon, copy \}/);
  assert.match(undo, /builderDeck = \[\.\.\.undo\.deck\];[\s\S]*?builderWeapon = undo\.weapon;[\s\S]*?autoSaveBuilderDeck\(\)/);
  assert.match(html, /id="deck-undo"[^>]+hidden[^>]*>[\s\S]*?id="undo-deck-edit"/);

  assert.match(appSource, /const MAX_SAVED_DECKS = 5/);
  assert.match(profileLoad, /return \{ version: 6,[\s\S]*?loadouts: Array\.from\(\{ length: MAX_SAVED_DECKS \}, defaultLoadout\), activeDeck: 0, selectedDeck: 0 \}/);
  assert.match(profileLoad, /const legacyLoadout = normalizedLoadout\(\{ deck: saved\.deck, weapon: saved\.weapon, deckDraft: saved\.deckDraft \}\)/);
  assert.match(profileLoad, /const loadouts = Array\.from\(\{ length: MAX_SAVED_DECKS \}/);
  assert.match(profileLoad, /const activeDeck = Number\.isInteger\(saved\.activeDeck\)[\s\S]*?< MAX_SAVED_DECKS \? saved\.activeDeck : 0/);
  assert.match(profileLoad, /const selectedDeck = Number\.isInteger\(saved\.selectedDeck\)[\s\S]*?< MAX_SAVED_DECKS \? saved\.selectedDeck : activeDeck/);
  assert.match(profileLoad, /const normalized = \{ \.\.\.base, \.\.\.savedProfile, version: 6, loadouts, activeDeck, selectedDeck \}/);
  assert.match(appSource, /function saveProfile\(candidate = profile\) \{[\s\S]*?return false;/);
  assert.match(pendingPersistence, /function loadoutWithEditorState\(saved, editor\)[\s\S]*?return complete \? \{ deck: \[\.\.\.editor\.deck\], weapon: editor\.weapon, deckDraft: null \} : \{ \.\.\.saved, deckDraft: \{ deck: \[\.\.\.editor\.deck\], weapon: editor\.weapon \} \}/, "complete editors become candidate battle loadouts while partial editors retain the last complete deck");
  assert.match(pendingPersistence, /function loadoutsWithPendingEdits\(\)[\s\S]*?profile\.loadouts\.map\(\(saved, index\) => \{[\s\S]*?volatileBuilderLoadouts\.get\(index\)[\s\S]*?loadoutWithEditorState\(saved, editor\) : saved/, "one successful transaction must include every editor previously kept in memory");
  assert.match(autoSave, /volatileBuilderLoadouts\.set\(builderDeckIndex, \{ deck: \[\.\.\.builderDeck\], weapon: builderWeapon \}\)/);
  assert.match(autoSave, /const candidate = \{ \.\.\.profile, version: 6, loadouts: loadoutsWithPendingEdits\(\), activeDeck: builderDeckIndex, selectedDeck: builderDeckIndex \}/);
  assert.match(autoSave, /const saved = saveProfile\(candidate\);\s*if \(!saved\)/);
  assert.match(autoSave, /if \(!saved\)[\s\S]*?AUTO-SAVE UNAVAILABLE - EDIT KEPT IN MEMORY/);
  assert.doesNotMatch(autoSave.match(/function autoSaveBuilderDeck[\s\S]*?if \(!saved\)/)?.[0] || "", /profile = candidate/, "a failed write must not promote even a complete editor to Battle authority");
  assert.match(autoSave, /if \(!saved\)[\s\S]*?return false;\s*}\s*profile = candidate;\s*volatileBuilderLoadouts\.clear\(\);\s*deckStorageError = false;\s*renderProfile\(\);\s*return true;/, "only a successful write may promote the candidate and clear all pending editors");
  assert.match(appSource, /function loadout\(\) \{[\s\S]*?const active = savedLoadout\(\);[\s\S]*?return \{ deck: \[\.\.\.active\.deck\], weapon: active\.weapon \};/);
  assert.match(deckSwitch, /const candidate = \{ \.\.\.profile, version: 6, loadouts: loadoutsWithPendingEdits\(\), activeDeck: index, selectedDeck: index \}/);
  assert.match(deckSwitch, /const saved = saveProfile\(candidate\);\s*if \(saved\) \{\s*profile = candidate;\s*volatileBuilderLoadouts\.clear\(\)/, "deck switching must also keep Battle authority transactional");
  assert.match(deckSwitch, /loadBuilderDeck\(index\);[\s\S]*?renderDeckBuilder/);
  assert.match(appSource, /if \(canceledSearch\) \{[\s\S]*?socket\.emit\("cancelSearch"\)/);
  for (const state of ["invalid", "saved", "error"]) assert.match(appSource, new RegExp(`"${state}"`));
  assert.doesNotMatch(`${html}\n${appSource}`, /id="(?:save-deck|restore-deck)"|function saveDeckLoadout|function restoreSavedDeck|SAVE LOADOUT/);
  assert.match(html, /id="deck-status" class="deck-status pixel-panel" data-state="saved"/);
  assert.match(html, /id="deck-announcer" class="sr-only" role="status" aria-live="polite"/);
  assert.equal((html.match(/role="tab" data-deck-tab="[0-4]"/g) || []).length, 5);
  assert.match(appSource, /#deck-tabs"\)\.addEventListener\("keydown"[\s\S]*?\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.match(html, /id="weapon-options"[^>]+role="radiogroup"/);
  assert.match(appSource, /role="radio"[^>]+data-weapon="\$\{key\}"[^>]+aria-checked="false"/);
  assert.match(appSource, /button\.setAttribute\("aria-checked", String\(selected\)\)/);
});

test("Deck dialogs and delegated reorder input preserve accessible modal and motion contracts", () => {
  const openInfo = appSource.match(/function openDeckInfo[\s\S]*?function closeDeckInfo/)?.[0] || "";
  const dialogDispatch = appSource.match(/function handleDialogKeydown[\s\S]*?\n}/)?.[0] || "";
  const pointerDown = appSource.match(/function handleDeckPointerDown[\s\S]*?function handleDeckPointerMove/)?.[0] || "";

  assert.equal((html.match(/id="deck-info-modal"/g) || []).length, 1);
  assert.equal((html.match(/id="deck-replace-modal"/g) || []).length, 1);
  assert.match(html, /id="deck-info-modal"[^>]+role="dialog"[^>]+aria-modal="true"[^>]+aria-labelledby="deck-info-name"[^>]+aria-describedby="deck-info-description deck-info-membership"/);
  assert.match(html, /id="deck-replace-modal"[^>]+role="dialog"[^>]+aria-modal="true"[^>]+aria-labelledby="deck-replace-title"[^>]+aria-describedby="deck-replace-copy"/);
  assert.ok(html.indexOf("</main>") < html.indexOf('id="deck-info-modal"'), "Deck dialogs must sit outside the inert app shell");
  assert.doesNotMatch(`${html}\n${appSource}`, /deck-details|deck-detail-toggle|renderDeckDetails/);
  assert.match(openInfo, /source === "weapon" \? DATA\.weaponStats\[key\] : DATA\.cardStats\[key\]/);
  assert.match(openInfo, /openLifecycleDialog\(\$\("#deck-info-modal"\), \$\("#deck-info-name"\), origin\)/);
  assert.match(appSource, /openLifecycleDialog\(\$\("#deck-replace-modal"\), \$\("#deck-replace-title"\), origin\)/);
  assert.match(appSource, /function openLifecycleDialog[\s\S]*?setBackgroundInert\(true\)[\s\S]*?classList\.remove\("hidden"\)[\s\S]*?focus\(\{ preventScroll: true \}\)/);
  assert.match(dialogDispatch, /activeDialog === \$\("#deck-info-modal"\)\) closeDeckInfo\(\)/);
  assert.match(dialogDispatch, /activeDialog === \$\("#deck-replace-modal"\)\) closeReplacementSheet\(\)/);

  for (const handler of ["beginKeyboardDeckDrag", "handleDeckReorderKey", "handleDeckPointerDown", "handleDeckPointerMove", "finishDeckPointerDrag", "cancelPointerDeckDrag"]) {
    assert.match(appSource, new RegExp(`function ${handler}\\(`));
  }
  assert.match(appSource, /event\.pointerType === "touch"[\s\S]*?setTimeout\(\(\) => beginPointerDeckDrag\(state\), 220\)/);
  assert.match(appSource, /distance >= 6\) beginPointerDeckDrag\(state\)/);
  assert.match(appSource, /setPointerCapture\?\.\(state\.pointerId\)/);
  assert.match(pointerDown, /event\.target\.closest\('\.deck-slot__select'\)/, "pointer and touch reorder must begin from the card itself");
  assert.doesNotMatch(pointerDown, /drag-handle|data-slot-action="drag"/, "touch reorder must not depend on a removed drag control");
  for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) assert.match(appSource, new RegExp(`#builder-deck"\\)\\.addEventListener\\("${eventName}"`));
  assert.match(appSource, /#builder-deck"\)\.addEventListener\("keydown", handleDeckReorderKey\)/);
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape"]) assert.match(appSource, new RegExp(`"${key}"`));

  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.deck-screen \*[\s\S]*?animation: none !important;[\s\S]*?transition: none !important;/);
  assert.match(styles, /\.deck-filters button \{[^}]*min-height: 48px/);
  assert.match(styles, /\.deck-tabs button \{[^}]*min-height: 54px/);
  assert.match(styles, /\.deck-slot__select \{[^}]*touch-action: pan-y pinch-zoom/);
  assert.match(styles, /\.deck-slot__select \{[^}]*-webkit-touch-callout: none;[^}]*user-select: none/);
  assert.match(styles, /--builder-card-height: 258px/);
  assert.match(styles, /\.deck-slot \{[^}]*height: var\(--builder-card-height\);[^}]*min-height: var\(--builder-card-height\)/);
  assert.match(styles, /\.deck-screen \.library-card \{[^}]*height: var\(--builder-card-height\);[^}]*min-height: var\(--builder-card-height\)/);
  assert.match(styles, /\.library-card__select,\s*\.deck-slot__select \{[^}]*height: var\(--builder-card-height\);[^}]*grid-template-rows: 166px minmax\(62px,1fr\)/, "Deck and Armory cards must share one uniform collapsed height and anatomy");
  assert.match(styles, /\.card-action-popover \{[^}]*position: absolute;[^}]*z-index: 12;[^}]*top: calc\(100% \+ 4px\)/, "expanded actions may overlap the card below without changing the card root height");
  assert.match(styles, /\.card-action-popover button \{[^}]*min-height: 48px/);
  assert.match(styles, /\.card-action-popover__info \{[^}]*background: var\(--siege-gold\)/);
  assert.match(styles, /\.card-action-popover__remove \{[^}]*background: var\(--siege-danger\)/);
  assert.match(styles, /\.deck-slot-order \{[^}]*content|\.deck-slot-order \{[^}]*min-width: 30px/);
  assert.match(styles, /\.weapon-option__strengths \{[^}]*min-height: 74px;[^}]*grid-row: 2/);
  assert.doesNotMatch(`${html}\n${styles}`, /save-loadout|deck-save-rail|library-card__membership|library-card__action/);
  assert.doesNotMatch(styles, /\.library-card\.is-replacement-candidate::after|content: "CHOOSE A POSITION"/);
  assert.match(styles, /\.card-info-button \{[^}]*min-width: 48px;[^}]*min-height: 48px;[^}]*background: var\(--siege-gold\)/);
  assert.doesNotMatch(`${html}\n${appSource}\n${styles}`, /<span aria-hidden="true">i<\/span>|\.card-info-button > span/);
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
