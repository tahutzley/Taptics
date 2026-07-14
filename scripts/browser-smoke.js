"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");
const { io: connectClient } = require("socket.io-client");
const { server, io, ticker, phaseAt } = require("../server.js");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS = path.join(ROOT, "artifacts", "browser");
const EDGE_PATHS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
];
const RELEASE_VIEWPORTS = [
  [320, 700],
  [390, 600],
  [390, 844],
  [720, 900],
  [1440, 900]
];
const PHONE_DESKTOP_VIEWPORTS = [[390, 844], [1440, 900]];

async function closeServer() {
  clearInterval(ticker);
  await new Promise(resolve => io.close(() => server.close(resolve)));
}

function waitForSocket(socket, event, predicate = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for socket event ${event}`));
    }, timeout);
    function onEvent(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    }
    socket.on(event, onEvent);
  });
}

async function run() {
  const executablePath = EDGE_PATHS.find(candidate => fs.existsSync(candidate));
  assert.ok(executablePath, "Microsoft Edge is required for the browser smoke test");
  fs.rmSync(ARTIFACTS, { recursive: true, force: true });
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({ reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [];
  let renderBenchmark = null;
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  page.on("requestfailed", request => errors.push(`network: ${request.url()} ${request.failure()?.errorText || "failed"}`));
  page.on("response", response => { if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`); });

  try {
    for (const [width, height] of RELEASE_VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
      const layout = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        cardFrames: document.querySelectorAll('[data-card-frame="lobby"]').length,
        illustratedCards: [...document.querySelectorAll('[data-card-frame="lobby"] .card-frame__art')].every(element => getComputedStyle(element).backgroundImage.includes("cards-atlas.png")),
        navVisible: getComputedStyle(document.querySelector("#main-menu-tabs")).display !== "none",
        shellWidth: document.querySelector(".app-shell").getBoundingClientRect().width,
        actionCount: document.querySelectorAll("#lobby button:not([disabled]), #main-menu-tabs button:not([disabled])").length,
        clippedActions: [...document.querySelectorAll("#lobby button:not([disabled]), #main-menu-tabs button:not([disabled])")].filter(element => { const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }).length,
        smallestAction: Math.min(...[...document.querySelectorAll("#lobby button:not([disabled]), #main-menu-tabs button:not([disabled])")].map(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height)))
      }));
      assert.equal(layout.horizontalOverflow, false, `${width}px lobby must not clip horizontally`);
      assert.equal(layout.cardFrames, 6, "active loadout must render six shared card frames");
      assert.equal(layout.illustratedCards, true, "active loadout must render catalogue portraits instead of initials alone");
      assert.equal(layout.navVisible, true, "persistent navigation must remain visible");
      assert.ok(layout.shellWidth <= 720, "desktop shell must respect its 720px cap");
      assert.ok(layout.actionCount > 0, "lobby must retain reachable actions");
      assert.equal(layout.clippedActions, 0, `${width}px lobby actions must remain in the viewport`);
      assert.ok(layout.smallestAction >= 48, "lobby actions must retain 48px touch targets");
      await page.screenshot({ path: path.join(ARTIFACTS, `phase-02-lobby-${width}x${height}.png`) });
    }

    assert.equal(await page.locator("#online-button").getAttribute("data-state"), "idle", "connected lobby must expose the idle queue state");
    const initialLoading = await auditInitialLoading(page);
    assert.deepEqual(initialLoading.atlases, ["cards-atlas.png", "ui-atlas.png"], "the lobby must defer battle, effect, weapon, and structure atlases");
    assert.deepEqual(initialLoading.remoteResources, [], "the initial screen must not depend on remote runtime resources");
    const runtimeAssets = await auditRuntimeAssets(page);
    assert.deepEqual(runtimeAssets.invalidAtlases, [], "every generated atlas must fetch, decode, and match its manifest dimensions");
    assert.deepEqual(runtimeAssets.invalidClasses, [], "all 29 cards, two weapons, six structures, and ten effect families must resolve to their generated atlases");
    assert.deepEqual(runtimeAssets.remoteResources, [], "asset audit must remain same-origin and offline-capable");
    assert.deepEqual(runtimeAssets.coverage, { cards: 29, weapons: 2, structures: 6, families: 10, sprites: 69 });
    assert.ok(runtimeAssets.criticalBytes < 300 * 1024, "critical raster transfer must remain below the 300KB budget");
    assert.ok(runtimeAssets.optionalBytes < 500 * 1024, "optional catalogue transfer must remain below the 500KB budget");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    const catalogue = await page.evaluate(() => ({ deck: [...window.GAME_DATA.defaultDeck], cards: Object.keys(window.GAME_DATA.cards), weapon: Object.keys(window.GAME_DATA.weapons) }));
    const migrationBase = { version: 4, duels: 7, wins: 3, run: 2, bestRun: 4, challenge: 1, challengeComplete: true, recent: ["win"], deck: [...catalogue.deck], weapon: "volley", deckDraft: null };
    const migrationCases = [
      { name: "duplicate", value: { ...migrationBase, deck: [...catalogue.deck.slice(0, 5), catalogue.deck[0]] }, expectedDeck: catalogue.deck, expectedWeapon: "volley" },
      { name: "unknown", value: { ...migrationBase, deck: [...catalogue.deck.slice(0, 5), "missingCard"] }, expectedDeck: catalogue.deck, expectedWeapon: "volley" },
      { name: "short", value: { ...migrationBase, deck: catalogue.deck.slice(0, 5) }, expectedDeck: catalogue.deck, expectedWeapon: "volley" },
      { name: "long", value: { ...migrationBase, deck: [...catalogue.deck, catalogue.cards.find(key => !catalogue.deck.includes(key))] }, expectedDeck: catalogue.deck, expectedWeapon: "volley" },
      { name: "non-array", value: { ...migrationBase, deck: "not-an-array" }, expectedDeck: catalogue.deck, expectedWeapon: "volley" },
      { name: "inherited card", value: { ...migrationBase, deck: [...catalogue.deck.slice(0, 5), "toString"] }, expectedDeck: catalogue.deck, expectedWeapon: "volley" },
      { name: "inherited weapon", value: { ...migrationBase, weapon: "toString" }, expectedDeck: catalogue.deck, expectedWeapon: "cannon" },
      { name: "valid order", value: { ...migrationBase, deck: [...catalogue.deck].reverse() }, expectedDeck: [...catalogue.deck].reverse(), expectedWeapon: "volley" },
      { name: "duplicate draft", value: { ...migrationBase, deckDraft: { deck: [catalogue.cards[0], catalogue.cards[0]], weapon: "cannon" } }, expectedDeck: catalogue.deck, expectedWeapon: "volley", expectedDraft: null },
      { name: "unknown draft", value: { ...migrationBase, deckDraft: { deck: [catalogue.cards[0], "missingCard"], weapon: "cannon" } }, expectedDeck: catalogue.deck, expectedWeapon: "volley", expectedDraft: null },
      { name: "oversized draft", value: { ...migrationBase, deckDraft: { deck: catalogue.cards.slice(0, 7), weapon: "cannon" } }, expectedDeck: catalogue.deck, expectedWeapon: "volley", expectedDraft: null },
      { name: "inherited draft weapon", value: { ...migrationBase, deckDraft: { deck: catalogue.cards.slice(0, 2), weapon: "toString" } }, expectedDeck: catalogue.deck, expectedWeapon: "volley", expectedDraft: null },
      { name: "valid partial draft", value: { ...migrationBase, deckDraft: { deck: catalogue.cards.slice(0, 2), weapon: "cannon" } }, expectedDeck: catalogue.deck, expectedWeapon: "volley", expectedDraft: { deck: catalogue.cards.slice(0, 2), weapon: "cannon" } },
      { name: "saved-equivalent draft", value: { ...migrationBase, deckDraft: { deck: [...catalogue.deck], weapon: "volley" } }, expectedDeck: catalogue.deck, expectedWeapon: "volley", expectedDraft: null },
      { name: "malformed JSON", raw: "{broken", expectedDeck: catalogue.deck, expectedWeapon: "cannon", resetStats: true }
    ];
    for (const fixture of migrationCases) {
      await page.evaluate(({ raw, value }) => localStorage.setItem("taptics-prototype-v3", raw ?? JSON.stringify(value)), fixture);
      await page.reload({ waitUntil: "networkidle" });
      const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem("taptics-prototype-v3")));
      assert.equal(migrated.version, 6, `${fixture.name} profile version`);
      assert.equal(migrated.loadouts.length, 5, `${fixture.name} must normalize exactly five loadout records`);
      assert.deepEqual(migrated.loadouts[0].deck, fixture.expectedDeck, `${fixture.name} deck migration`);
      assert.equal(migrated.loadouts[0].weapon, fixture.expectedWeapon, `${fixture.name} weapon migration`);
      assert.deepEqual(migrated.loadouts.slice(1).map(loadout => loadout.deck), Array.from({ length: 4 }, () => catalogue.deck), `${fixture.name} must seed the other four deck slots safely`);
      if (Object.hasOwn(fixture, "expectedDraft")) assert.deepEqual(migrated.loadouts[0].deckDraft, fixture.expectedDraft, `${fixture.name} draft migration`);
      assert.deepEqual([migrated.activeDeck, migrated.selectedDeck], [0, 0], `${fixture.name} must select the migrated first deck`);
      assert.equal(Object.hasOwn(migrated, "deck") || Object.hasOwn(migrated, "weapon") || Object.hasOwn(migrated, "deckDraft"), false, `${fixture.name} must remove legacy top-level loadout fields`);
      if (!fixture.resetStats) assert.deepEqual([migrated.duels, migrated.wins, migrated.challenge], [7, 3, 1], `${fixture.name} must preserve progression`);
      else assert.deepEqual([migrated.duels, migrated.wins, migrated.challenge], [0, 0, 0], `${fixture.name} must reset malformed progression`);
    }
    await page.evaluate(() => localStorage.removeItem("taptics-prototype-v3"));
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => socket.disconnect());
    await page.waitForFunction(() => document.querySelector("#online-button")?.dataset.state === "offline");
    assert.equal(await page.locator("#online-button").isDisabled(), true, "offline matchmaking must be unavailable");
    assert.equal(await page.locator("#solo-button").isDisabled(), true, "offline CPU entry must be unavailable because the server remains authoritative");
    for (const [width, height] of PHONE_DESKTOP_VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: path.join(ARTIFACTS, `phase-07-offline-${width}x${height}.png`) });
    }
    await page.evaluate(() => socket.connect());
    await page.waitForFunction(() => document.querySelector("#online-button")?.dataset.state === "idle");
    assert.equal(await page.locator("#toast").isHidden(), true, "reconnection must clear the stale offline toast");
    await page.setViewportSize({ width: 390, height: 844 });
    await assertFocusRing(page, "#solo-button", "lobby CPU action");
    assert.equal(await page.locator("#sound-toggle").getAttribute("aria-label"), "Sound", "sound control must keep a stable accessible name");
    const lockedChallenges = page.locator('#main-menu-tabs button[aria-disabled="true"]');
    assert.equal(await lockedChallenges.isDisabled(), true, "unfinished Challenges navigation must remain disabled");
    assert.match(await lockedChallenges.textContent(), /CHALLENGES\s*LOCKED/, "disabled Challenges navigation must remain visibly labeled as locked");
    await page.locator("#sound-toggle").click();
    assert.equal(await page.locator("#sound-toggle").getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator("#sound-toggle").getAttribute("aria-label"), "Sound", "sound toggles must not change their accessible name");
    assert.equal(await page.locator("#sound-toggle b").textContent(), "SOUND OFF", "sound state must remain visible separately from its stable name");
    assert.equal(await page.locator("#card-library [data-library-card]").count(), 0, "the 29-card Deck DOM must be created lazily");
    await page.locator("#open-deck").click();
    await assertVisible(page, "#deck-screen");
    assert.equal(await page.locator("#builder-deck [data-deck-slot]").count(), 6, "Deck must keep six stable slot roots");
    assert.equal(await page.locator("#card-library [data-library-card]").count(), 29, "Deck must expose all 29 catalogue cards");
    assert.equal(await page.locator("#weapon-options [data-weapon-root]").count(), 2, "Deck must expose both stable illustrated weapon roots");
    assert.equal(await page.locator("#deck-tabs [data-deck-tab]").count(), 5, "Deck must expose five switchable saved loadouts");
    assert.equal(await page.locator('#deck-tabs [role="tab"][aria-selected="true"]').count(), 1, "Deck tabs must expose one selected editor");
    assert.equal(await page.locator("#deck-info-modal").count(), 1, "Deck Info must remain bounded to one reusable dialog");
    assert.equal(await page.locator("#deck-replace-modal").count(), 1, "collection-first replacement must remain bounded to one reusable sheet");
    await assertFocusRing(page, '[data-weapon="cannon"]', "selected Deck weapon");
    assert.equal(await page.locator('[data-slot-action="left"], [data-slot-action="right"]').count(), 0, "retired reorder arrows must stay absent");
    assert.equal(await page.locator('[data-slot-action="drag"], .deck-slot__drag-handle').count(), 0, "Deck reorder must use the card surface without exposing a separate drag control");
    assert.equal(await page.locator('#builder-deck [data-slot-action="remove"]:visible').count(), 0, "Remove must remain contextual until a deck position is selected");
    assert.equal(await page.locator('#card-library [data-card-action="info"]:visible, #card-library [data-card-action="choose"]:visible, #card-library [data-card-action="locate"]:visible').count(), 0, "Armory actions must stay collapsed until a card is selected");
    assert.equal(await page.locator('#weapon-options [role="radio"][aria-checked="true"]').count(), 1, "weapons must expose one checked radio choice");
    assert.equal(await page.locator("#save-deck, #restore-deck, #deck-save-rail").count(), 0, "Deck changes must auto-save without Save or Restore controls");
    assert.deepEqual(await page.locator("#builder-deck .deck-slot-order").allTextContents(), ["#1", "#2", "#3", "#4", "#5", "#6"], "draw order labels must include a # prefix");
    const weaponStats = await page.locator("#weapon-options .weapon-option__strengths b").allTextContents();
    assert.ok(weaponStats.length >= 4 && weaponStats.every(Boolean), "both permanent weapons must expose basic stats");
    await rememberDeckRoots(page);

    for (const [width, height] of RELEASE_VIEWPORTS) {
      const expectedColumns = width < 480 ? 2 : width < 800 ? 3 : 4;
      const deckLayout = await auditDeckLayout(page, width, height, expectedColumns, path.join(ARTIFACTS, `phase-05-deck-${width}x${height}.png`));
      const illustrated = await page.evaluate(() => ({
        cards: [...document.querySelectorAll("#card-library .card-frame__art")].every(element => getComputedStyle(element).backgroundImage.includes("cards-atlas.png")),
        weapons: [...document.querySelectorAll("#weapon-options .card-frame__art")].every(element => getComputedStyle(element).backgroundImage.includes("weapons-atlas.png"))
      }));
      assert.deepEqual(illustrated, { cards: true, weapons: true }, "Deck cards and weapons must use catalogue portraits");
      assert.equal(deckLayout.columns, expectedColumns);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await exerciseDeckInfoCoverage(page);
    await assertDeckRootsStable(page, "Info inspection must not replace stable Deck roots");
    await exerciseArmoryMotion(page);
    await assertDeckRootsStable(page, "animated and rapid Armory filtering must preserve stable catalogue roots");

    assert.deepEqual(await page.evaluate(() => Object.fromEntries(["attack", "crew", "magic"].map(category => [category, document.querySelector(`[data-armory-group-count="${category}"]`).textContent]))), { attack: "- 6", crew: "- 14", magic: "- 9" }, "All must expose labeled category group counts");
    await page.locator("#deck-search").focus();
    await page.locator("#deck-search").fill("ward");
    await page.waitForFunction(() => document.querySelectorAll("#card-library [data-library-card]:not([hidden])").length === 1);
    assert.equal(await page.evaluate(() => document.activeElement?.id), "deck-search", "search updates must preserve keyboard focus");
    assert.equal(await page.locator("#clear-deck-search").isVisible(), true, "search text must expose a Clear action");
    await page.locator("#clear-deck-search").click();
    await page.waitForFunction(() => document.querySelectorAll("#card-library [data-library-card]:not([hidden])").length === 29);
    assert.equal(await page.evaluate(() => document.activeElement?.id), "deck-search", "clearing search must return focus to the search field");
    for (const [filter, expected, activation] of [["attack", 6, "Enter"], ["crew", 14, " "], ["magic", 9, "Enter"], ["all", 29, " "]]) {
      await page.locator(`[data-deck-filter="${filter}"]`).press(activation);
      await page.waitForFunction(count => document.querySelectorAll("#card-library [data-library-card]:not([hidden])").length === count, expected);
      assert.equal(await page.locator(`[data-deck-filter="${filter}"]`).getAttribute("aria-pressed"), "true");
    }
    for (const sort of ["cost-asc", "cost-desc", "name", "recommended"]) {
      await page.locator("#deck-sort").focus();
      await page.locator("#deck-sort").selectOption(sort);
      const sortAudit = await page.evaluate(mode => {
        const result = {};
        for (const category of ["attack", "crew", "magic"]) {
          const actual = [...document.querySelectorAll(`[data-armory-grid="${category}"] [data-library-card]`)].map(entry => entry.dataset.libraryCard);
          const expected = Object.entries(window.GAME_DATA.cards).filter(([, card]) => card.category === category).map(([key, card], recommendedIndex) => ({ key, card, recommendedIndex }));
          expected.sort((left, right) => mode === "cost-asc" ? left.card.cost - right.card.cost || left.card.name.localeCompare(right.card.name) : mode === "cost-desc" ? right.card.cost - left.card.cost || left.card.name.localeCompare(right.card.name) : mode === "name" ? left.card.name.localeCompare(right.card.name) : Object.keys(window.GAME_DATA.cards).indexOf(left.key) - Object.keys(window.GAME_DATA.cards).indexOf(right.key));
          result[category] = { actual, expected: expected.map(entry => entry.key) };
        }
        return result;
      }, sort);
      assert.ok(Object.values(sortAudit).every(entry => JSON.stringify(entry.actual) === JSON.stringify(entry.expected)), `${sort} must produce the expected stable Armory order`);
      assert.equal(await page.evaluate(() => document.activeElement?.id), "deck-sort", "sorting must preserve select focus");
      await assertDeckRootsStable(page, `${sort} must reparent rather than rebuild Armory roots`);
    }
    await page.locator("#deck-search").fill("no such siege card");
    await page.waitForFunction(() => !document.querySelector("#armory-no-results").classList.contains("hidden"));
    assert.equal(await page.locator("#card-library [data-library-card]:visible").count(), 0, "no-results search must hide every stable card root");
    assert.ok(await page.locator("#clear-empty-armory").evaluate(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height)) >= 48, "no-results Clear Filters must remain a 48px action");
    await page.locator("#clear-empty-armory").click();
    await page.waitForFunction(() => document.querySelectorAll("#card-library [data-library-card]:not([hidden])").length === 29 && document.querySelector("#deck-sort").value === "recommended");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "deck-search", "clearing no-results filters must return focus to the visible search control");
    await assertDeckRootsStable(page, "search, filtering, sorting, and reset must preserve every Deck root");
    const scaledContext = await browser.newContext({
      viewport: { width: 320, height: 700 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
      hasTouch: true
    });
    const scaledPage = await scaledContext.newPage();
    scaledPage.on("console", message => { if (message.type() === "error") errors.push(`scaled console: ${message.text()}`); });
    scaledPage.on("pageerror", error => errors.push(`scaled page: ${error.message}`));
    scaledPage.on("requestfailed", request => errors.push(`scaled network: ${request.url()} ${request.failure()?.errorText || "failed"}`));
    scaledPage.on("response", response => { if (response.status() >= 400) errors.push(`scaled http ${response.status()}: ${response.url()}`); });
    await scaledPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    const scaledLobby = await scaledPage.evaluate(() => ({
      deviceScaleFactor: devicePixelRatio,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      smallestCssAction: Math.min(...[...document.querySelectorAll("#lobby button:not([disabled]), #main-menu-tabs button:not([disabled])")].map(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height)))
    }));
    assert.equal(scaledLobby.deviceScaleFactor, 2, "effective-narrow fixture must render at 2x device scale");
    assert.equal(scaledLobby.horizontalOverflow, false, "320px effective-width lobby must not clip at 2x scale");
    assert.ok(scaledLobby.smallestCssAction >= 48 && scaledLobby.smallestCssAction * scaledLobby.deviceScaleFactor >= 96, "2x lobby actions must retain 48px CSS and 96px physical targets");
    await scaledPage.screenshot({ path: path.join(ARTIFACTS, "phase-07-lobby-320x700-2x-reduced.png") });
    await scaledPage.locator("#open-deck").click();
    await auditDeckLayout(scaledPage, 320, 700, 2);
    assert.equal(await scaledPage.evaluate(() => devicePixelRatio), 2, "scaled Deck fixture must render at 2x device scale");
    const scaledInitial = await deckOrder(scaledPage);
    const scaledReplacement = await scaledPage.evaluate(deck => Object.keys(window.GAME_DATA.cards).find(key => !deck.includes(key)), scaledInitial);
    await beginReplacementMotionAudit(scaledPage, "__reducedReplacementMotion");
    await scaledPage.locator(`[data-library-card="${scaledReplacement}"] [data-card-action="toggle"]`).press("Enter");
    await scaledPage.locator(`[data-library-card="${scaledReplacement}"] [data-card-action="choose"]`).press("Enter");
    await assertVisible(scaledPage, "#deck-replace-modal");
    await scaledPage.locator('[data-replace-slot="0"]').press("Enter");
    const scaledReplaced = [...scaledInitial];
    scaledReplaced[0] = scaledReplacement;
    await waitForDeckOrder(scaledPage, scaledReplaced);
    await scaledPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const reducedReplacementMotion = await endReplacementMotionAudit(scaledPage, "__reducedReplacementMotion");
    assert.deepEqual(reducedReplacementMotion, { peakIncoming: 0, peakOutgoing: 0, simultaneous: false, ariaHidden: true, liveIncoming: 0, liveOutgoing: 0 }, "reduced motion must create neither incoming nor outgoing replacement clones");
    const scaledMoveKey = scaledReplaced[1];
    await scaledPage.locator(`[data-card-key="${scaledMoveKey}"][data-slot-action="select"]`).focus();
    await scaledPage.keyboard.press("Space");
    await scaledPage.keyboard.press("ArrowRight");
    await scaledPage.keyboard.press("Space");
    const scaledFinal = [...scaledReplaced];
    scaledFinal.splice(2, 0, scaledFinal.splice(1, 1)[0]);
    await waitForDeckOrder(scaledPage, scaledFinal);
    await scaledPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await scaledPage.locator(`[data-library-card="${scaledFinal[0]}"] [data-card-action="toggle"]`).press("Enter");
    await scaledPage.locator(`[data-library-card="${scaledFinal[0]}"] [data-card-action="info"]`).press("Enter");
    await scaledPage.locator("#close-deck-info").click();
    await scaledPage.locator("#deck-search").fill("ward");
    await scaledPage.locator("#clear-deck-search").click();
    await touchScrollDeckFromCard(scaledContext, scaledPage, 3);
    await touchDragDeckCard(scaledContext, scaledPage, 0, 1, "cancel");
    assert.deepEqual(await deckOrder(scaledPage), scaledFinal, "touch pointercancel must preserve exact order");
    await touchDragDeckCard(scaledContext, scaledPage, 0, 1);
    const touchOrder = [...scaledFinal];
    touchOrder.splice(1, 0, touchOrder.splice(0, 1)[0]);
    await waitForDeckOrder(scaledPage, touchOrder);
    await scaledPage.locator("#undo-deck-edit").click();
    await waitForDeckOrder(scaledPage, scaledFinal);
    await assertNoDeckTransients(scaledPage, "reduced-motion Deck actions must leave no clones, animations, or inline transforms");
    const reducedDeckState = await scaledPage.evaluate(() => {
      const visible = [...document.querySelectorAll("#deck-screen *")].filter(element => element.getClientRects().length);
      return {
        status: document.querySelector("#deck-status").dataset.state,
        animations: visible.filter(element => getComputedStyle(element).animationName !== "none").length,
        clones: document.querySelectorAll(".deck-travel-clone, .deck-drag-avatar, .armory-filter-clone").length,
        transforms: [...document.querySelectorAll("#builder-deck .deck-slot__select, #card-library [data-library-card]")].filter(element => element.style.transform).length,
        order: [...document.querySelectorAll("[data-deck-slot]")].map(slot => slot.dataset.cardKey).filter(Boolean)
      };
    });
    assert.equal(reducedDeckState.status, "saved", "reduced-motion Deck mutations must auto-save normally");
    assert.deepEqual([reducedDeckState.animations, reducedDeckState.clones, reducedDeckState.transforms], [0, 0, 0], "reduced-motion Deck must update without animated or spatial residue");
    assert.deepEqual(reducedDeckState.order, scaledFinal, "reduced motion must preserve the same replacement and reorder final state");
    await scaledPage.screenshot({ path: path.join(ARTIFACTS, "phase-05-deck-320x700-2x.png") });
    await scaledPage.locator("#battle-tab").click();
    await scaledPage.locator("#solo-button").click();
    await assertVisible(scaledPage, "#game");
    await assertFocusRing(scaledPage, "#arena", "2x reduced-motion battlefield");
    const scaledBattle = await scaledPage.evaluate(() => {
      const enemyWeapon = document.querySelector("#enemy-weapon");
      enemyWeapon.classList.add("siphon-tap");
      const siphonAnimation = getComputedStyle(enemyWeapon, "::before").animationName;
      enemyWeapon.classList.remove("siphon-tap");
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        siphonAnimation,
        smallestCssAction: Math.min(...[...document.querySelectorAll("#game button:not([disabled])")].filter(element => element.getClientRects().length).map(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height)))
      };
    });
    assert.equal(scaledBattle.horizontalOverflow, false, "320px effective-width battle must not clip at 2x scale");
    assert.equal(scaledBattle.siphonAnimation, "none", "reduced motion must suppress the siphon pulse");
    assert.ok(scaledBattle.smallestCssAction >= 48, "2x battle actions must retain 48px CSS targets");
    await scaledPage.screenshot({ path: path.join(ARTIFACTS, "phase-07-battle-320x700-2x-reduced.png") });
    await scaledPage.locator("#leave-battle").click();
    await assertVisible(scaledPage, "#leave-modal");
    assert.equal(await scaledPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, "2x leave dialog must not clip");
    await scaledPage.screenshot({ path: path.join(ARTIFACTS, "phase-07-leave-320x700-2x-reduced.png") });
    await scaledPage.locator("#cancel-leave").click();
    const scaledResult = await renderSyntheticResult(scaledPage, { winner: 0, reason: "core", ownCore: 0, enemyCore: 0 });
    assert.equal(scaledResult.particles, 0, "2x reduced-motion result must omit decorative particles");
    await assertVisible(scaledPage, "#result-modal");
    await assertFocusRing(scaledPage, "#result-title", "2x reduced-motion result heading");
    assert.equal(await scaledPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, "2x result must not clip");
    await scaledPage.screenshot({ path: path.join(ARTIFACTS, "phase-07-result-320x700-2x-reduced.png") });
    await scaledPage.locator("#lobby-button").click();
    await assertVisible(scaledPage, "#lobby");
    await scaledContext.close();

    await exercisePartialDeckPacking(browser, port, errors);
    await page.setViewportSize({ width: 390, height: 844 });
    const initialSavedDeck = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("taptics-prototype-v3"));
      return saved.loadouts[saved.activeDeck].deck;
    });
    const selectedKey = initialSavedDeck[2];
    const replacementKey = catalogue.cards.find(key => !initialSavedDeck.includes(key));
    await page.evaluate(() => {
      const nativeSetItem = Storage.prototype.setItem;
      window.__deckAtomic = { states: [], writes: [], nativeSetItem };
      window.__deckAtomic.observer = new MutationObserver(() => window.__deckAtomic.states.push(document.querySelector("#deck-status").dataset.state));
      window.__deckAtomic.observer.observe(document.querySelector("#deck-status"), { attributes: true, attributeFilter: ["data-state"] });
      Storage.prototype.setItem = function loggedSetItem(key, value) {
        if (key === "taptics-prototype-v3") {
          const saved = JSON.parse(value);
          const loadout = saved.loadouts[saved.activeDeck];
          window.__deckAtomic.writes.push({ activeDeck: saved.activeDeck, selectedDeck: saved.selectedDeck, deckLength: loadout.deck.length, draftLength: loadout.deckDraft?.deck?.length ?? null });
        }
        return nativeSetItem.call(this, key, value);
      };
    });
    await page.locator(`[data-deck-slot="2"] [data-slot-action="select"]`).click();
    assert.equal(await page.locator('#builder-deck [data-slot-action="remove"]:visible').count(), 1, "selecting a slot must reveal one contextual Remove control");
    assert.equal(await page.locator('#builder-deck [data-slot-action="info"]:visible').count(), 1, "selecting a slot must reveal one contextual Info control");
    assert.equal(await page.locator('[data-deck-slot="2"] [data-slot-action="info"]').textContent(), "INFO", "Deck Info must use a readable text label");
    assert.equal(await page.locator('[data-slot-action="drag"], .deck-slot__drag-handle').count(), 0, "contextual Remove must not reintroduce the retired drag control");
    assert.ok(await page.locator(`[data-deck-slot="2"] [data-slot-action="remove"]`).evaluate(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height)) >= 48, "contextual Remove must remain a 48px action");
    assert.equal(await page.locator('[data-deck-slot="2"] .deck-slot__actions').evaluate(element => {
      const [info, remove] = element.querySelectorAll("button");
      return info.getBoundingClientRect().bottom <= remove.getBoundingClientRect().top + 1;
    }), true, "Deck Info must appear above Remove in the expanded overlay");
    await page.locator('[data-deck-slot="2"] [data-slot-action="remove"]').focus();
    await page.keyboard.press("Escape");
    await page.locator('[data-deck-slot="2"] [data-slot-action="remove"]').waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-deck-slot="2"] [data-slot-action="select"]')), true, "Escape must return focus to the collapsed Deck card face");

    await page.locator(`[data-library-card="${replacementKey}"] [data-card-action="toggle"]`).click();
    const replacementControl = page.locator(`[data-library-card="${replacementKey}"] [data-card-action="choose"]`);
    assert.equal(await page.locator(`[data-library-card="${replacementKey}"] [data-card-action="info"]`).textContent(), "INFO", "Armory Info must use a readable text label");
    assert.equal(await page.locator(`[data-library-card="${replacementKey}"] .library-card__actions`).evaluate(element => {
      const [info, choose] = element.querySelectorAll("button");
      return info.getBoundingClientRect().bottom <= choose.getBoundingClientRect().top + 1;
    }), true, "Armory Info must appear above Choose Position in the expanded overlay");
    await replacementControl.scrollIntoViewIfNeeded();
    await replacementControl.click();
    await assertVisible(page, "#deck-replace-modal");
    assert.deepEqual(await page.locator("#deck-replacement-options .replacement-slot__position").allTextContents(), ["REPLACE #1", "REPLACE #2", "REPLACE #3", "REPLACE #4", "REPLACE #5", "REPLACE #6"], "a full deck must offer all six explicit replacement positions");
    await assertReplacementCandidateUnlabeled(page, replacementKey, "collection-first replacement");
    await page.keyboard.press("Escape");
    await page.locator("#deck-replace-modal").waitFor({ state: "hidden" });
    await assertReplacementCandidateCleared(page, replacementKey, "Escape");
    assert.deepEqual(await deckOrder(page), initialSavedDeck, "Escape must cancel explicit position selection");

    await replacementControl.click();
    await page.locator("#cancel-replacement-sheet").click();
    await page.locator("#deck-replace-modal").waitFor({ state: "hidden" });
    await assertReplacementCandidateCleared(page, replacementKey, "Cancel");
    assert.deepEqual(await deckOrder(page), initialSavedDeck, "Cancel must close the position picker without mutation");

    await replacementControl.click();
    await page.locator("#deck-replace-modal").dispatchEvent("pointerdown");
    await page.locator("#deck-replace-modal").waitFor({ state: "hidden" });
    await assertReplacementCandidateCleared(page, replacementKey, "backdrop dismissal");
    assert.deepEqual(await deckOrder(page), initialSavedDeck, "backdrop activation must close the position picker without mutation");

    const replacementScroll = await page.locator("#deck-screen").evaluate(element => element.scrollTop);
    await replacementControl.click();
    await beginReplacementMotionAudit(page, "__animatedReplacementMotion");
    await page.locator('[data-replace-slot="2"]').click();
    await page.waitForFunction(() => window.__animatedReplacementMotion?.state.simultaneous === true);
    const deckFirstOrder = [...initialSavedDeck];
    deckFirstOrder[2] = replacementKey;
    await waitForDeckOrder(page, deckFirstOrder);
    assert.equal(await page.locator("#deck-status").getAttribute("data-state"), "saved", "complete replacements must auto-save immediately");
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const replacementScrollAfter = await page.locator("#deck-screen").evaluate(element => element.scrollTop);
    assert.ok(Math.abs(replacementScrollAfter - replacementScroll) <= 2, `explicit replacement must preserve Armory scroll: ${replacementScroll} -> ${replacementScrollAfter}`);
    await page.waitForFunction(() => !document.querySelector(".deck-travel-clone"));
    const animatedReplacementMotion = await endReplacementMotionAudit(page, "__animatedReplacementMotion");
    assert.ok(animatedReplacementMotion.peakIncoming >= 1 && animatedReplacementMotion.peakOutgoing >= 1 && animatedReplacementMotion.simultaneous && animatedReplacementMotion.ariaHidden, `animated replacement must briefly expose paired aria-hidden incoming and outgoing clones: ${JSON.stringify(animatedReplacementMotion)}`);
    assert.deepEqual([animatedReplacementMotion.liveIncoming, animatedReplacementMotion.liveOutgoing], [0, 0], "animated replacement clones must clean up after completion");
    await auditVisibleArmoryCards(page, "deck-first replacement");
    const atomicAudit = await page.evaluate(() => {
      window.__deckAtomic.observer.disconnect();
      Storage.prototype.setItem = window.__deckAtomic.nativeSetItem;
      return { states: window.__deckAtomic.states, writes: window.__deckAtomic.writes };
    });
    assert.equal(atomicAudit.states.includes("invalid"), false, "atomic replacement must never expose an intermediate invalid state");
    assert.ok(atomicAudit.writes.length > 0 && atomicAudit.writes.every(write => write.activeDeck === 0 && write.selectedDeck === 0 && write.deckLength === 6 && write.draftLength === null), "complete replacements must persist only a complete active loadout with no draft");
    assert.equal(new Set(await deckOrder(page)).size, 6, "atomic replacement must preserve uniqueness");
    assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem("taptics-prototype-v3")))).loadouts[0].deck, deckFirstOrder, "replacement autosave must be durable before its confirmation animation ends");

    const memberKey = deckFirstOrder[0];
    const beforeMemberIdentification = await deckOrder(page);
    await page.locator(`[data-library-card="${memberKey}"] [data-card-action="toggle"]`).click();
    assert.equal(await page.locator(`[data-library-card="${memberKey}"] [data-card-action="locate"]`).textContent(), "IN DECK #1", "expanded members must expose their # draw position");
    await page.locator(`[data-library-card="${memberKey}"] [data-card-action="locate"]`).click();
    await page.waitForFunction(key => document.querySelector(`[data-card-key="${key}"][data-deck-slot]`)?.classList.contains("is-located"), memberKey);
    assert.deepEqual(await deckOrder(page), beforeMemberIdentification, "choosing an existing member must identify it without duplication or removal");
    assert.match(await page.locator("#deck-announcer").textContent(), /already in draw position/i);

    const sheetCandidate = selectedKey;
    await page.locator(`[data-library-card="${sheetCandidate}"] [data-card-action="toggle"]`).click();
    const sheetOrigin = page.locator(`[data-library-card="${sheetCandidate}"] [data-card-action="choose"]`);
    const beforeSheet = await deckOrder(page);
    await sheetOrigin.click();
    await assertVisible(page, "#deck-replace-modal");
    await page.waitForFunction(() => document.activeElement?.id === "deck-replace-title");
    await assertReplacementCandidateUnlabeled(page, sheetCandidate, "collection-first replacement");
    assert.equal(await page.locator("#deck-replacement-options [data-replace-slot]").count(), 6, "replacement sheet must expose all six draw positions");
    assert.equal(await page.locator(".app-shell").evaluate(element => element.inert), true, "replacement sheet must inert the app shell");
    await page.keyboard.press("Escape");
    await page.locator("#deck-replace-modal").waitFor({ state: "hidden" });
    await page.waitForFunction(key => document.activeElement?.matches(`[data-library-card="${key}"] [data-card-action="choose"]`), sheetCandidate);
    await assertReplacementCandidateCleared(page, sheetCandidate, "Escape");
    assert.deepEqual(await deckOrder(page), beforeSheet, "Escape must cancel collection-first replacement");
    await sheetOrigin.click();
    await page.locator("#cancel-replacement-sheet").click();
    await page.locator("#deck-replace-modal").waitFor({ state: "hidden" });
    await assertReplacementCandidateCleared(page, sheetCandidate, "Cancel");
    assert.deepEqual(await deckOrder(page), beforeSheet, "Cancel must close the replacement sheet without mutation");
    await sheetOrigin.click();
    await page.locator("#deck-replace-modal").dispatchEvent("pointerdown");
    await page.locator("#deck-replace-modal").waitFor({ state: "hidden" });
    await assertReplacementCandidateCleared(page, sheetCandidate, "backdrop dismissal");
    assert.deepEqual(await deckOrder(page), beforeSheet, "backdrop activation must close the replacement sheet without mutation");
    await sheetOrigin.click();
    assert.ok(await page.locator("#cancel-replacement-sheet").evaluate(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height)) >= 48, "replacement cancellation must remain a 48px action");
    await page.locator('[data-replace-slot="4"]').click();
    await page.locator("#deck-replace-modal").waitFor({ state: "hidden" });
    const sheetCompleted = [...beforeSheet];
    sheetCompleted[4] = sheetCandidate;
    await waitForDeckOrder(page, sheetCompleted);
    await assertReplacementCandidateCleared(page, sheetCandidate, "replacement completion");
    await auditVisibleArmoryCards(page, "collection-first replacement");
    assert.equal(new Set(sheetCompleted).size, 6, "collection-first completion must preserve a unique six-card deck");

    const beforeRemoval = await deckOrder(page);
    await page.locator('[data-deck-slot="1"] [data-slot-action="select"]').click();
    await page.locator('[data-deck-slot="1"] [data-slot-action="remove"]').click();
    await page.waitForFunction(() => document.querySelectorAll("[data-deck-slot][data-card-key]:not([data-card-key=''])").length === 5);
    assert.equal(await page.locator("#deck-status").getAttribute("data-state"), "invalid", "contextual removal must expose the incomplete state");
    assert.deepEqual(await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("taptics-prototype-v3")).loadouts[0];
      return { complete: saved.deck.length, draft: saved.deckDraft.deck.length };
    }), { complete: 6, draft: 5 }, "contextual removal must preserve the last complete deck while auto-saving the partial edit");
    await page.locator("#undo-deck-edit").click();
    await waitForDeckOrder(page, beforeRemoval);
    assert.equal(await page.locator("#deck-undo").isHidden(), true, "Undo must consume the single history entry");

    const beforePointer = await deckOrder(page);
    await pointerDragDeckCard(page, 0, 1, "cancel");
    assert.deepEqual(await deckOrder(page), beforePointer, "Escape must cancel an active pointer reorder");
    await pointerDragDeckCard(page, 0, 1, "invalid");
    assert.deepEqual(await deckOrder(page), beforePointer, "an invalid pointer drop must preserve exact order");
    await pointerDragDeckCard(page, 0, 1);
    const pointerOrder = [...beforePointer];
    pointerOrder.splice(1, 0, pointerOrder.splice(0, 1)[0]);
    await waitForDeckOrder(page, pointerOrder);
    await page.locator("#undo-deck-edit").click();
    await waitForDeckOrder(page, beforePointer);
    await assertNoDeckTransients(page, "committed and canceled pointer reorders must clean drag state");

    await page.locator('[data-weapon="cannon"]').focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector('[data-weapon="volley"]').getAttribute("aria-checked") === "true" && document.activeElement?.dataset.weapon === "volley");
    await page.keyboard.press("Home");
    await page.waitForFunction(() => document.querySelector('[data-weapon="cannon"]').getAttribute("aria-checked") === "true" && document.activeElement?.dataset.weapon === "cannon");
    await page.keyboard.press("End");
    await page.waitForFunction(() => document.querySelector('[data-weapon="volley"]').getAttribute("aria-checked") === "true" && document.activeElement?.dataset.weapon === "volley");
    assert.equal(await page.locator('#weapon-options [role="radio"][aria-checked="true"]').count(), 1, "weapon changes must retain exclusive radio semantics");
    await page.locator("#undo-deck-edit").click();
    await page.waitForFunction(() => document.querySelector('[data-weapon="cannon"]').getAttribute("aria-checked") === "true");
    assert.equal(await selectedDeckWeapon(page), "cannon", "Undo must restore and auto-save the previous weapon");
    await assertDeckRootsStable(page, "replacement, removal, Undo, drag, and weapon edits must preserve all stable roots");

    await page.locator("#deck-screen").evaluate(element => { element.scrollTop = Math.min(700, element.scrollHeight - element.clientHeight); });
    const savedScroll = await page.locator("#deck-screen").evaluate(element => element.scrollTop);
    const autoSavedBeforeLeave = { deck: await deckOrder(page), weapon: await selectedDeckWeapon(page) };
    await page.locator("#battle-tab").click();
    await assertVisible(page, "#lobby");
    assert.deepEqual(await page.locator("#loadout-deck [data-card-key]").evaluateAll(elements => elements.map(element => element.dataset.cardKey)), autoSavedBeforeLeave.deck, "complete edits must update the active battle loadout automatically");
    assert.equal(await page.locator("#loadout-weapon-name").textContent(), "CANNON");
    await page.locator("#open-deck").click();
    await waitForDeckOrder(page, autoSavedBeforeLeave.deck);
    assert.equal(await selectedDeckWeapon(page), autoSavedBeforeLeave.weapon, "Battle navigation must preserve the auto-saved weapon");
    await page.waitForFunction(scrollTop => Math.abs(document.querySelector("#deck-screen").scrollTop - scrollTop) <= 2, savedScroll);
    assert.ok(Math.abs(await page.locator("#deck-screen").evaluate(element => element.scrollTop) - savedScroll) <= 2, "returning to Deck must restore its previous scroll position");
    assert.equal(await page.locator("#deck-status").getAttribute("data-state"), "saved");

    const cancelKey = autoSavedBeforeLeave.deck[0];
    const cancelOrder = await deckOrder(page);
    await page.locator(`[data-card-key="${cancelKey}"][data-slot-action="select"]`).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("End");
    await page.keyboard.press("Escape");
    await waitForDeckOrder(page, cancelOrder);
    await assertNoDeckTransients(page, "canceling keyboard reorder must restore exact order without residue");

    const reorderKey = cancelOrder[4];
    const reorderControl = page.locator(`button[data-card-key="${reorderKey}"][data-slot-action="select"]`);
    await reorderControl.scrollIntoViewIfNeeded();
    await reorderControl.focus();
    const reorderScroll = await page.locator("#deck-screen").evaluate(element => element.scrollTop);
    await page.keyboard.press("Space");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-grabbed") === "true");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Space");
    const savedOrder = [...cancelOrder];
    savedOrder.splice(2, 0, savedOrder.splice(4, 1)[0]);
    await waitForDeckOrder(page, savedOrder);
    await page.waitForFunction(key => document.activeElement?.dataset.cardKey === key && document.activeElement?.dataset.slotAction === "select", reorderKey);
    assert.equal(await page.evaluate(key => document.activeElement?.dataset.cardKey === key && document.activeElement?.dataset.slotAction === "select", reorderKey), true, "keyboard reorder focus must follow the same card control");
    assert.ok(Math.abs(await page.locator("#deck-screen").evaluate(element => element.scrollTop) - reorderScroll) <= 2, "reordering must preserve Deck scroll");
    await page.locator('[data-weapon="volley"]').click();
    assert.equal(await page.locator('[data-weapon="volley"]').getAttribute("aria-checked"), "true");
    const immediatelyStored = await page.evaluate(() => JSON.parse(localStorage.getItem("taptics-prototype-v3")));
    assert.deepEqual(immediatelyStored.loadouts[0].deck, savedOrder, "keyboard reorder must auto-save synchronously");
    assert.equal(immediatelyStored.loadouts[0].weapon, "volley");
    assert.equal(immediatelyStored.loadouts[0].deckDraft, null);
    assert.equal(await page.locator("#deck-status").getAttribute("data-state"), "saved");

    await page.locator('[data-deck-tab="1"]').click();
    await page.waitForFunction(() => document.querySelector('[data-deck-tab="1"]').getAttribute("aria-selected") === "true");
    const deckTwoInitial = await deckOrder(page);
    assert.deepEqual(deckTwoInitial, catalogue.deck, "new deck slots must start from the safe default loadout");
    const deckTwoReplacement = catalogue.cards.find(key => !deckTwoInitial.includes(key) && key !== replacementKey);
    await page.locator(`[data-library-card="${deckTwoReplacement}"] [data-card-action="toggle"]`).click();
    await page.locator(`[data-library-card="${deckTwoReplacement}"] [data-card-action="choose"]`).click();
    await page.locator('[data-replace-slot="0"]').click();
    const deckTwoOrder = [...deckTwoInitial];
    deckTwoOrder[0] = deckTwoReplacement;
    await waitForDeckOrder(page, deckTwoOrder);
    assert.deepEqual(await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("taptics-prototype-v3"));
      return { activeDeck: saved.activeDeck, selectedDeck: saved.selectedDeck, deckOne: saved.loadouts[0].deck, deckTwo: saved.loadouts[1].deck };
    }), { activeDeck: 1, selectedDeck: 1, deckOne: savedOrder, deckTwo: deckTwoOrder }, "switching decks must preserve independent auto-saved loadouts and make the selected deck active");
    await page.locator("#battle-tab").click();
    assert.deepEqual(await page.locator("#loadout-deck [data-card-key]").evaluateAll(elements => elements.map(element => element.dataset.cardKey)), deckTwoOrder, "the lobby must use the newly active second deck");
    await page.locator("#open-deck").click();
    await page.locator('[data-deck-tab="0"]').click();
    await waitForDeckOrder(page, savedOrder);
    assert.equal(await selectedDeckWeapon(page), "volley", "switching back must restore Deck 1's independent weapon");
    assert.deepEqual(await page.locator("#deck-tabs [data-deck-tab] small").allTextContents(), ["ACTIVE", "READY", "READY", "READY", "READY"], "five complete deck tabs must expose one active deck and four ready alternatives");
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#open-deck").click();
    await waitForDeckOrder(page, savedOrder);
    assert.equal(await page.locator('[data-deck-tab="0"]').getAttribute("aria-selected"), "true", "the selected deck tab must survive reload");
    assert.equal(await page.locator('[data-weapon="volley"]').getAttribute("aria-checked"), "true", "auto-saved weapon must survive reload");
    assert.equal(await page.locator("#deck-status").getAttribute("data-state"), "saved");

    await rememberDeckRoots(page);
    await page.evaluate(() => { window.__deckDomCount = document.querySelectorAll("*").length; document.querySelector("#deck-screen").scrollTop = Math.min(500, document.querySelector("#deck-screen").scrollHeight - document.querySelector("#deck-screen").clientHeight); });
    const repeatedScroll = await page.locator("#deck-screen").evaluate(element => element.scrollTop);
    for (let visit = 0; visit < 10; visit += 1) {
      await page.locator("#battle-tab").click();
      await page.locator("#open-deck").click();
    }
    await page.waitForFunction(scrollTop => Math.abs(document.querySelector("#deck-screen").scrollTop - scrollTop) <= 2, repeatedScroll);
    await assertDeckRootsStable(page, "repeated Deck visits must retain all stable roots and singleton overlays");
    assert.equal(await page.evaluate(() => document.querySelectorAll("*").length), await page.evaluate(() => window.__deckDomCount), "repeated Deck visits must not accumulate DOM nodes");
    await assertNoDeckTransients(page, "repeated Deck visits must clean obsolete animation and drag state");
    await exerciseDeckStorageFailure(browser, port, errors);

    await page.locator("#battle-tab").click();
    await assertVisible(page, "#lobby");
    assert.deepEqual(await page.locator("#loadout-deck [data-card-key]").evaluateAll(elements => elements.map(element => element.dataset.cardKey)), savedOrder, "lobby must update to the saved order");
    assert.equal(await page.locator("#loadout-weapon-name").textContent(), "VOLLEY", "lobby must update to the saved weapon");
    await page.locator("#online-button").click();
    await page.getByText("CANCEL SEARCH", { exact: true }).waitFor();
    await page.locator("#open-deck").click();
    await assertVisible(page, "#deck-screen");
    assert.equal(await page.locator("#online-button").getAttribute("aria-pressed"), "false", "opening Deck must cancel active matchmaking");
    const queueProbeOne = connectClient(`http://127.0.0.1:${port}`, { autoConnect: false, transports: ["websocket"] });
    const queueProbeTwo = connectClient(`http://127.0.0.1:${port}`, { autoConnect: false, transports: ["websocket"] });
    try {
      const firstConnected = waitForSocket(queueProbeOne, "connect");
      queueProbeOne.connect();
      await firstConnected;
      const firstSearching = waitForSocket(queueProbeOne, "queueStatus", status => status?.searching === true);
      queueProbeOne.emit("findMatch", { deck: savedOrder, weapon: "volley" });
      await firstSearching;
      const firstMatched = waitForSocket(queueProbeOne, "matchFound");
      const secondConnected = waitForSocket(queueProbeTwo, "connect");
      queueProbeTwo.connect();
      await secondConnected;
      const secondMatched = waitForSocket(queueProbeTwo, "matchFound");
      queueProbeTwo.emit("findMatch", { deck: savedOrder, weapon: "volley" });
      await Promise.all([firstMatched, secondMatched]);
      assert.equal(await page.locator("#deck-screen").isVisible(), true, "server queue removal must keep the canceled Deck editor out of the probe match");
      queueProbeOne.emit("leaveMatch");
      queueProbeTwo.emit("leaveMatch");
    } finally {
      queueProbeOne.disconnect();
      queueProbeTwo.disconnect();
    }
    await page.locator("#battle-tab").click();
    await assertVisible(page, "#lobby");
    await page.locator("#online-button").click();
    await page.getByText("CANCEL SEARCH", { exact: true }).waitFor();
    assert.equal(await page.locator("#online-button").getAttribute("aria-pressed"), "true");
    await page.locator("#online-button").click();
    await page.getByText("SEARCH FOR BATTLE", { exact: true }).waitFor();
    assert.equal(await page.locator("#online-button").getAttribute("aria-pressed"), "false");
    await page.locator("#online-button").click();
    await page.getByText("CANCEL SEARCH", { exact: true }).waitFor();
    for (const [width, height] of RELEASE_VIEWPORTS) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.locator("#online-button").getAttribute("data-state"), "searching");
      assert.equal(await page.locator("#online-button").getAttribute("aria-busy"), "true");
      await page.screenshot({ path: path.join(ARTIFACTS, `phase-06-search-${width}x${height}.png`) });
    }
    await page.locator("#solo-button").click();
    await assertVisible(page, "#game");
    assert.equal(await page.locator("#online-button").getAttribute("aria-pressed"), "false", "starting CPU must visibly interrupt online search");
    await leaveBattle(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Tab");
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY", "keyboard focus must enter the lobby");
    const orderedEvents = await page.evaluate(() => window.TapticsUI.presentationEvents({
      recentEvents: [
        { id: 3, type: "hit", side: 1, source: "cannon", targetSide: 2, amount: 1 },
        { id: 2, type: "place", side: 1, key: "rampart", category: "crew" },
        { id: 3, type: "hit", side: 1, source: "cannon", targetSide: 2, amount: 1 },
        { id: 5, type: "place", side: 1, key: "rampart", category: "[" },
        null,
        { id: "bad", type: "card", side: 1, card: "rampart" }
      ],
      lastEvent: { id: 4, type: "card", side: 1, card: "rampart" }
    }, 1).map(event => event.id));
    assert.deepEqual(orderedEvents, [2, 3, 4], "client event selection must order, deduplicate, and reject malformed events");
    const replayedEvents = await page.evaluate(() => window.TapticsUI.presentationEvents({ lastEvent: { id: 4, type: "card", side: 1, card: "rampart" } }, 4));
    assert.deepEqual(replayedEvents, [], "the same snapshot event must not replay");
    const legacyFallback = await page.evaluate(() => window.TapticsUI.presentationEvents({ lastEvent: { id: 6, type: "card", side: 1, card: "rampart" } }, 4).map(event => event.id));
    assert.deepEqual(legacyFallback, [6], "legacy lastEvent-only snapshots must remain compatible");
    const presentationCoverage = await page.evaluate(() => ({
      families: Object.keys(window.GAME_DATA.effectFamilies),
      cards: Object.entries(window.GAME_DATA.cards).map(([key, card]) => [key, card.effectFamily, window.TapticsUI.effectPresentation(key)?.family]),
      weapons: Object.entries(window.GAME_DATA.weapons).map(([key, weapon]) => [key, weapon.effectFamily, window.TapticsUI.effectPresentation(key, "weapon")?.family])
    }));
    assert.equal(presentationCoverage.families.length, 10, "the battle renderer must expose all ten shared effect families");
    assert.ok([...presentationCoverage.cards, ...presentationCoverage.weapons].every(([, expected, actual]) => expected === actual), "every card and weapon must resolve through presentation metadata");
    await page.locator("#solo-button").click();
    await assertVisible(page, "#game");
    assert.equal(await page.locator("#battle-hand [data-hand-slot]").count(), 3, "battle must use the three-card contract");
    assert.deepEqual(await page.locator("#battle-hand [data-hand-slot]").evaluateAll(elements => elements.map(element => element.dataset.cardKey)), savedOrder.slice(0, 3), "CPU battle must use the saved opening order");
    const expectedNextCard = await page.evaluate(key => window.GAME_DATA.cards[key].name.toUpperCase(), savedOrder[3]);
    assert.equal(await page.locator("#next-card-label").textContent(), `NEXT: ${expectedNextCard}`, "CPU battle must use the active deck's auto-saved queue order");
    assert.match(await page.locator("#weapon-short").getAttribute("class"), /pixel-weapon-volley/, "CPU battle must use the saved weapon");
    assert.equal(await page.locator("#battle-hand .card-frame__art").evaluateAll(elements => elements.every(element => getComputedStyle(element).backgroundImage.includes("cards-atlas.png"))), true, "battle hand must use catalogue portraits");
    assert.match(await page.locator("#weapon-short").getAttribute("class"), /pixel-weapon-volley/);
    assert.match(await page.locator("#weapon-short").evaluate(element => getComputedStyle(element).backgroundImage), /weapons-atlas\.png/);
    await assertFocusRing(page, "#arena", "battlefield entry");
    const battleSemantics = await page.evaluate(() => ({
      rivalMeter: {
        role: document.querySelector("#enemy-tap-meter").getAttribute("role"),
        min: document.querySelector("#enemy-tap-meter").getAttribute("aria-valuemin"),
        max: document.querySelector("#enemy-tap-meter").getAttribute("aria-valuemax"),
        now: document.querySelector("#enemy-tap-meter").getAttribute("aria-valuenow"),
        expected: String(Math.floor(matchState.players[ownSide === 1 ? 2 : 1].taps))
      },
      structureRoles: [document.querySelector("#own-structures").getAttribute("role"), document.querySelector("#enemy-structures").getAttribute("role")],
      inactiveSiphons: [...document.querySelectorAll("#enemy-weapon, #enemy-crew, #enemy-magic, [id^=enemy-action-]")].filter(element => !element.classList.contains("counterable")).every(element => element.getAttribute("aria-disabled") === "true"),
      shortcuts: [...document.querySelectorAll("#battle-hand [data-hand-slot], #weapon-card")].every(element => element.getAttribute("aria-keyshortcuts") === "I F2")
    }));
    assert.deepEqual(battleSemantics.rivalMeter, { role: "progressbar", min: "0", max: "40", now: battleSemantics.rivalMeter.expected, expected: battleSemantics.rivalMeter.expected }, "rival reserve must expose its authoritative numeric value");
    assert.deepEqual(battleSemantics.structureRoles, ["list", "list"], "both structure grids must expose list semantics");
    assert.equal(battleSemantics.inactiveSiphons, true, "inactive rival targets must expose aria-disabled=true");
    assert.equal(battleSemantics.shortcuts, true, "inspectable hand and weapon controls must declare I and F2");

    renderBenchmark = await page.evaluate(() => {
      const snapshot = structuredClone(matchState);
      render(snapshot);
      const handRoots = [...document.querySelector("#battle-hand").children];
      const ownStructureRoots = [...document.querySelector("#own-structures").children];
      const enemyStructureRoots = [...document.querySelector("#enemy-structures").children];
      const nodeCount = document.querySelector("#game").querySelectorAll("*").length;
      const socketListeners = Object.fromEntries(["queueStatus", "matchFound", "state", "gameOver", "disconnect", "connect"].map(event => [event, socket.listeners(event).length]));
      const observer = new MutationObserver(() => {});
      observer.observe(document.querySelector("#game"), { subtree: true, childList: true, attributes: true, characterData: true });
      const iterations = 500;
      const started = performance.now();
      for (let index = 0; index < iterations; index += 1) render(snapshot);
      const durationMs = performance.now() - started;
      const records = observer.takeRecords();
      const mutationCounts = {};
      for (const record of records) {
        const target = record.target.id ? `#${record.target.id}` : record.target.classList?.length ? `.${[...record.target.classList].join(".")}` : record.target.nodeName;
        const key = `${record.type}:${record.attributeName || "content"}:${target}`;
        mutationCounts[key] = (mutationCounts[key] || 0) + 1;
      }
      observer.disconnect();
      return {
        iterations,
        durationMs,
        averageMs: durationMs / iterations,
        mutations: records.length,
        mutationSummary: Object.entries(mutationCounts).sort((left, right) => right[1] - left[1]).slice(0, 12),
        stableHand: handRoots.every((node, index) => node === document.querySelector("#battle-hand").children[index]),
        stableOwnStructures: ownStructureRoots.every((node, index) => node === document.querySelector("#own-structures").children[index]),
        stableEnemyStructures: enemyStructureRoots.every((node, index) => node === document.querySelector("#enemy-structures").children[index]),
        stableNodeCount: nodeCount === document.querySelector("#game").querySelectorAll("*").length,
        effectNodes: document.querySelector("#battle-effects").children.length,
        cardFlights: document.querySelectorAll(".card-flight").length,
        socketListeners
      };
    });
    assert.ok(renderBenchmark.averageMs < 5, `identical snapshot render average must remain below 5ms; measured ${renderBenchmark.averageMs.toFixed(3)}ms`);
    assert.ok(renderBenchmark.mutations <= 4, `500 identical snapshots must stay effectively write-free; observed ${renderBenchmark.mutations} mutations: ${JSON.stringify(renderBenchmark.mutationSummary)}`);
    assert.equal(renderBenchmark.stableHand, true, "identical snapshots must preserve battle-hand roots");
    assert.equal(renderBenchmark.stableOwnStructures && renderBenchmark.stableEnemyStructures, true, "identical snapshots must preserve structure roots");
    assert.equal(renderBenchmark.stableNodeCount, true, "identical snapshots must not accumulate DOM nodes");
    assert.deepEqual([renderBenchmark.effectNodes, renderBenchmark.cardFlights], [0, 0], "identical snapshots must not create transient presentation nodes");
    assert.deepEqual(renderBenchmark.socketListeners, { queueStatus: 1, matchFound: 1, state: 1, gameOver: 1, disconnect: 1, connect: 1 }, "client lifecycle listeners must remain singular");
    const transitionAudit = await page.evaluate(() => {
      const snapshot = structuredClone(matchState);
      snapshot.recentEvents = [];
      snapshot.lastEvent = null;
      const listenerEvents = ["queueStatus", "matchFound", "state", "gameOver", "disconnect", "connect"];
      const listenersBefore = Object.fromEntries(listenerEvents.map(event => [event, socket.listeners(event).length]));
      const handRoots = [...document.querySelector("#battle-hand").children];
      const nodesBefore = document.querySelectorAll("*").length;
      for (let visit = 0; visit < 10; visit += 1) {
        showLobby();
        showGame();
        render(snapshot);
      }
      return {
        listenersBefore,
        listenersAfter: Object.fromEntries(listenerEvents.map(event => [event, socket.listeners(event).length])),
        nodesBefore,
        nodesAfter: document.querySelectorAll("*").length,
        stableHand: handRoots.every((node, index) => node === document.querySelector("#battle-hand").children[index]),
        effectNodes: document.querySelector("#battle-effects").children.length,
        cardFlights: document.querySelectorAll(".card-flight").length,
        singletonSurfaces: ["#card-inspector", "#toast", "#leave-modal", "#result-modal"].every(selector => document.querySelectorAll(selector).length === 1)
      };
    });
    assert.deepEqual(transitionAudit.listenersAfter, transitionAudit.listenersBefore, "repeated screen transitions must not accumulate Socket.IO listeners");
    assert.equal(transitionAudit.nodesAfter, transitionAudit.nodesBefore, "repeated screen transitions must not accumulate DOM nodes");
    assert.equal(transitionAudit.stableHand, true, "repeated screen transitions must retain stable hand roots");
    assert.deepEqual([transitionAudit.effectNodes, transitionAudit.cardFlights], [0, 0], "screen transitions must clean transient battle presentation");
    assert.equal(transitionAudit.singletonSurfaces, true, "repeated transitions must retain one inspector, toast, and lifecycle dialog of each kind");
    const familyRenders = await page.evaluate(() => Object.keys(window.GAME_DATA.effectFamilies).map(family => {
      const node = document.createElement("i");
      node.className = `pixel-sprite pixel-family-${family} effect-family effect-family-${family}`;
      document.querySelector("#battle-effects").appendChild(node);
      const result = { family, image: getComputedStyle(node).backgroundImage, animation: getComputedStyle(node).animationName };
      node.remove();
      return result;
    }));
    assert.ok(familyRenders.every(({ image }) => image.includes("effects-atlas.png")), "one representative from every effect family must render in the battle layer");
    assert.ok(familyRenders.every(({ animation }) => animation === "effect-family-resolve"), "every local family effect must use the shared stepped animation engine");
    await exerciseBattleVisualCoverage(page, [phaseAt(0), phaseAt(25), phaseAt(120), phaseAt(180)]);
    const tapsBeforeInspection = await page.locator("#tap-value").textContent();
    await page.locator('#battle-hand [data-hand-slot="0"]').click({ button: "right" });
    await assertVisible(page, "#card-inspector");
    assert.match(await page.locator("#inspector-icon").evaluate(element => getComputedStyle(element).backgroundImage), /cards-atlas\.png/);
    assert.equal(await page.locator("#battle-hand [data-hand-placeholder]").count(), 0, "right-click inspection must not deploy a card");
    assert.equal(await page.locator("#tap-value").textContent(), tapsBeforeInspection, "inspection must not spend a tap");
    await page.locator('#battle-hand [data-hand-slot="0"]').click({ button: "right" });
    assert.equal(await page.locator("#card-inspector").isVisible(), false, "a second right-click must close the same inspector");
    await page.locator('#battle-hand [data-hand-slot="0"]').click();
    await assertVisible(page, "#own-action-crew");
    assert.match(await page.locator("#own-action-crew .card-frame__art").evaluate(element => getComputedStyle(element).backgroundImage), /cards-atlas\.png/);
    assert.equal(await page.locator("#battle-hand [data-hand-placeholder]").count(), 1, "deployment must reserve its hand slot");
    await page.locator("#own-action-crew").click();
    await page.locator("#own-action-crew > em").filter({ hasText: "1/5" }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(110);
    const tapsBeforeKeyboardInspection = await page.locator("#tap-value").textContent();
    await page.locator("#weapon-card").press("i");
    await assertVisible(page, "#card-inspector");
    assert.equal(await page.locator("#tap-value").textContent(), tapsBeforeKeyboardInspection, "I inspection must not spend a tap");
    await page.keyboard.press("Escape");
    await page.locator('#battle-hand [data-hand-slot="1"]').click();
    await assertVisible(page, "#own-action-magic");
    await page.locator("#own-action-magic").click();
    await page.locator("#own-action-magic > em").filter({ hasText: "1/6" }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(110);
    await page.locator('#battle-hand [data-hand-slot="2"]').click();
    await assertVisible(page, "#own-action-attack");
    await page.locator("#own-action-attack").click();
    await page.locator("#own-action-attack > em").filter({ hasText: "1/5" }).waitFor({ timeout: 5000 });
    const blockedWeapon = await page.locator("#weapon-card").evaluate(element => ({
      nativeDisabled: element.disabled,
      ariaDisabled: element.getAttribute("aria-disabled")
    }));
    assert.deepEqual(blockedWeapon, { nativeDisabled: false, ariaDisabled: "true" }, "a lane-blocked weapon must remain focusable for inspection while exposing aria-disabled");
    const tapsBeforeBlockedWeapon = await page.locator("#tap-value").textContent();
    await page.locator("#weapon-card").press("i");
    await assertVisible(page, "#card-inspector");
    assert.equal(await page.locator("#inspector-name").textContent(), "VOLLEY");
    assert.equal(await page.locator("#tap-value").textContent(), tapsBeforeBlockedWeapon, "blocked-weapon inspection must not spend a tap");
    await page.keyboard.press("Escape");
    await page.locator("#weapon-card").press("Enter");
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#tap-value").textContent(), tapsBeforeBlockedWeapon, "aria-disabled weapon activation must remain guarded");
    assert.equal(await page.locator("#battle-hand [data-hand-placeholder]").count(), 3, "all three category lanes must stage independently");
    await page.waitForTimeout(300);
    for (const [width, height] of RELEASE_VIEWPORTS) {
      await page.setViewportSize({ width, height });
      const battleLayout = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        handSlots: document.querySelectorAll("#battle-hand > [data-hand-slot], #battle-hand > [data-hand-placeholder]").length,
        actionCount: [...document.querySelectorAll("#game button:not(.hidden):not([disabled])")].filter(element => element.getClientRects().length).length,
        clippedActions: [...document.querySelectorAll("#game button:not(.hidden):not([disabled])")].filter(element => element.getClientRects().length).filter(element => { const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }).length,
        smallestAction: Math.min(...[...document.querySelectorAll("#game button:not(.hidden):not([disabled])")].filter(element => element.getClientRects().length).map(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height)))
      }));
      assert.equal(battleLayout.horizontalOverflow, false, `${width}px battle must not clip horizontally`);
      assert.equal(battleLayout.handSlots, 3, "the battle must retain exactly three stable hand slots");
      assert.ok(battleLayout.actionCount > 0, "battle must retain reachable actions");
      assert.equal(battleLayout.clippedActions, 0, `${width}px battle actions must remain in the viewport`);
      assert.ok(battleLayout.smallestAction >= 48, `${width}px battle actions must retain 48px touch targets`);
      await page.screenshot({ path: path.join(ARTIFACTS, `phase-03-battle-cannon-${width}x${height}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await exerciseLeaveDialog(page);
    await leaveBattle(page);
    await exerciseResultDialogs(page);
    await exerciseDisconnectInterruption(page);

    const opponentPage = await context.newPage();
    opponentPage.on("console", message => { if (message.type() === "error") errors.push(`opponent console: ${message.text()}`); });
    opponentPage.on("pageerror", error => errors.push(`opponent page: ${error.message}`));
    opponentPage.on("requestfailed", request => errors.push(`opponent network: ${request.url()} ${request.failure()?.errorText || "failed"}`));
    opponentPage.on("response", response => { if (response.status() >= 400) errors.push(`opponent http ${response.status()}: ${response.url()}`); });
    await opponentPage.setViewportSize({ width: 390, height: 844 });
    await opponentPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await Promise.all([page.locator("#online-button").click(), opponentPage.locator("#online-button").click()]);
    await Promise.all([assertVisible(page, "#game"), assertVisible(opponentPage, "#game")]);
    await page.locator('#battle-hand [data-hand-slot="0"]').click();
    await assertVisible(page, "#own-action-crew");
    await page.locator("#own-action-crew").click();
    await opponentPage.locator("#enemy-action-crew.counterable").waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await opponentPage.locator("#enemy-action-crew").getAttribute("aria-disabled"), "false", "a counterable rival commitment must expose aria-disabled=false");
    assert.equal(await opponentPage.locator("#enemy-action-crew").getAttribute("data-siphon-dots"), "○○○");
    await opponentPage.locator("#enemy-action-crew").press("F2");
    await assertVisible(opponentPage, "#card-inspector");
    assert.equal(await opponentPage.locator("#inspector-name").textContent(), "TIMBER RAMPART");
    assert.equal(await opponentPage.locator("#enemy-action-crew").getAttribute("data-siphon-dots"), "○○○", "inspection must not siphon");
    await opponentPage.keyboard.press("Escape");
    await opponentPage.locator("#enemy-action-crew").press("Enter");
    await opponentPage.waitForFunction(() => document.querySelector("#enemy-action-crew")?.dataset.siphonDots === "●○○", null, { timeout: 5000 });
    await opponentPage.waitForTimeout(300);
    await opponentPage.screenshot({ path: path.join(ARTIFACTS, "phase-03-keyboard-siphon-390x844.png") });
    await leaveBattle(page);
    await opponentPage.close();

    await page.evaluate(() => {
      const key = "taptics-prototype-v3";
      const profile = JSON.parse(localStorage.getItem(key));
      profile.loadouts[profile.activeDeck].weapon = "volley";
      profile.loadouts[profile.activeDeck].deckDraft = null;
      localStorage.setItem(key, JSON.stringify(profile));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#solo-button").click();
    await assertVisible(page, "#game");
    await page.locator("#own-weapon.volley").waitFor({ state: "visible", timeout: 5000 });
    assert.match(await page.locator("#weapon-short").getAttribute("class"), /pixel-weapon-volley/);
    assert.match(await page.locator("#weapon-short").evaluate(element => getComputedStyle(element).backgroundImage), /weapons-atlas\.png/);
    await page.screenshot({ path: path.join(ARTIFACTS, "phase-03-battle-volley-390x844.png") });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator('#battle-hand [data-hand-slot="0"]').click();
    await assertVisible(page, "#own-action-crew");
    assert.equal(await page.locator(".card-flight").count(), 0, "reduced motion must not create a traveling deployment clone");
    const reducedFamilyAnimation = await page.evaluate(() => {
      const node = document.createElement("i");
      node.className = "pixel-sprite pixel-family-restore effect-family effect-family-restore";
      document.querySelector("#battle-effects").appendChild(node);
      const animation = getComputedStyle(node).animationName;
      node.remove();
      return animation;
    });
    assert.equal(reducedFamilyAnimation, "none", "reduced motion must replace family animation with a static effect frame");
    await page.screenshot({ path: path.join(ARTIFACTS, "phase-03-reduced-motion-390x844.png") });
    const reducedResult = await renderSyntheticResult(page, { outcome: "draw", winner: 0, ownCore: 0, enemyCore: 0 });
    assert.equal(reducedResult.particles, 0, "reduced motion must not create decorative result particles");
    await assertVisible(page, "#result-modal");
    assert.equal(await page.locator("#result-card").evaluate(element => getComputedStyle(element).animationName), "none", "reduced motion must remove result-card animation");
    assert.equal(await page.locator("#result-emblem").evaluate(element => getComputedStyle(element).animationName), "none", "reduced motion must keep the result emblem static");
    await page.screenshot({ path: path.join(ARTIFACTS, "phase-06-result-draw-reduced-motion-390x844.png") });
    await page.locator("#lobby-button").click();
    await assertVisible(page, "#lobby");
    const reduced = await page.locator("#online-button").evaluate(element => getComputedStyle(element).transitionDuration);
    assert.ok(reduced === "0s" || reduced.split(",").every(value => value.trim() === "0s"), "reduced motion must remove lobby transitions");

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => {
      const key = "taptics-prototype-v3";
      const profile = JSON.parse(localStorage.getItem(key));
      profile.loadouts[profile.activeDeck].deck = ["scavenger", "emergencyCache", "phaseShield", "piercingShot", "timeBomb", "suppressingFire"];
      profile.loadouts[profile.activeDeck].deckDraft = null;
      localStorage.setItem(key, JSON.stringify(profile));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#solo-button").click();
    await assertVisible(page, "#game");
    await page.locator('#battle-hand [data-hand-slot="0"]').click();
    await page.locator('#own-action-crew[data-action-key="scavenger"]').waitFor({ state: "visible", timeout: 5000 });
    await page.locator('#battle-hand [data-hand-slot="1"]').click();
    await page.locator('#own-action-crew[data-action-key="emergencyCache"]').waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await page.locator('#battle-hand [data-hand-slot="0"]').getAttribute("data-card-key"), "scavenger", "an untouched same-category card must return on swap");
    assert.equal(await page.locator('#battle-hand [data-hand-placeholder="1"]').count(), 1, "the replacement card must reserve its original slot");
    for (let attempt = 0; attempt < 12 && await page.locator('#battle-hand [data-hand-slot="1"][data-card-key="piercingShot"]').count() === 0; attempt++) {
      await page.locator("#own-action-crew").click();
      await page.waitForTimeout(150);
    }
    await page.locator('#battle-hand [data-hand-slot="1"][data-card-key="piercingShot"]').waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await page.locator("#next-card-label").textContent(), "NEXT: HOURGLASS CURSE", "completion must advance the ordered queue");
    await leaveBattle(page);

    await page.evaluate(() => {
      const key = "taptics-prototype-v3";
      const profile = JSON.parse(localStorage.getItem(key));
      profile.loadouts[profile.activeDeck].deck = ["tapForge", "phaseShield", "piercingShot", "scavenger", "timeBomb", "suppressingFire"];
      profile.loadouts[profile.activeDeck].deckDraft = null;
      localStorage.setItem(key, JSON.stringify(profile));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#solo-button").click();
    await assertVisible(page, "#game");
    await page.locator('#battle-hand [data-hand-slot="0"]').click();
    await page.locator('#own-action-crew[data-action-key="tapForge"]').waitFor({ state: "visible", timeout: 5000 });
    for (let attempt = 0; attempt < 32 && await page.locator("#own-action-crew.pending").count() === 0; attempt++) {
      await page.locator("#own-action-crew").click();
      await page.waitForTimeout(150);
    }
    await page.locator("#own-action-crew.pending").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#own-structures .pixel-structure-tapForge").waitFor({ state: "visible", timeout: 5000 });
    assert.match(await page.locator("#own-structures .pixel-structure-tapForge").evaluate(element => getComputedStyle(element).backgroundImage), /structures-atlas\.png/);
    assert.match(await page.locator("#own-structures").getAttribute("aria-label"), /Bellows Guild/);
    assert.equal(await page.locator('#own-structures [role="listitem"]').count(), 1, "a resolved structure must become a named list item");
    await page.screenshot({ path: path.join(ARTIFACTS, "phase-04-built-bellows-guild-390x844.png") });
    await leaveBattle(page);

    await page.evaluate(() => {
      const key = "taptics-prototype-v3";
      const profile = JSON.parse(localStorage.getItem(key));
      profile.loadouts[profile.activeDeck].deck = ["timeBomb", "scavenger", "piercingShot", "phaseShield", "emergencyCache", "suppressingFire"];
      profile.loadouts[profile.activeDeck].deckDraft = null;
      localStorage.setItem(key, JSON.stringify(profile));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#solo-button").click();
    await assertVisible(page, "#game");
    await page.locator('#battle-hand [data-hand-slot="0"]').click();
    await page.locator('#own-action-magic[data-action-key="timeBomb"]').waitFor({ state: "visible", timeout: 5000 });
    for (let attempt = 0; attempt < 32 && await page.locator("#own-action-magic.pending").count() === 0; attempt++) {
      await page.locator("#own-action-magic").click();
      await page.waitForTimeout(150);
    }
    await page.locator("#own-action-magic.pending.high-threat").waitFor({ state: "visible", timeout: 5000 });
    assert.match(await page.locator("#own-action-magic").getAttribute("aria-label"), /winding up/);
    assert.deepEqual(await page.locator("#own-action-magic").evaluate(element => ({ nativeDisabled: element.disabled, ariaDisabled: element.getAttribute("aria-disabled") })), { nativeDisabled: false, ariaDisabled: "true" }, "a pending staged card must remain focusable for inspection while exposing aria-disabled");
    const tapsBeforePendingInspection = await page.locator("#tap-value").textContent();
    await page.locator("#own-action-magic").press("F2");
    await assertVisible(page, "#card-inspector");
    assert.equal(await page.locator("#inspector-name").textContent(), "HOURGLASS CURSE");
    assert.equal(await page.locator("#tap-value").textContent(), tapsBeforePendingInspection, "pending-card inspection must not spend a tap");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    const pendingCapture = path.join(ARTIFACTS, "phase-03-pending-ritual-390x844.png");
    await page.screenshot({ animations: "disabled", path: pendingCapture });
    await page.waitForTimeout(100);
    await page.screenshot({ animations: "disabled", path: pendingCapture });
    await leaveBattle(page);
    const finalLifecycle = await page.evaluate(() => ({
      nodes: document.querySelectorAll("*").length,
      libraryCards: document.querySelectorAll("[data-library-card]").length,
      effectNodes: document.querySelector("#battle-effects").children.length,
      cardFlights: document.querySelectorAll(".card-flight").length,
      deckClones: document.querySelectorAll(".deck-travel-clone, .deck-drag-avatar, .armory-filter-clone").length,
      deckTransforms: [...document.querySelectorAll("#builder-deck .deck-slot__select, #card-library [data-library-card]")].filter(element => element.style.transform).length,
      resultParticles: document.querySelector("#result-particles").children.length,
      transientHidden: ["#card-inspector", "#toast", "#leave-modal", "#result-modal", "#deck-info-modal", "#deck-replace-modal"].every(selector => document.querySelector(selector).classList.contains("hidden")),
      singletonSurfaces: ["#card-inspector", "#toast", "#leave-modal", "#result-modal", "#deck-info-modal", "#deck-replace-modal"].every(selector => document.querySelectorAll(selector).length === 1),
      listeners: Object.fromEntries(["queueStatus", "matchFound", "state", "gameOver", "disconnect", "connect"].map(event => [event, socket.listeners(event).length]))
    }));
    assert.ok(finalLifecycle.nodes < 1200, `repeated matches must keep the final DOM bounded; observed ${finalLifecycle.nodes} nodes`);
    assert.ok([0, 29].includes(finalLifecycle.libraryCards), "repeated matches must retain either the lazy-unopened or one complete bounded Deck catalogue");
    assert.deepEqual([finalLifecycle.effectNodes, finalLifecycle.cardFlights, finalLifecycle.deckClones, finalLifecycle.deckTransforms, finalLifecycle.resultParticles], [0, 0, 0, 0, 0], "returning to the lobby must clear all transient presentation nodes");
    assert.equal(finalLifecycle.transientHidden && finalLifecycle.singletonSurfaces, true, "repeated matches must leave one hidden transient surface of each kind");
    assert.deepEqual(finalLifecycle.listeners, { queueStatus: 1, matchFound: 1, state: 1, gameOver: 1, disconnect: 1, connect: 1 }, "repeated matches must not accumulate Socket.IO listeners");
    assert.deepEqual(errors, [], errors.join("\n"));
    process.stdout.write(`Browser smoke passed; ${fs.readdirSync(ARTIFACTS).length} captures in ${path.relative(ROOT, ARTIFACTS)}; identical renders: ${renderBenchmark.iterations} in ${renderBenchmark.durationMs.toFixed(1)}ms with ${renderBenchmark.mutations} mutations; final DOM: ${finalLifecycle.nodes} nodes\n`);
  } finally {
    await browser.close();
    await closeServer();
  }
}

async function deckOrder(page) {
  return page.locator("#builder-deck [data-deck-slot]").evaluateAll(elements => elements.map(element => element.dataset.cardKey).filter(Boolean));
}

async function selectedDeckWeapon(page) {
  return page.locator('#weapon-options [role="radio"][aria-checked="true"]').getAttribute("data-weapon");
}

async function waitForDeckOrder(page, expected) {
  await page.waitForFunction(order => JSON.stringify([...document.querySelectorAll("#builder-deck [data-deck-slot]")].map(slot => slot.dataset.cardKey).filter(Boolean)) === JSON.stringify(order), expected);
}

async function rememberDeckRoots(page) {
  await page.evaluate(() => {
    window.__deckRootRefs = {
      slots: Object.fromEntries([...document.querySelectorAll("[data-deck-slot]")].map(node => [node.dataset.deckSlot, node])),
      cards: Object.fromEntries([...document.querySelectorAll("[data-library-card]")].map(node => [node.dataset.libraryCard, node])),
      weapons: Object.fromEntries([...document.querySelectorAll("[data-weapon-root]")].map(node => [node.dataset.weaponRoot, node])),
      info: document.querySelector("#deck-info-modal"),
      replacement: document.querySelector("#deck-replace-modal")
    };
  });
}

async function deckRootAudit(page) {
  return page.evaluate(() => {
    const refs = window.__deckRootRefs;
    const same = (selector, key, expected) => [...document.querySelectorAll(selector)].every(node => expected[node.dataset[key]] === node);
    return {
      slots: document.querySelectorAll("[data-deck-slot]").length,
      cards: document.querySelectorAll("[data-library-card]").length,
      weapons: document.querySelectorAll("[data-weapon-root]").length,
      info: document.querySelectorAll("#deck-info-modal").length,
      replacement: document.querySelectorAll("#deck-replace-modal").length,
      stable: Boolean(refs) && same("[data-deck-slot]", "deckSlot", refs.slots) && same("[data-library-card]", "libraryCard", refs.cards) && same("[data-weapon-root]", "weaponRoot", refs.weapons) && refs.info === document.querySelector("#deck-info-modal") && refs.replacement === document.querySelector("#deck-replace-modal")
    };
  });
}

async function assertDeckRootsStable(page, label) {
  assert.deepEqual(await deckRootAudit(page), { slots: 6, cards: 29, weapons: 2, info: 1, replacement: 1, stable: true }, label);
}

async function waitForDeckSettled(page) {
  await page.waitForFunction(() => {
    const deckAnimations = document.getAnimations().filter(animation => {
      const target = animation.effect?.target;
      return animation.playState === "running" && target instanceof Element && (target.closest("#deck-screen") || target.closest(".deck-overlay"));
    });
    return deckAnimations.length === 0 && !document.querySelector(".deck-travel-clone, .deck-drag-avatar, .armory-filter-clone") && [...document.querySelectorAll("#builder-deck .deck-slot__select")].every(element => !element.style.transform);
  });
}

async function assertNoDeckTransients(page, label) {
  await waitForDeckSettled(page);
  const state = await page.evaluate(() => ({
    clones: document.querySelectorAll(".deck-travel-clone, .deck-drag-avatar, .armory-filter-clone").length,
    transforms: [...document.querySelectorAll("#builder-deck .deck-slot__select, #card-library [data-library-card]")].filter(element => element.style.transform).length,
    running: document.getAnimations().filter(animation => {
      const target = animation.effect?.target;
      return animation.playState === "running" && target instanceof Element && (target.closest("#deck-screen") || target.closest(".deck-overlay"));
    }).length
  }));
  assert.deepEqual(state, { clones: 0, transforms: 0, running: 0 }, label);
}

async function exerciseArmoryMotion(page) {
  const departureKey = await page.evaluate(() => Object.entries(window.GAME_DATA.cards).find(([, card]) => card.category === "crew")?.[0]);
  assert.ok(departureKey, "Armory motion fixture requires a Crew card");
  await page.locator(`[data-library-card="${departureKey}"]`).scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const state = { peak: 0, observations: [] };
    const observer = new MutationObserver(records => {
      const clones = records.flatMap(record => [...record.addedNodes]).filter(node => node instanceof Element).flatMap(node => node.matches(".armory-filter-clone") ? [node] : [...node.querySelectorAll(".armory-filter-clone")]);
      for (const clone of clones) {
        const rect = clone.getBoundingClientRect();
        const viewport = document.querySelector("#deck-screen").getBoundingClientRect();
        state.observations.push({
          inert: clone.inert,
          ariaHidden: clone.getAttribute("aria-hidden"),
          stableKeyRemoved: !clone.hasAttribute("data-library-card"),
          pointerEvents: getComputedStyle(clone).pointerEvents,
          visibleDeparture: rect.width > 0 && rect.height > 0 && rect.bottom >= viewport.top && rect.top <= viewport.bottom
        });
      }
      state.peak = Math.max(state.peak, document.querySelectorAll(".armory-filter-clone").length);
    });
    observer.observe(document.querySelector("#deck-screen"), { childList: true, subtree: true });
    window.__armoryMotionAudit = { state, observer };
  });
  await page.locator('[data-deck-filter="attack"]').click();
  await page.waitForFunction(() => window.__armoryMotionAudit?.state.peak > 0);
  const positive = await page.evaluate(() => window.__armoryMotionAudit.state);
  assert.ok(positive.peak >= 1 && positive.observations.length >= 1, "animated filtering must create at least one departure clone");
  assert.equal(positive.observations.every(item => item.inert && item.ariaHidden === "true" && item.stableKeyRemoved && item.pointerEvents === "none" && item.visibleDeparture), true, "Armory departure clones must be inert, aria-hidden, keyless, pointer-inert, and sourced from visible cards");
  await page.evaluate(() => {
    document.querySelector('[data-deck-filter="crew"]').click();
    document.querySelector('[data-deck-filter="magic"]').click();
    const search = document.querySelector("#deck-search");
    search.value = "ward";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector('[data-deck-filter="all"]').click();
  });
  await page.waitForFunction(() => !document.querySelector(".armory-filter-clone") && document.querySelectorAll("#card-library [data-library-card]:not([hidden])").length === 29 && document.querySelector('[data-deck-filter="all"]').getAttribute("aria-pressed") === "true" && !document.querySelector("#deck-search").value);
  await page.waitForTimeout(240);
  const complete = await page.evaluate(() => {
    window.__armoryMotionAudit.observer.disconnect();
    return { peak: window.__armoryMotionAudit.state.peak, live: document.querySelectorAll(".armory-filter-clone").length };
  });
  assert.ok(complete.peak >= 1, "rapid Armory input must retain positive departure-motion evidence");
  assert.equal(complete.live, 0, "rapid search and filter input must clean every Armory departure clone");
}

async function beginReplacementMotionAudit(page, auditKey) {
  await page.evaluate(key => {
    window[key]?.observer?.disconnect();
    const state = { peakIncoming: 0, peakOutgoing: 0, simultaneous: false, ariaHidden: true };
    const sample = () => {
      const incoming = [...document.querySelectorAll(".deck-travel-clone:not(.is-removing)")];
      const outgoing = [...document.querySelectorAll(".deck-travel-clone.is-removing")];
      state.peakIncoming = Math.max(state.peakIncoming, incoming.length);
      state.peakOutgoing = Math.max(state.peakOutgoing, outgoing.length);
      state.simultaneous ||= incoming.length > 0 && outgoing.length > 0;
      state.ariaHidden &&= [...incoming, ...outgoing].every(clone => clone.getAttribute("aria-hidden") === "true");
    };
    const observer = new MutationObserver(sample);
    observer.observe(document.body, { childList: true, subtree: true });
    window[key] = { state, observer, sample };
    sample();
  }, auditKey);
}

async function endReplacementMotionAudit(page, auditKey) {
  return page.evaluate(key => {
    const audit = window[key];
    audit.sample();
    audit.observer.disconnect();
    return {
      ...audit.state,
      liveIncoming: document.querySelectorAll(".deck-travel-clone:not(.is-removing)").length,
      liveOutgoing: document.querySelectorAll(".deck-travel-clone.is-removing").length
    };
  }, auditKey);
}

async function assertReplacementCandidateUnlabeled(page, key, label) {
  const presentation = await page.locator(`[data-library-card="${key}"]`).evaluate(element => ({
    active: element.classList.contains("is-replacement-candidate"),
    pseudoContent: getComputedStyle(element, "::after").content
  }));
  assert.equal(presentation.active, true, `${label} must retain the static candidate outline while the sheet is open`);
  assert.equal(/choose a position/i.test(presentation.pseudoContent), false, `${label} must not render the retired candidate pseudo-label: ${presentation.pseudoContent}`);
}

async function assertReplacementCandidateCleared(page, key, label) {
  assert.equal(await page.locator(`[data-library-card="${key}"]`).evaluate(element => element.classList.contains("is-replacement-candidate")), false, `${label} must clear replacement-candidate presentation`);
}

async function auditVisibleArmoryCards(page, label) {
  const audit = await page.evaluate(() => {
    const rendered = element => Boolean(element) && !element.hidden && element.getClientRects().length > 0 && getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden";
    const deck = new Set([...document.querySelectorAll("#builder-deck [data-deck-slot]")].map(slot => slot.dataset.cardKey).filter(Boolean));
    const cards = [...document.querySelectorAll("#card-library [data-library-card]")].filter(rendered).map(element => {
      const select = element.querySelector(".library-card__select");
      const actions = element.querySelector(".library-card__actions");
      const facts = [...element.querySelectorAll(".library-card__strengths b")];
      const textRect = fact => {
        const range = document.createRange();
        range.selectNodeContents(fact);
        return range.getBoundingClientRect();
      };
      const selectRect = select.getBoundingClientRect();
      const factRects = facts.map(textRect);
      const key = element.dataset.libraryCard;
      return {
        key,
        inDeck: deck.has(key),
        expanded: select.getAttribute("aria-expanded") === "true",
        actionsVisible: rendered(actions),
        selectHeight: selectRect.height,
        rootHeight: element.getBoundingClientRect().height,
        armoryFrame: Boolean(select.querySelector(".card-frame--armory")),
        membershipInName: /in Deck \d at draw position \d/i.test(select.getAttribute("aria-label") || ""),
        factCollision: factRects.some((rect, index) => index > 0 && factRects[index - 1].bottom > rect.top + 0.5),
        factCardOverflow: factRects.some(rect => rect.bottom > selectRect.bottom - 4 || rect.left < selectRect.left + 2 || rect.right > selectRect.right - 2),
        legacySignal: Boolean(element.querySelector(".library-card__membership, .library-card__action"))
      };
    });
    const spread = values => values.length ? Math.max(...values) - Math.min(...values) : 0;
    return {
      count: cards.length,
      selectHeightSpread: spread(cards.map(card => card.selectHeight)),
      rootHeightSpread: spread(cards.map(card => card.rootHeight)),
      expandedFailures: cards.filter(card => card.expanded || card.actionsVisible).map(card => card.key),
      frameFailures: cards.filter(card => !card.armoryFrame).map(card => card.key),
      membershipNameFailures: cards.filter(card => card.membershipInName !== card.inDeck).map(card => card.key),
      factCollisionFailures: cards.filter(card => card.factCollision).map(card => card.key),
      factCardOverflowFailures: cards.filter(card => card.factCardOverflow).map(card => card.key),
      legacySignalFailures: cards.filter(card => card.legacySignal).map(card => card.key)
    };
  });
  assert.ok(audit.count > 0, `${label} must expose visible Armory cards`);
  assert.ok(audit.selectHeightSpread <= 1, `${label} Armory card controls must have uniform heights: ${JSON.stringify(audit)}`);
  assert.ok(audit.rootHeightSpread <= 1, `${label} Armory card roots must have uniform heights: ${JSON.stringify(audit)}`);
  assert.deepEqual(audit.expandedFailures, [], `${label} must keep Info and Choose Position / In Deck signals collapsed until a card is selected`);
  assert.deepEqual(audit.frameFailures, [], `${label} cards must share the Armory frame anatomy`);
  assert.deepEqual(audit.membershipNameFailures, [], `${label} collapsed card names must preserve deck membership accessibly`);
  assert.deepEqual(audit.factCollisionFailures, [], `${label} Armory strength rows must not collide`);
  assert.deepEqual(audit.factCardOverflowFailures, [], `${label} Armory strength text must remain inside its card face`);
  assert.deepEqual(audit.legacySignalFailures, [], `${label} must not render retired always-visible membership or Choose Position footers`);
  return audit;
}

async function auditDeckLayout(page, width, height, expectedColumns, capturePath) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => { document.querySelector("#deck-screen").scrollTop = 0; });
  await page.waitForFunction(columns => {
    const grid = document.querySelector('[data-armory-grid="attack"]');
    return grid && getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length === columns;
  }, expectedColumns);
  const layout = await page.evaluate(() => {
    const visible = element => element.getClientRects().length > 0;
    const actions = [...document.querySelectorAll("#deck-screen button:not([disabled]), #deck-screen input:not([disabled]), #deck-screen select:not([disabled])")].filter(visible);
    const cards = [...document.querySelectorAll("#card-library [data-library-card]")].filter(visible);
    const rows = [...document.querySelectorAll("#builder-deck .deck-cycle-cards")];
    const nestedScrollers = [...document.querySelectorAll("#deck-screen *")].filter(element => {
      const overflow = getComputedStyle(element).overflowY;
      return (overflow === "auto" || overflow === "scroll") && element.scrollHeight > element.clientHeight + 1;
    });
    const art = document.querySelector("#card-library .card-frame--armory .card-frame__art");
    const name = document.querySelector("#card-library .card-frame--armory .card-frame__body strong");
    const strength = document.querySelector("#card-library .library-card__strengths b");
    const weaponCenterOffsets = [...document.querySelectorAll("#weapon-options .card-frame--armory")].map(frame => {
      const art = frame.querySelector(".card-frame__art").getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      return Math.abs((art.left + art.width / 2) - (frameRect.left + frameRect.width / 2));
    });
    const deckRoots = [...document.querySelectorAll("#builder-deck [data-deck-slot]")];
    const deckFaces = deckRoots.map(slot => slot.querySelector(".deck-slot__select"));
    const armoryFaces = cards.map(card => card.querySelector(".library-card__select"));
    const spread = values => Math.max(...values) - Math.min(...values);
    return {
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || document.querySelector("#deck-screen").scrollWidth > document.querySelector("#deck-screen").clientWidth,
      columns: getComputedStyle(document.querySelector('[data-armory-grid="attack"]')).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      rowSizes: rows.map(row => row.querySelectorAll(":scope > [data-deck-slot]").length),
      rowColumns: rows.map(row => getComputedStyle(row).gridTemplateColumns.split(/\s+/).filter(Boolean).length),
      labels: [...document.querySelectorAll(".deck-cycle-row__label")].map(element => element.textContent.replace(/\s+/g, " ").trim()),
      orderLabels: [...document.querySelectorAll("#builder-deck .deck-slot-order")].map(element => element.textContent.trim()),
      summary: ["deck-average-cost", "deck-attack-count", "deck-crew-count", "deck-magic-count", "deck-readiness"].every(id => Boolean(document.getElementById(id)?.textContent.trim())),
      deckTabs: document.querySelectorAll('#deck-tabs [role="tab"]').length,
      selectedTabs: document.querySelectorAll('#deck-tabs [role="tab"][aria-selected="true"]').length,
      clippedActions: actions.filter(element => { const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }).length,
      smallestAction: Math.round(Math.min(...actions.map(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height))) * 10) / 10,
      undersizedActions: actions.map(element => {
        const rect = element.getBoundingClientRect();
        return { selector: element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}.${element.className}`.replace(/\s+/g, "."), width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10 };
      }).filter(({ width, height }) => Math.min(width, height) < 48),
      smallestCard: Math.min(...cards.map(element => element.getBoundingClientRect().width)),
      artSize: art ? Math.min(art.getBoundingClientRect().width, art.getBoundingClientRect().height) : 0,
      nameSize: name ? Number.parseFloat(getComputedStyle(name).fontSize) : 0,
      strengthSize: strength ? Number.parseFloat(getComputedStyle(strength).fontSize) : 0,
      weaponCenterOffsets,
      weaponStats: [...document.querySelectorAll("#weapon-options [data-weapon-root]")].map(root => [...root.querySelectorAll(".weapon-option__strengths b")].map(stat => stat.textContent.trim())),
      deckRootHeightSpread: spread(deckRoots.map(root => root.getBoundingClientRect().height)),
      deckFaceHeightSpread: spread(deckFaces.map(face => face.getBoundingClientRect().height)),
      armoryRootHeightSpread: spread(cards.map(card => card.getBoundingClientRect().height)),
      armoryFaceHeightSpread: spread(armoryFaces.map(face => face.getBoundingClientRect().height)),
      sharedFaceHeightDelta: Math.abs(deckFaces[0].getBoundingClientRect().height - armoryFaces[0].getBoundingClientRect().height),
      sharedDeckFrames: deckFaces.every(face => face.querySelector(".card-frame--armory")),
      hiddenDisclosurePanels: [...document.querySelectorAll("#builder-deck .deck-slot__actions, #card-library .library-card__actions")].every(panel => panel.hidden && !visible(panel)),
      nestedScrollers: nestedScrollers.map(element => element.id || element.className),
      switcherBeforeArmory: Boolean(document.querySelector("#deck-tabs").compareDocumentPosition(document.querySelector("#card-library")) & Node.DOCUMENT_POSITION_FOLLOWING),
      manualSaveControls: document.querySelectorAll("#save-deck, #restore-deck, #deck-save-rail").length,
      dragControls: document.querySelectorAll('[data-slot-action="drag"], .deck-slot__drag-handle').length
    };
  });
  assert.equal(layout.horizontalOverflow, false, `${width}px Deck must not clip horizontally`);
  assert.equal(layout.columns, expectedColumns, `${width}px Armory column count`);
  assert.deepEqual(layout.rowSizes, [3, 3], "Deck must expose two labeled rows of three stable slots");
  assert.deepEqual(layout.rowColumns, [3, 3], "Deck rows must retain the 3x2 visual arrangement");
  assert.ok(layout.labels[0]?.startsWith("OPENING HAND") && layout.labels[1]?.startsWith("NEXT IN CYCLE"), "draw-order rows must remain explicitly labeled");
  assert.deepEqual(layout.orderLabels, ["#1", "#2", "#3", "#4", "#5", "#6"], "all draw positions must include a # label");
  assert.equal(layout.summary && layout.switcherBeforeArmory, true, "deck switcher and summary must remain above the Armory");
  assert.deepEqual([layout.deckTabs, layout.selectedTabs, layout.manualSaveControls], [5, 1, 0], "Deck must expose five tabs, one selected deck, and no manual Save rail");
  assert.equal(layout.clippedActions, 0, `${width}px Deck actions must remain in the viewport`);
  assert.ok(layout.smallestAction >= 48, `${width}px Deck actions must retain 48px targets: ${JSON.stringify(layout.undersizedActions)}`);
  assert.ok(layout.smallestCard >= 136, `${width}px Armory cards must remain approximately 140px wide or larger`);
  assert.ok(layout.artSize >= 88, `${width}px Armory art must remain visually dominant`);
  assert.ok(layout.nameSize >= 14 && layout.strengthSize >= 12, `${width}px Armory comparison text must remain readable`);
  assert.ok(layout.weaponCenterOffsets.every(offset => offset <= 1), `${width}px Cannon and Volley portraits must remain centered: ${JSON.stringify(layout.weaponCenterOffsets)}`);
  assert.equal(layout.weaponStats.length, 2, "both permanent weapons must expose comparison stats");
  assert.equal(layout.weaponStats.every(stats => stats.length >= 2 && stats.every(Boolean)), true, "permanent weapon stats must be visible and populated");
  assert.ok(layout.deckRootHeightSpread <= 1 && layout.deckFaceHeightSpread <= 1 && layout.armoryRootHeightSpread <= 1 && layout.armoryFaceHeightSpread <= 1 && layout.sharedFaceHeightDelta <= 1, `${width}px collapsed Deck and Armory cards must share one uniform height: ${JSON.stringify(layout)}`);
  assert.equal(layout.sharedDeckFrames && layout.hiddenDisclosurePanels, true, `${width}px selected cards must share Armory anatomy and keep action overlays collapsed`);
  assert.deepEqual(layout.nestedScrollers, [], "Deck must use its one screen scroller without nested scrolling regions");
  assert.equal(layout.dragControls, 0, `${width}px Deck must not expose a separate drag control`);
  await auditVisibleArmoryCards(page, `${width}px Deck layout`);
  const stickyGeometry = await page.evaluate(async () => {
    const screen = document.querySelector("#deck-screen");
    const header = screen.querySelector(".deck-screen-header");
    const toolbar = document.querySelector("#armory-toolbar");
    const position = getComputedStyle(toolbar).position;
    const screenRect = screen.getBoundingClientRect();
    const toolbarOffset = screen.scrollTop + toolbar.getBoundingClientRect().top - screenRect.top + 1;
    screen.scrollTop = Math.min(Math.max(0, screen.scrollHeight - screen.clientHeight), Math.max(700, toolbarOffset));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const navReachable = ["battle-tab", "open-deck"].every(id => {
      const control = document.getElementById(id);
      const rect = control.getBoundingClientRect();
      return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest(`#${id}`) === control;
    });
    return {
      position,
      headerBottom: header.getBoundingClientRect().bottom,
      toolbarTop: toolbar.getBoundingClientRect().top,
      navReachable
    };
  });
  if (stickyGeometry.position === "sticky") assert.ok(stickyGeometry.toolbarTop >= stickyGeometry.headerBottom - 1, `${width}px sticky Armory toolbar must remain below the responsive Deck header: ${JSON.stringify(stickyGeometry)}`);
  assert.equal(stickyGeometry.navReachable, true, `${width}px persistent Battle and Deck tabs must remain pointer-reachable above Deck surfaces`);
  await page.evaluate(() => { document.querySelector("#deck-screen").scrollTop = 0; });
  if (capturePath) await page.screenshot({ path: capturePath });
  return layout;
}

async function exerciseDeckInfoCoverage(page) {
  const infoAudit = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('#builder-deck [data-slot-action="info"], #card-library [data-card-action="info"], #weapon-options [data-weapon-action="info"]')];
    const failures = controls.map(control => {
      return {
        label: control.getAttribute("aria-label"),
        text: control.textContent.trim(),
        valid: control.textContent.trim() === "INFO"
      };
    }).filter(entry => !entry.valid);
    return { count: controls.length, failures, legacyGlyphs: controls.filter(control => control.textContent.trim().toLowerCase() === "i").length };
  });
  assert.equal(infoAudit.count, 37, "six Deck cards, 29 Armory cards, and two weapons must expose Info controls");
  assert.deepEqual(infoAudit.failures, [], `Info controls must use a readable INFO label: ${JSON.stringify(infoAudit.failures)}`);
  assert.equal(infoAudit.legacyGlyphs, 0, "Deck Info controls must not use the retired i-only glyph");

  await page.locator('[data-deck-slot="0"] [data-slot-action="select"]').click();
  const deckDisclosure = await page.locator('[data-deck-slot="0"] .deck-slot__actions').evaluate(element => {
    const [info, remove] = element.querySelectorAll("button");
    const root = element.closest("[data-deck-slot]");
    return {
      rootHeight: root.getBoundingClientRect().height,
      targets: [info, remove].map(control => Math.min(control.getBoundingClientRect().width, control.getBoundingClientRect().height)),
      order: info.getBoundingClientRect().bottom <= remove.getBoundingClientRect().top + 1
    };
  });
  assert.ok(deckDisclosure.targets.every(size => size >= 48) && deckDisclosure.order, "expanded Deck Info and Remove must be ordered and retain 48px targets");
  await page.keyboard.press("Escape");

  const armoryFace = page.locator('[data-library-card="phaseShield"] [data-card-action="toggle"]');
  const collapsedHeight = await page.locator('[data-library-card="phaseShield"]').evaluate(element => element.getBoundingClientRect().height);
  await armoryFace.click();
  const armoryDisclosure = await page.locator('[data-library-card="phaseShield"] .library-card__actions').evaluate(element => {
    const [info, choose] = element.querySelectorAll("button");
    const root = element.closest("[data-library-card]");
    return {
      rootHeight: root.getBoundingClientRect().height,
      targets: [info, choose].map(control => Math.min(control.getBoundingClientRect().width, control.getBoundingClientRect().height)),
      order: info.getBoundingClientRect().bottom <= choose.getBoundingClientRect().top + 1
    };
  });
  assert.ok(armoryDisclosure.targets.every(size => size >= 48) && armoryDisclosure.order, "expanded Armory Info and Choose Position must be ordered and retain 48px targets");
  assert.ok(Math.abs(armoryDisclosure.rootHeight - collapsedHeight) <= 1, "the action overlay must not change an Armory card's uniform root height");
  await armoryFace.click();

  const failures = await page.evaluate(() => {
    const problems = [];
    const inspect = (source, key, origin, definition, expectedStats) => {
      origin.click();
      const categoryKey = source === "weapon" ? "attack" : definition.category;
      const expectedMeta = `${window.GAME_DATA.categories[categoryKey].name.toUpperCase()} / ${(source === "weapon" ? "weapon" : definition.type).toUpperCase()}`;
      const actual = {
        name: document.querySelector("#deck-info-name").textContent,
        meta: document.querySelector("#deck-info-meta").textContent,
        cost: document.querySelector("#deck-info-cost").textContent,
        description: document.querySelector("#deck-info-description").textContent,
        stats: [...document.querySelectorAll("#deck-info-stats [role=listitem]")].map(element => element.textContent),
        art: document.querySelector("#deck-info-art").classList.contains(`pixel-${source}-${key}`),
        membership: document.querySelector("#deck-info-membership").textContent
      };
      if (actual.name !== definition.name.toUpperCase() || actual.meta !== expectedMeta || actual.cost !== `${definition.cost} TAPS` || actual.description !== definition.description || JSON.stringify(actual.stats) !== JSON.stringify(expectedStats) || !actual.art || !actual.membership) problems.push({ source, key, actual });
      document.querySelector("#close-deck-info").click();
    };
    for (const [key, card] of Object.entries(window.GAME_DATA.cards)) {
      const root = document.querySelector(`[data-library-card="${key}"]`);
      root.querySelector('[data-card-action="toggle"]').click();
      inspect("card", key, root.querySelector('[data-card-action="info"]'), card, window.GAME_DATA.cardStats[key]);
      root.querySelector('[data-card-action="toggle"]').click();
    }
    for (const [key, weapon] of Object.entries(window.GAME_DATA.weapons)) inspect("weapon", key, document.querySelector(`[data-weapon-root="${key}"] [data-weapon-action="info"]`), weapon, window.GAME_DATA.weaponStats[key]);
    return problems;
  });
  assert.deepEqual(failures, [], "all 29 cards and both weapons must expose complete reusable Info content");

  await armoryFace.click();
  const origin = page.locator('[data-library-card="phaseShield"] [data-card-action="info"]');
  await origin.focus();
  await origin.click();
  await assertVisible(page, "#deck-info-modal");
  await page.waitForFunction(() => document.activeElement?.id === "deck-info-name");
  assert.equal(await page.locator(".app-shell").evaluate(element => element.inert), true, "Info must inert the app shell immediately");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "close-deck-info", "Info Tab must wrap to its visible Close control");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "close-deck-info", "Info reverse Tab must remain contained on its only interactive control");
  await page.keyboard.press("Escape");
  await page.locator("#deck-info-modal").waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.matches('[data-library-card="phaseShield"] [data-card-action="info"]'));
  await origin.click();
  await page.locator("#deck-info-modal").dispatchEvent("pointerdown");
  await page.locator("#deck-info-modal").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".app-shell").evaluate(element => element.inert), false, "closing Info must restore background interaction");
  await armoryFace.click();
}

async function pointerDragDeckCard(page, from, to, mode = "commit") {
  const source = page.locator(`[data-deck-slot="${from}"] [data-slot-action="select"]`);
  const target = page.locator(`[data-deck-slot="${to}"]`);
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const [sourceBox, targetBox] = await Promise.all([source.boundingBox(), target.boundingBox()]);
  assert.ok(sourceBox && targetBox, "pointer reorder controls must have visible geometry");
  const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
  const destination = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y, { steps: 2 });
  await page.waitForFunction(() => document.querySelectorAll(".deck-drag-avatar").length === 1);
  if (mode === "cancel") {
    await page.keyboard.press("Escape");
    await page.mouse.up();
  } else if (mode === "invalid") {
    const viewportHeight = page.viewportSize()?.height || 700;
    await page.mouse.move(2, Math.max(2, Math.min(viewportHeight - 2, start.y)), { steps: 3 });
    await page.mouse.up();
  } else {
    await page.mouse.move(destination.x, destination.y, { steps: 4 });
    await page.waitForFunction(index => document.querySelector(`[data-deck-slot="${index}"]`)?.classList.contains("is-drop-target"), to);
    await page.mouse.up();
  }
  await page.waitForFunction(() => !document.querySelector(".deck-drag-avatar") && [...document.querySelectorAll("#builder-deck .deck-slot__select")].every(element => !element.style.transform));
}

async function touchDragDeckCard(context, page, from, to, mode = "commit") {
  const source = page.locator(`[data-deck-slot="${from}"] [data-slot-action="select"]`);
  const target = page.locator(`[data-deck-slot="${to}"]`);
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const [sourceBox, targetBox] = await Promise.all([source.boundingBox(), target.boundingBox()]);
  assert.ok(sourceBox && targetBox, "touch reorder controls must have visible geometry");
  const touchPoint = (box, id = 1) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2, id, radiusX: 4, radiusY: 4, force: 1 });
  const client = await context.newCDPSession(page);
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchPoint(sourceBox)] });
    await page.waitForFunction(() => document.querySelectorAll(".deck-drag-avatar").length === 1);
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touchPoint(targetBox)] });
    await page.waitForFunction(index => document.querySelector(`[data-deck-slot="${index}"]`)?.classList.contains("is-drop-target"), to);
    await client.send("Input.dispatchTouchEvent", { type: mode === "cancel" ? "touchCancel" : "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => !document.querySelector(".deck-drag-avatar") && [...document.querySelectorAll("#builder-deck .deck-slot__select")].every(element => !element.style.transform));
  } finally {
    await client.detach();
  }
}

async function touchScrollDeckFromCard(context, page, index) {
  const beforeOrder = await deckOrder(page);
  const card = page.locator(`[data-deck-slot="${index}"] [data-slot-action="select"]`);
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  assert.ok(box, "touch-scroll fixture must expose visible card geometry");
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1, radiusX: 4, radiusY: 4, force: 1 };
  const initialScroll = await page.locator("#deck-screen").evaluate(element => element.scrollTop);
  const client = await context.newCDPSession(page);
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    for (const distance of [18, 42, 72, 105]) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...start, y: start.y - distance }] });
      await page.waitForTimeout(12);
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(before => document.querySelector("#deck-screen").scrollTop > before + 40, initialScroll);
    await page.waitForTimeout(300);
  } finally {
    await client.detach();
  }
  const after = await page.evaluate(() => ({
    clones: document.querySelectorAll(".deck-drag-avatar").length,
    transforms: [...document.querySelectorAll("#builder-deck .deck-slot__select")].filter(element => element.style.transform).length,
    order: [...document.querySelectorAll("#builder-deck [data-deck-slot]")].map(slot => slot.dataset.cardKey).filter(Boolean)
  }));
  assert.deepEqual(after, { clones: 0, transforms: 0, order: beforeOrder }, "a vertical swipe starting on a Deck card must scroll naturally without starting or mutating a drag");
}

async function exerciseDeckStorageFailure(browser, port, errors) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    const nativeSetItem = Storage.prototype.setItem;
    window.__allowStorageWrites = sessionStorage.getItem("taptics-storage-recovered") === "true";
    Storage.prototype.setItem = function controlledSetItem(key, value) {
      if (!window.__allowStorageWrites) throw new DOMException("Storage unavailable", "QuotaExceededError");
      return nativeSetItem.call(this, key, value);
    };
  });
  const page = await context.newPage();
  page.on("console", message => { if (message.type() === "error") errors.push(`storage console: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`storage page: ${error.message}`));
  page.on("requestfailed", request => errors.push(`storage network: ${request.url()} ${request.failure()?.errorText || "failed"}`));
  page.on("response", response => { if (response.status() >= 400) errors.push(`storage http ${response.status()}: ${response.url()}`); });
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    const savedLobby = await page.locator("#loadout-deck [data-card-key]").evaluateAll(elements => elements.map(element => element.dataset.cardKey));
    await page.locator("#open-deck").click();
    const replacement = await page.evaluate(() => Object.keys(window.GAME_DATA.cards).find(key => !window.GAME_DATA.defaultDeck.includes(key)));
    await page.locator(`[data-library-card="${replacement}"] [data-card-action="toggle"]`).click();
    await page.locator(`[data-library-card="${replacement}"] [data-card-action="choose"]`).click();
    await page.locator('[data-replace-slot="0"]').click();
    await page.waitForFunction(() => document.querySelector("#deck-status")?.dataset.state === "error");
    const failedDraft = await deckOrder(page);
    assert.equal(failedDraft.length, 6, "a failed autosave must retain the valid editor state in memory");
    assert.equal(await page.locator("#save-deck, #restore-deck").count(), 0, "storage failure must not reintroduce manual Save controls");
    await page.locator("#battle-tab").click();
    assert.deepEqual(await page.locator("#loadout-deck [data-card-key]").evaluateAll(elements => elements.map(element => element.dataset.cardKey)), savedLobby, "failed persistence must leave the battle loadout unchanged");
    await page.locator("#open-deck").click();
    assert.deepEqual(await deckOrder(page), failedDraft, "the failed in-memory edit must remain editable");
    await page.evaluate(() => {
      window.__allowStorageWrites = true;
      sessionStorage.setItem("taptics-storage-recovered", "true");
    });
    await page.locator('[data-weapon="volley"]').click();
    await page.waitForFunction(() => document.querySelector("#deck-status")?.dataset.state === "saved");
    assert.deepEqual(await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("taptics-prototype-v3"));
      return { deck: saved.loadouts[0].deck, weapon: saved.loadouts[0].weapon, draft: saved.loadouts[0].deckDraft };
    }), { deck: failedDraft, weapon: "volley", draft: null }, "the next mutation must retry autosave and persist the retained edit after storage recovers");
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#open-deck").click();
    assert.deepEqual(await deckOrder(page), failedDraft, "the recovered autosave must survive reload");
    assert.equal(await selectedDeckWeapon(page), "volley", "the mutation that retried autosave must survive reload");
  } finally {
    await context.close();
  }
}

async function exercisePartialDeckPacking(browser, port, errors) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("console", message => { if (message.type() === "error") errors.push(`partial-deck console: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`partial-deck page: ${error.message}`));
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.locator("#open-deck").click();
    for (const expectedLength of [5, 4]) {
      await page.locator('[data-deck-slot="0"] [data-slot-action="select"]').click();
      await page.locator('[data-deck-slot="0"] [data-slot-action="remove"]').click();
      await page.waitForFunction(length => document.querySelectorAll("#builder-deck [data-deck-slot][data-card-key]:not([data-card-key=''])").length === length, expectedLength);
    }
    const packing = await page.evaluate(() => ({
      slots: document.querySelectorAll("#builder-deck [data-deck-slot]").length,
      deckLength: [...document.querySelectorAll("#builder-deck [data-deck-slot]")].filter(slot => slot.dataset.cardKey).length,
      empties: [...document.querySelectorAll('#builder-deck [data-deck-slot]:not([data-card-key]), #builder-deck [data-deck-slot][data-card-key=""]')].map(slot => {
        const control = slot.querySelector('[data-slot-action="empty"]');
        return { index: Number(slot.dataset.deckSlot), disabled: control.disabled, label: control.getAttribute("aria-label"), copy: control.querySelector("span").textContent };
      })
    }));
    assert.deepEqual(packing, {
      slots: 6,
      deckLength: 4,
      empties: [
        { index: 4, disabled: false, label: "Empty draw position 5. Choose a card from the Armory.", copy: "ADD CARD" },
        { index: 5, disabled: true, label: "Empty draw position 6. Fill draw position 5 first.", copy: "FILL #5 FIRST" }
      ]
    }, "partial drafts must keep six stable roots while enabling only the next packed position and labeling later empties");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("taptics-prototype-v3")).loadouts[0].deckDraft.deck.length), 4, "partial edits must auto-save inside their deck slot without replacing its last complete loadout");
    const insertion = await page.evaluate(() => Object.keys(window.GAME_DATA.cards).find(key => ![...document.querySelectorAll("#builder-deck [data-card-key]")].some(slot => slot.dataset.cardKey === key)));
    await page.locator(`[data-library-card="${insertion}"] [data-card-action="toggle"]`).click();
    await page.locator(`[data-library-card="${insertion}"] [data-card-action="choose"]`).click();
    assert.deepEqual(await page.locator("#deck-replacement-options .replacement-slot__position").allTextContents(), ["INSERT AS #1", "INSERT AS #2", "INSERT AS #3", "INSERT AS #4", "INSERT AS #5"], "partial decks must offer each packed insertion position explicitly");
    await page.locator('[data-replace-slot="2"]').click();
    await page.waitForFunction(() => document.querySelectorAll("#builder-deck [data-deck-slot][data-card-key]:not([data-card-key=''])").length === 5);
    assert.equal((await deckOrder(page))[2], insertion, "partial position selection must insert at the chosen # position");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("taptics-prototype-v3")).loadouts[0].deckDraft.deck.length), 5, "the inserted partial edit must auto-save immediately");
  } finally {
    await context.close();
  }
}

async function auditInitialLoading(page) {
  return page.evaluate(() => {
    const resources = performance.getEntriesByType("resource").map(entry => entry.name);
    return {
      atlases: [...new Set(resources.filter(name => /-atlas\.png(?:\?|$)/.test(name)).map(name => new URL(name).pathname.split("/").at(-1)))].sort(),
      remoteResources: resources.filter(name => new URL(name, location.href).origin !== location.origin).sort()
    };
  });
}

async function auditRuntimeAssets(page) {
  return page.evaluate(async () => {
    const response = await fetch("/assets/pixel/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Manifest request failed with ${response.status}`);
    const manifest = await response.json();
    const invalidAtlases = [];
    for (const [key, atlas] of Object.entries(manifest.atlases)) {
      try {
        const image = new Image();
        image.src = `/assets/pixel/${atlas.file}`;
        await image.decode();
        if (image.naturalWidth !== atlas.width || image.naturalHeight !== atlas.height) invalidAtlases.push(`${key}:dimensions`);
      } catch {
        invalidAtlases.push(`${key}:decode`);
      }
    }

    const structures = Object.entries(window.GAME_DATA.cards).filter(([, card]) => card.structure).map(([key]) => key);
    const checks = [
      ...Object.keys(window.GAME_DATA.cards).map(key => [`pixel-card-${key}`, "cards-atlas.png"]),
      ...Object.keys(window.GAME_DATA.weapons).map(key => [`pixel-weapon-${key}`, "weapons-atlas.png"]),
      ...structures.map(key => [`pixel-structure-${key}`, "structures-atlas.png"]),
      ...Object.keys(window.GAME_DATA.effectFamilies).map(key => [`pixel-family-${key}`, "effects-atlas.png"])
    ];
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0;pointer-events:none";
    document.body.appendChild(host);
    const invalidClasses = [];
    for (const [spriteName, sprite] of Object.entries(manifest.sprites)) {
      const node = document.createElement("i");
      node.className = `pixel-sprite pixel-${spriteName}`;
      host.appendChild(node);
      const style = getComputedStyle(node);
      const [positionX, positionY] = style.backgroundPosition.split(" ").map(Number.parseFloat);
      const atlas = manifest.atlases[sprite.atlas];
      if (!style.backgroundImage.includes(atlas.file) || Number.parseFloat(style.width) !== sprite.width || Number.parseFloat(style.height) !== sprite.height || positionX !== -sprite.x || positionY !== -sprite.y) invalidClasses.push(`pixel-${spriteName}`);
    }
    for (const [className, atlas] of checks) {
      const node = document.createElement("i");
      node.className = `pixel-sprite ${className}`;
      host.appendChild(node);
      if (!getComputedStyle(node).backgroundImage.includes(atlas)) invalidClasses.push(className);
    }
    host.remove();
    return {
      invalidAtlases,
      invalidClasses,
      coverage: {
        cards: Object.keys(window.GAME_DATA.cards).length,
        weapons: Object.keys(window.GAME_DATA.weapons).length,
        structures: structures.length,
        families: Object.keys(window.GAME_DATA.effectFamilies).length,
        sprites: Object.keys(manifest.sprites).length
      },
      criticalBytes: Object.values(manifest.atlases).filter(atlas => atlas.critical).reduce((sum, atlas) => sum + atlas.bytes, 0),
      optionalBytes: Object.values(manifest.atlases).filter(atlas => !atlas.critical).reduce((sum, atlas) => sum + atlas.bytes, 0),
      remoteResources: performance.getEntriesByType("resource").map(entry => entry.name).filter(name => new URL(name, location.href).origin !== location.origin).sort()
    };
  });
}

function parseCssColor(value) {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert.equal(channels?.length, 3, `expected an opaque computed color, received ${value}`);
  return channels;
}

function relativeLuminance(value) {
  const [red, green, blue] = parseCssColor(value).map(channel => {
    const normalized = channel / 255;
    return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
  });
  return .2126 * red + .7152 * green + .0722 * blue;
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((left, right) => right - left);
  return (values[0] + .05) / (values[1] + .05);
}

async function exerciseBattleVisualCoverage(page, phases) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.__releaseBattleFixture = {
      active: gameActive,
      snapshot: structuredClone(matchState),
      lastPhase,
      lastDoubleTaps
    };
    gameActive = false;
  });
  try {
    const structureCoverage = await page.evaluate(() => {
      const keys = Object.entries(window.GAME_DATA.cards).filter(([, card]) => card.structure).map(([key]) => key);
      renderStructures("own", { structures: keys });
      renderWall("own", { wallHp: 150, wallCap: 150, shield: 90 });
      renderWall("enemy", { wallHp: 0, wallCap: 150, shield: 0 });
      const grid = document.querySelector("#own-structures");
      return {
        keys,
        names: keys.map(key => window.GAME_DATA.cards[key].name),
        label: grid.getAttribute("aria-label"),
        listItems: grid.querySelectorAll('[role="listitem"]').length,
        emptyItems: grid.querySelectorAll('.empty[aria-hidden="true"]').length,
        illustrated: [...grid.querySelectorAll(".structure-art")].every(element => getComputedStyle(element).backgroundImage.includes("structures-atlas.png")),
        ownShielded: document.querySelector("#own-wall").classList.contains("shielded"),
        enemyBroken: document.querySelector("#enemy-wall").classList.contains("broken")
      };
    });
    assert.equal(structureCoverage.keys.length, 6, "visual structure coverage must derive all six permanent structures from GAME_DATA");
    assert.equal(structureCoverage.listItems, 6, "all six structures must expose listitem semantics");
    assert.equal(structureCoverage.emptyItems, 2, "the eight-tile village must retain two hidden empty slots");
    assert.equal(structureCoverage.illustrated, true, "all six structures must use the structures atlas");
    assert.equal(structureCoverage.names.every(name => structureCoverage.label.includes(name)), true, "the structure list label must name every built structure");
    assert.equal(structureCoverage.ownShielded && structureCoverage.enemyBroken, true, "Shielded and broken defense states must remain visually distinct");
    await page.screenshot({ path: path.join(ARTIFACTS, "phase-07-six-structures-defense-390x844.png") });

    for (const phase of phases) {
      const rendered = await page.evaluate(value => {
        hideToast();
        renderPhase(value);
        const banner = document.querySelector("#phase-banner");
        return {
          className: banner.className,
          name: document.querySelector("#phase-name").textContent,
          rule: document.querySelector("#phase-rule").textContent,
          background: getComputedStyle(banner).backgroundColor,
          nameColor: getComputedStyle(document.querySelector("#phase-name")).color,
          ruleColor: getComputedStyle(document.querySelector("#phase-rule")).color
        };
      }, phase);
      const doubleTaps = phase.tapMultiplier === 2;
      assert.match(rendered.className, new RegExp(`\\b${phase.key}\\b`), `${phase.key} must expose its phase class`);
      assert.equal(rendered.className.includes("double-taps"), doubleTaps, "the 3:00 phase must expose its non-color Double Taps state");
      assert.equal(rendered.name, doubleTaps ? "DOUBLE TAPS" : phase.key === "fortify" ? "FORTIFY" : phase.key === "clash" ? "CLASH" : "OVERLOAD");
      assert.ok(contrastRatio(rendered.nameColor, rendered.background) >= 4.5, `${rendered.name} heading contrast must meet 4.5:1`);
      assert.ok(contrastRatio(rendered.ruleColor, rendered.background) >= 4.5, `${rendered.name} rule contrast must meet 4.5:1`);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.waitForTimeout(100);
      await page.screenshot({ animations: "disabled", path: path.join(ARTIFACTS, `phase-07-${phase.key}${doubleTaps ? "-double-taps" : ""}-390x844.png`) });
    }
  } finally {
    await page.evaluate(() => {
      const saved = window.__releaseBattleFixture;
      matchState = saved.snapshot;
      lastPhase = null;
      lastDoubleTaps = false;
      render(matchState);
      gameActive = saved.active;
      lastPhase = saved.lastPhase;
      lastDoubleTaps = saved.lastDoubleTaps;
      hideToast();
      delete window.__releaseBattleFixture;
    });
  }
}

async function assertVisible(page, selector) {
  await page.locator(selector).waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await page.locator(selector).isVisible(), true);
}

async function assertFocusRing(page, selector, label) {
  const locator = page.locator(selector);
  await page.keyboard.press("Tab");
  await locator.focus();
  const focus = await locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      active: document.activeElement === element,
      visible: element.matches(":focus-visible"),
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow
    };
  });
  assert.equal(focus.active, true, `${label} must receive focus`);
  assert.equal(focus.visible, true, `${label} must expose keyboard-visible focus`);
  assert.ok(focus.outlineWidth >= 3, `${label} must retain at least a 3px outline`);
  assert.notEqual(focus.boxShadow, "none", `${label} must retain the gold outer focus ring`);
}

async function exerciseLeaveDialog(page) {
  const leave = page.locator("#leave-battle");
  const inspectableCard = page.locator("#own-action-crew");
  const toastModes = await page.evaluate(() => {
    toast("VISUAL-ONLY WARNING", "warning", false);
    const visual = document.querySelector("#toast").getAttribute("aria-live");
    hideToast();
    const hidden = document.querySelector("#toast").getAttribute("aria-live");
    toast("ANNOUNCED NOTICE");
    const announced = document.querySelector("#toast").getAttribute("aria-live");
    hideToast();
    return { visual, hidden, announced };
  });
  assert.deepEqual(toastModes, { visual: "off", hidden: "off", announced: "polite" }, "visual-only battle toasts must not duplicate the combat live announcement");
  await inspectableCard.click({ button: "right" });
  await assertVisible(page, "#card-inspector");
  await page.evaluate(() => toast("BATTLEFIELD NOTICE", "warning"));
  await assertVisible(page, "#toast");
  await leave.focus();
  await leave.click();
  await assertVisible(page, "#leave-modal");
  assert.equal(await page.locator("#card-inspector").isHidden(), true, "opening a lifecycle dialog must clear the inspector");
  assert.equal(await page.locator("#toast").isHidden(), true, "opening a lifecycle dialog must clear transient toasts");
  await page.waitForFunction(() => document.activeElement?.id === "cancel-leave");
  const openState = await page.evaluate(() => ({
    backgroundInert: document.querySelector(".app-shell").inert,
    backgroundHidden: document.querySelector(".app-shell").getAttribute("aria-hidden"),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    smallestAction: Math.min(...[...document.querySelectorAll("#leave-modal button")].map(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height)))
  }));
  assert.equal(openState.backgroundInert, true, "leave confirmation must make the background inert");
  assert.equal(openState.backgroundHidden, "true", "leave confirmation must hide background content from assistive technology");
  assert.equal(openState.horizontalOverflow, false, "leave confirmation must not clip the document");
  assert.ok(openState.smallestAction >= 48, "leave confirmation actions must retain 48px targets");
  await assertFocusRing(page, "#cancel-leave", "safe leave-dialog action");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "confirm-leave", "reverse Tab must wrap within the leave dialog");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "cancel-leave", "Tab must wrap within the leave dialog");
  for (const [width, height] of RELEASE_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const actions = [...document.querySelectorAll("#leave-modal button")].filter(element => element.getClientRects().length);
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        actionCount: actions.length,
        smallestAction: Math.min(...actions.map(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height))),
        clippedActions: actions.filter(element => { const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }).length
      };
    });
    assert.equal(layout.horizontalOverflow, false, `leave confirmation must not clip at ${width}x${height}`);
    assert.equal(layout.actionCount, 2, "leave confirmation must retain both choices");
    assert.equal(layout.clippedActions, 0, `leave confirmation actions must remain reachable at ${width}x${height}`);
    assert.ok(layout.smallestAction >= 48, `leave confirmation actions must retain 48px targets at ${width}x${height}`);
    await page.screenshot({ path: path.join(ARTIFACTS, `phase-07-leave-confirmation-${width}x${height}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#cancel-leave").click();
  await page.locator("#leave-modal").waitFor({ state: "hidden", timeout: 5000 });
  await page.waitForFunction(() => document.activeElement?.id === "leave-battle");
  assert.equal(await page.locator("#game").isVisible(), true, "Stay in Battle must cancel rather than forfeit the battle");
  await leave.click();
  await assertVisible(page, "#leave-modal");
  await page.waitForFunction(() => document.activeElement?.id === "cancel-leave");
  await page.keyboard.press("Escape");
  await page.locator("#leave-modal").waitFor({ state: "hidden", timeout: 5000 });
  await page.waitForFunction(() => document.activeElement?.id === "leave-battle");
  assert.equal(await page.locator(".app-shell").evaluate(element => element.inert), false, "canceling leave must restore background interaction");
  assert.equal(await page.locator(".app-shell").getAttribute("aria-hidden"), null, "canceling leave must restore background accessibility");
  assert.equal(await page.locator("#game").isVisible(), true, "Escape must cancel rather than forfeit the battle");
}

async function leaveBattle(page) {
  const duelsBefore = await page.evaluate(() => profile.duels);
  await page.locator("#leave-battle").click();
  await assertVisible(page, "#leave-modal");
  await page.locator("#confirm-leave").click();
  await assertVisible(page, "#lobby");
  await page.waitForTimeout(75);
  const duelsAfter = await page.evaluate(() => profile.duels);
  assert.equal(duelsAfter, duelsBefore, "the local leave flow must not invent a second authoritative result");
}

async function renderSyntheticResult(page, fixture) {
  return page.evaluate(({ winner, reason, ownCore, enemyCore, modeOverride, duplicate }) => {
    const profileBefore = JSON.parse(localStorage.getItem("taptics-prototype-v3"));
    const stats = { tapsSpent: 24, damage: 72, capWaste: 3, cardsPlayed: 7, cannons: 2, volleys: 1, wallsBuilt: 1 };
    const state = {
      players: {
        1: { coreHp: ownCore, forges: 1, glassReactors: 0, stats: { ...stats } },
        2: { coreHp: enemyCore, forges: 0, glassReactors: 1, stats: { ...stats, damage: 48 } }
      }
    };
    if (modeOverride) mode = modeOverride;
    endGame({ winner, reason, state });
    if (duplicate) endGame({ winner, reason, state });
    return {
      outcome: document.querySelector("#result-card").dataset.outcome,
      resultReason: document.querySelector("#result-card").dataset.reason,
      title: document.querySelector("#result-title").textContent,
      reason: document.querySelector("#result-reason").textContent,
      particles: document.querySelectorAll("#result-particles i").length,
      emblemClass: document.querySelector("#result-emblem").className,
      pure: window.TapticsUI.resultPresentation({ winner, reason }, 1),
      profileBefore,
      profileAfter: JSON.parse(localStorage.getItem("taptics-prototype-v3"))
    };
  }, fixture);
}

async function exerciseResultDialogs(page) {
  const cases = [
    { capture: "victory-core", outcome: "victory", winner: 1, reason: "core", ownCore: 184, enemyCore: 0, title: "VICTORY", reasonCopy: "RIVAL CORE DESTROYED", particles: 6, duplicate: true, action: "cpu-rematch" },
    { capture: "defeat-core", outcome: "defeat", winner: 2, reason: "core", ownCore: 0, enemyCore: 141, title: "DEFEAT", reasonCopy: "YOUR CORE DESTROYED", particles: 4 },
    { capture: "draw-core", outcome: "draw", winner: 0, reason: "core", ownCore: 0, enemyCore: 0, title: "STALEMATE", reasonCopy: "BOTH CORES DESTROYED", particles: 4 },
    { capture: "victory-leave", outcome: "victory", winner: 1, reason: "leave", ownCore: 212, enemyCore: 97, title: "VICTORY", reasonCopy: "RIVAL FORFEITED", particles: 6 },
    { capture: "victory-disconnect", outcome: "victory", winner: 1, reason: "disconnect", ownCore: 156, enemyCore: 88, title: "VICTORY", reasonCopy: "RIVAL CONNECTION LOST", particles: 6, modeOverride: "online", action: "online-rematch" }
  ];
  for (const fixture of cases) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#solo-button").click();
    await assertVisible(page, "#game");
    const result = await renderSyntheticResult(page, fixture);
    assert.equal(result.outcome, fixture.outcome, `${fixture.outcome} result must expose its non-color outcome state`);
    assert.equal(result.title, fixture.title, `${fixture.outcome} result title`);
    assert.equal(result.resultReason, fixture.reason, `${fixture.capture} must expose its authoritative reason state`);
    assert.equal(result.reason, fixture.reasonCopy, `${fixture.capture} result reason`);
    assert.equal(result.particles, fixture.particles, `${fixture.outcome} result particles must remain bounded`);
    assert.match(result.emblemClass, new RegExp(`pixel-result-${fixture.outcome}`), `${fixture.outcome} result must use its deterministic emblem`);
    assert.deepEqual({ outcome: result.pure.outcome, title: result.pure.title, reason: result.pure.reason }, { outcome: fixture.outcome, title: fixture.title, reason: fixture.reasonCopy }, `${fixture.capture} pure presentation must match rendered copy`);
    assert.equal(result.profileAfter.duels, result.profileBefore.duels + 1, `${fixture.capture} must record exactly one authoritative duel`);
    assert.equal(result.profileAfter.wins, result.profileBefore.wins + (fixture.winner === 1 ? 1 : 0), `${fixture.capture} must preserve win semantics`);
    assert.equal(result.profileAfter.run, fixture.winner === 1 ? result.profileBefore.run + 1 : fixture.winner === 0 ? result.profileBefore.run : 0, `${fixture.capture} must preserve streak semantics`);
    await assertVisible(page, "#result-modal");
    await page.waitForFunction(() => document.activeElement?.id === "result-title");
    assert.equal(await page.locator(".app-shell").evaluate(element => element.inert), true, "result entry must make the background inert");
    await assertFocusRing(page, "#result-title", `${fixture.capture} result heading`);
    if (fixture.outcome === "victory") {
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "again-button", "result focus must enter its first action");
      await page.keyboard.press("Shift+Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "lobby-button", "result focus must wrap within the dialog");
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "again-button", "forward result focus must remain contained");
    }
    await page.waitForTimeout(450);
    assert.equal(await page.locator("#result-card").evaluate(element => getComputedStyle(element).opacity), "1", `${fixture.capture} must remain visible after its one-shot entrance`);
    const resultViewports = fixture.capture === "victory-core" ? RELEASE_VIEWPORTS : PHONE_DESKTOP_VIEWPORTS;
    for (const [width, height] of resultViewports) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        actionCount: document.querySelectorAll("#result-modal button:not([disabled])").length,
        smallestAction: Math.min(...[...document.querySelectorAll("#result-modal button:not([disabled])")].map(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height))),
        clippedActions: [...document.querySelectorAll("#result-modal button:not([disabled])")].filter(element => { const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }).length,
        emblemImage: getComputedStyle(document.querySelector("#result-emblem")).backgroundImage
      }));
      assert.equal(layout.horizontalOverflow, false, `${fixture.outcome} result must not clip at ${width}px`);
      assert.ok(layout.actionCount > 0, `${fixture.outcome} result must retain a reachable action at ${width}px`);
      assert.equal(layout.clippedActions, 0, `${fixture.outcome} result actions must remain in the viewport at ${width}px`);
      assert.ok(layout.smallestAction >= 48, `${fixture.outcome} result actions must retain 48px targets at ${width}px`);
      assert.match(layout.emblemImage, /ui-atlas\.png/, `${fixture.outcome} result must load its local UI atlas emblem`);
      await page.screenshot({ path: path.join(ARTIFACTS, `phase-06-result-${fixture.capture}-${width}x${height}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    if (fixture.action === "cpu-rematch") {
      await page.locator("#again-button").click();
      await assertVisible(page, "#game");
      await page.waitForFunction(() => document.activeElement?.id === "arena");
      await leaveBattle(page);
    } else if (fixture.action === "online-rematch") {
      await page.locator("#again-button").click();
      await assertVisible(page, "#lobby");
      await page.getByText("CANCEL SEARCH", { exact: true }).waitFor();
      assert.equal(await page.locator("#online-button").getAttribute("aria-pressed"), "true", "online rematch must begin a fresh global search");
      await page.locator("#online-button").click();
      await page.getByText("SEARCH FOR BATTLE", { exact: true }).waitFor();
    } else {
      await page.locator("#lobby-button").click();
      await assertVisible(page, "#lobby");
    }
    assert.equal(await page.locator(".app-shell").evaluate(element => element.inert), false, "leaving a result must restore background interaction");
  }
}

async function exerciseDisconnectInterruption(page) {
  const duelsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("taptics-prototype-v3"))?.duels || 0);
  await page.locator("#solo-button").click();
  await assertVisible(page, "#game");
  await page.evaluate(() => socket.io.engine.close());
  await page.waitForFunction(() => document.querySelector("#result-card")?.dataset.outcome === "interrupted", null, { timeout: 5000 });
  await assertVisible(page, "#result-modal");
  const interruption = await page.evaluate(() => ({
    title: document.querySelector("#result-title").textContent,
    reason: document.querySelector("#result-reason").textContent,
    particles: document.querySelectorAll("#result-particles i").length,
    emblemClass: document.querySelector("#result-emblem").className,
    duels: JSON.parse(localStorage.getItem("taptics-prototype-v3"))?.duels || 0
  }));
  assert.deepEqual({ title: interruption.title, reason: interruption.reason }, { title: "CONNECTION LOST", reason: "MATCH INTERRUPTED" });
  assert.equal(interruption.particles, 0, "a local interruption must not create result celebration particles");
  assert.match(interruption.emblemClass, /pixel-status-warning/, "a local interruption must use the warning sprite rather than a defeat emblem");
  assert.equal(interruption.duels, duelsBefore, "a local interruption must not update the saved record");
  await page.waitForFunction(() => document.querySelector("#again-button")?.disabled === false, null, { timeout: 8000 });
  for (const [width, height] of PHONE_DESKTOP_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `interruption result must not clip at ${width}px`);
    await page.screenshot({ path: path.join(ARTIFACTS, `phase-07-result-interrupted-${width}x${height}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#lobby-button").click();
  await assertVisible(page, "#lobby");
}

run().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
