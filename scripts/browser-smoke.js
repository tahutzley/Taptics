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
      assert.deepEqual(migrated.deck, fixture.expectedDeck, `${fixture.name} deck migration`);
      assert.equal(migrated.weapon, fixture.expectedWeapon, `${fixture.name} weapon migration`);
      assert.equal(migrated.version, 5, `${fixture.name} profile version`);
      if (Object.hasOwn(fixture, "expectedDraft")) assert.deepEqual(migrated.deckDraft, fixture.expectedDraft, `${fixture.name} draft migration`);
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
    assert.equal(await page.locator("#weapon-options [data-weapon]").count(), 2, "Deck must expose both illustrated weapons");
    await assertFocusRing(page, '[data-weapon="cannon"]', "selected Deck weapon");
    assert.equal(await page.locator("#deck-details").count(), 1, "Deck details must remain bounded to one surface");
    assert.equal(await page.locator('[data-deck-slot="0"] [data-slot-action="left"]').isEnabled(), false, "first card cannot move left");
    assert.equal(await page.locator('[data-deck-slot="5"] [data-slot-action="right"]').isEnabled(), false, "last card cannot move right");
    assert.equal(await page.evaluate(() => Boolean(document.querySelector("#save-deck").compareDocumentPosition(document.querySelector("#card-library")) & Node.DOCUMENT_POSITION_FOLLOWING)), true, "Save must remain above the long library");
    await page.evaluate(() => { window.__deckRootRefs = { slots: [...document.querySelectorAll("[data-deck-slot]")], cards: [...document.querySelectorAll("[data-library-card]")], details: document.querySelector("#deck-details") }; });

    for (const [width, height] of RELEASE_VIEWPORTS) {
      await page.setViewportSize({ width, height });
      const deckLayout = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || document.querySelector("#deck-screen").scrollWidth > document.querySelector("#deck-screen").clientWidth,
        actionCount: [...document.querySelectorAll("#deck-screen button:not([disabled])")].filter(element => element.getClientRects().length).length,
        clippedActions: [...document.querySelectorAll("#deck-screen button:not([disabled])")].filter(element => element.getClientRects().length).filter(element => { const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }).length,
        smallestAction: Math.min(...[...document.querySelectorAll("#deck-screen button:not([disabled])")].filter(element => element.getClientRects().length).map(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height))),
        illustratedCards: [...document.querySelectorAll("#card-library .card-frame__art")].every(element => getComputedStyle(element).backgroundImage.includes("cards-atlas.png")),
        illustratedWeapons: [...document.querySelectorAll("#weapon-options .card-frame__art")].every(element => getComputedStyle(element).backgroundImage.includes("weapons-atlas.png"))
      }));
      assert.equal(deckLayout.horizontalOverflow, false, `${width}px Deck must not clip horizontally`);
      assert.ok(deckLayout.actionCount > 0, "Deck must retain reachable actions");
      assert.equal(deckLayout.clippedActions, 0, `${width}px Deck actions must remain in the viewport`);
      assert.ok(deckLayout.smallestAction >= 48, `${width}px Deck actions must retain 48px targets`);
      assert.equal(deckLayout.illustratedCards, true, "all Deck cards must use catalogue portraits");
      assert.equal(deckLayout.illustratedWeapons, true, "both Deck weapons must use catalogue portraits");
      await page.screenshot({ path: path.join(ARTIFACTS, `phase-05-deck-${width}x${height}.png`) });
    }
    const scaledContext = await browser.newContext({
      viewport: { width: 320, height: 700 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce"
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
    const scaledLayout = await scaledPage.evaluate(() => ({
      deviceScaleFactor: devicePixelRatio,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || document.querySelector("#deck-screen").scrollWidth > document.querySelector("#deck-screen").clientWidth,
      smallestAction: Math.min(...[...document.querySelectorAll("#deck-screen button:not([disabled])")].filter(element => element.getClientRects().length).map(element => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height)))
    }));
    assert.equal(scaledLayout.deviceScaleFactor, 2, "scaled Deck fixture must render at 2x device scale");
    assert.equal(scaledLayout.horizontalOverflow, false, "2x device-scale Deck must not clip horizontally");
    assert.ok(scaledLayout.smallestAction >= 48, "2x device-scale Deck actions must retain 48px CSS targets");
    const scaledFirstKey = await scaledPage.locator('[data-deck-slot="0"]').getAttribute("data-card-key");
    await scaledPage.locator(`[data-library-card="${scaledFirstKey}"] [data-card-action="toggle"]`).press(" ");
    await scaledPage.locator(`[data-library-card="${scaledFirstKey}"] [data-card-action="toggle"]`).press("Enter");
    await scaledPage.locator(`[data-card-key="${scaledFirstKey}"][data-slot-action="left"]`).press("Enter");
    const reducedDeckState = await scaledPage.evaluate(() => {
      const visible = [...document.querySelectorAll("#deck-screen *")].filter(element => element.getClientRects().length);
      return {
        status: document.querySelector("#deck-status").dataset.state,
        animations: visible.filter(element => getComputedStyle(element).animationName !== "none").length,
        transitions: visible.filter(element => getComputedStyle(element).transitionDuration.split(",").some(duration => Number.parseFloat(duration) > 0)).length,
        flights: document.querySelectorAll(".card-flight").length
      };
    });
    assert.equal(reducedDeckState.status, "dirty", "reduced-motion Deck mutations must retain normal state changes");
    assert.deepEqual([reducedDeckState.animations, reducedDeckState.transitions, reducedDeckState.flights], [0, 0, 0], "reduced-motion Deck must update without animations, transitions, or flight clones");
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

    const storageFailureContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    await storageFailureContext.addInitScript(() => {
      Storage.prototype.setItem = function setItemUnavailable() { throw new DOMException("Storage unavailable", "QuotaExceededError"); };
    });
    const storageFailurePage = await storageFailureContext.newPage();
    storageFailurePage.on("console", message => { if (message.type() === "error") errors.push(`storage console: ${message.text()}`); });
    storageFailurePage.on("pageerror", error => errors.push(`storage page: ${error.message}`));
    await storageFailurePage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    const durableFallbackDeck = await storageFailurePage.locator("#loadout-deck [data-card-key]").evaluateAll(elements => elements.map(element => element.dataset.cardKey));
    await storageFailurePage.locator("#open-deck").click();
    const storageFirstKey = await storageFailurePage.locator('[data-deck-slot="0"]').getAttribute("data-card-key");
    await storageFailurePage.locator(`[data-library-card="${storageFirstKey}"] [data-card-action="toggle"]`).click();
    assert.equal(await storageFailurePage.locator("#deck-status").getAttribute("data-state"), "error", "failed draft persistence must stay operable and report an error");
    await storageFailurePage.locator(`[data-library-card="${storageFirstKey}"] [data-card-action="toggle"]`).click();
    await storageFailurePage.locator("#save-deck").click();
    assert.equal(await storageFailurePage.locator("#deck-status").getAttribute("data-state"), "error", "failed Save must not claim success");
    await storageFailurePage.waitForFunction(() => /not saved/i.test(document.querySelector("#deck-announcer")?.textContent || ""));
    assert.match(await storageFailurePage.locator("#deck-announcer").textContent(), /not saved/i);
    await storageFailurePage.locator("#battle-tab").click();
    assert.deepEqual(await storageFailurePage.locator("#loadout-deck [data-card-key]").evaluateAll(elements => elements.map(element => element.dataset.cardKey)), durableFallbackDeck, "failed Save must not change the in-memory battle loadout");
    await storageFailureContext.close();
    await page.setViewportSize({ width: 390, height: 844 });

    const detailCoverage = await page.evaluate(() => Object.entries(window.GAME_DATA.cards).map(([key, card]) => {
      document.querySelector(`[data-library-card="${key}"] [data-card-action="details"]`).click();
      const shownStats = [...document.querySelectorAll("#deck-detail-stats b")].map(element => element.textContent);
      return {
        key,
        frame: document.querySelector("#deck-detail-frame [data-card-key]")?.dataset.cardKey,
        name: document.querySelector("#deck-detail-name").textContent,
        category: document.querySelector("#deck-detail-category").textContent,
        description: document.querySelector("#deck-detail-description").textContent,
        stats: shownStats,
        expectedName: card.name.toUpperCase(),
        expectedCategory: `${window.GAME_DATA.categories[card.category].name.toUpperCase()} / ${card.type.toUpperCase()} / ${card.cost} TAPS`,
        expectedDescription: card.description,
        expectedStats: window.GAME_DATA.cardStats[key]
      };
    }));
    assert.ok(detailCoverage.every(item => item.frame === item.key && item.name === item.expectedName && item.category === item.expectedCategory && item.description === item.expectedDescription && JSON.stringify(item.stats) === JSON.stringify(item.expectedStats)), "every card must expose complete shared-frame details and stats");

    for (const [filter, expected, key] of [["attack", 6, "Enter"], ["crew", 14, " "], ["magic", 9, "Enter"], ["all", 29, " "]]) {
      await page.locator(`[data-deck-filter="${filter}"]`).press(key);
      assert.equal(await page.locator("#card-library [data-library-card]:visible").count(), expected, `${filter} filter count`);
      assert.equal(await page.locator(`[data-deck-filter="${filter}"]`).getAttribute("aria-pressed"), "true");
    }
    const initialSavedDeck = await page.evaluate(() => JSON.parse(localStorage.getItem("taptics-prototype-v3")).deck);
    const selectedKey = initialSavedDeck[0];
    const replacementKey = catalogue.cards.find(key => !initialSavedDeck.includes(key));
    assert.equal(await page.locator(`[data-library-card="${replacementKey}"] [data-card-action="toggle"]`).isEnabled(), false, "full Deck must disable only unselected Add actions");
    assert.equal(await page.locator(`[data-library-card="${replacementKey}"] [data-card-action="details"]`).isEnabled(), true, "full Deck must keep details available");
    const selectedToggle = page.locator(`[data-library-card="${selectedKey}"] [data-card-action="toggle"]`);
    const replacementToggle = page.locator(`[data-library-card="${replacementKey}"] [data-card-action="toggle"]`);
    await selectedToggle.evaluate(element => { element.scrollIntoView({ block: "center" }); element.focus({ preventScroll: true }); });
    await page.waitForFunction(key => document.activeElement === document.querySelector(`[data-library-card="${key}"] [data-card-action="toggle"]`), selectedKey);
    const selectionScroll = await page.locator("#deck-screen").evaluate(element => element.scrollTop);
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#deck-status").getAttribute("data-state"), "invalid");
    assert.equal(await page.locator("#builder-count").textContent(), "5 / 6");
    assert.equal(await page.evaluate(key => document.activeElement === document.querySelector(`[data-library-card="${key}"] [data-card-action="toggle"]`), selectedKey), true, "library focus must survive removal");
    assert.ok(Math.abs(await page.locator("#deck-screen").evaluate(element => element.scrollTop) - selectionScroll) <= 2, "library selection must preserve scroll");
    await replacementToggle.press("Enter");
    assert.equal(await page.locator("#deck-status").getAttribute("data-state"), "dirty");
    assert.equal(await replacementToggle.getAttribute("aria-pressed"), "true");
    const draftBeforeLeave = await page.evaluate(() => ({ deck: [...document.querySelectorAll("[data-deck-slot]")].map(slot => slot.dataset.cardKey).filter(Boolean), weapon: document.querySelector("#weapon-options [aria-pressed=true]").dataset.weapon }));
    await page.locator('[data-weapon="volley"]').press(" ");
    draftBeforeLeave.weapon = "volley";
    await page.locator("#battle-tab").click();
    await assertVisible(page, "#lobby");
    assert.deepEqual(await page.locator("#loadout-deck [data-card-key]").evaluateAll(elements => elements.map(element => element.dataset.cardKey)), initialSavedDeck, "unsaved draft must not alter the battle loadout");
    assert.equal(await page.locator("#loadout-weapon-name").textContent(), "CANNON");
    await page.locator("#open-deck").click();
    assert.deepEqual(await page.locator("[data-deck-slot]").evaluateAll(elements => elements.map(element => element.dataset.cardKey).filter(Boolean)), draftBeforeLeave.deck, "Battle navigation must preserve the exact draft");
    assert.equal(await page.locator('[data-weapon="volley"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#deck-status").getAttribute("data-state"), "dirty");
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#open-deck").click();
    assert.deepEqual(await page.locator("[data-deck-slot]").evaluateAll(elements => elements.map(element => element.dataset.cardKey).filter(Boolean)), draftBeforeLeave.deck, "persisted unsaved draft must survive reload");
    assert.equal(await page.locator('[data-weapon="volley"]').getAttribute("aria-pressed"), "true");
    await page.locator("#restore-deck").click();
    assert.equal(await page.locator("#deck-status").getAttribute("data-state"), "saved");
    await page.evaluate(() => {
      window.__deckRootRefs = { slots: [...document.querySelectorAll("[data-deck-slot]")], cards: [...document.querySelectorAll("[data-library-card]")], details: document.querySelector("#deck-details") };
      window.__deckDomCount = document.querySelectorAll("*").length;
    });
    for (let visit = 0; visit < 10; visit += 1) {
      await page.locator("#battle-tab").click();
      await page.locator("#open-deck").click();
    }
    const repeatedDeck = await page.evaluate(() => ({
      nodes: document.querySelectorAll("*").length,
      cards: document.querySelectorAll("[data-library-card]").length,
      details: document.querySelectorAll("#deck-details").length,
      stable: window.__deckRootRefs.slots.every((node, index) => node === document.querySelectorAll("[data-deck-slot]")[index]) && window.__deckRootRefs.cards.every((node, index) => node === document.querySelectorAll("[data-library-card]")[index]) && window.__deckRootRefs.details === document.querySelector("#deck-details")
    }));
    assert.deepEqual(repeatedDeck, { nodes: await page.evaluate(() => window.__deckDomCount), cards: 29, details: 1, stable: true }, "repeated Deck visits must not accumulate nodes or replace stable roots");

    const slotRemove = page.locator(`[data-card-key="${selectedKey}"][data-slot-action="remove"]`);
    await slotRemove.evaluate(element => { element.scrollIntoView({ block: "center" }); element.focus({ preventScroll: true }); });
    const slotRemovalScroll = await page.locator("#deck-screen").evaluate(element => element.scrollTop);
    await slotRemove.press(" ");
    assert.equal(await page.locator("#builder-count").textContent(), "5 / 6", "slot Remove must work from the keyboard");
    assert.ok(Math.abs(await page.locator("#deck-screen").evaluate(element => element.scrollTop) - slotRemovalScroll) <= 2, "slot removal must preserve Deck scroll");
    await page.locator("#restore-deck").click();

    const allCardToggleFailures = await page.evaluate(() => {
      const failures = [];
      for (const entry of document.querySelectorAll("[data-library-card].selected")) entry.querySelector('[data-card-action="toggle"]').click();
      for (const entry of document.querySelectorAll("[data-library-card]")) {
        const toggle = entry.querySelector('[data-card-action="toggle"]');
        toggle.click();
        if (!entry.classList.contains("selected") || toggle.getAttribute("aria-pressed") !== "true") failures.push(`${entry.dataset.libraryCard}:add`);
        toggle.click();
        if (entry.classList.contains("selected") || toggle.getAttribute("aria-pressed") !== "false") failures.push(`${entry.dataset.libraryCard}:remove`);
      }
      return failures;
    });
    assert.deepEqual(allCardToggleFailures, [], "all 29 cards must support add and remove through the delegated control");
    await page.locator("#restore-deck").click();

    const reorderControl = page.locator('button[data-card-key="timeBomb"][data-slot-action="left"]');
    await reorderControl.evaluate(element => { element.scrollIntoView({ block: "center" }); element.focus({ preventScroll: true }); });
    const reorderScroll = await page.locator("#deck-screen").evaluate(element => element.scrollTop);
    await reorderControl.press("Enter");
    await page.waitForFunction(() => document.activeElement?.dataset.cardKey === "timeBomb" && document.activeElement?.dataset.slotAction === "left");
    const savedOrder = [initialSavedDeck[0], initialSavedDeck[1], initialSavedDeck[2], "timeBomb", "tapForge", "suppressingFire"];
    assert.deepEqual(await page.locator("[data-deck-slot]").evaluateAll(elements => elements.map(element => element.dataset.cardKey)), savedOrder, "Move Left must preserve exact draw order");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.cardKey === "timeBomb" && document.activeElement?.dataset.slotAction === "left"), true, "reorder focus must follow the same card control");
    assert.ok(Math.abs(await page.locator("#deck-screen").evaluate(element => element.scrollTop) - reorderScroll) <= 2, "reordering must preserve Deck scroll");
    await page.locator('[data-weapon="volley"]').press(" ");
    assert.equal(await page.locator('[data-weapon="volley"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('[data-weapon="cannon"]').getAttribute("aria-pressed"), "false");
    const stableRoots = await page.evaluate(() => Boolean(window.__deckRootRefs) && window.__deckRootRefs.slots.every((node, index) => node === document.querySelectorAll("[data-deck-slot]")[index]) && window.__deckRootRefs.cards.every((node, index) => node === document.querySelectorAll("[data-library-card]")[index]) && window.__deckRootRefs.details === document.querySelector("#deck-details"));
    assert.equal(stableRoots, true, "Deck slot and library roots must remain stable across updates");
    await page.locator("#save-deck").click();
    assert.equal(await page.locator("#deck-status").getAttribute("data-state"), "saving");
    await page.waitForFunction(() => document.querySelector("#deck-status")?.dataset.state === "saved", null, { timeout: 5000 });
    assert.equal(await page.locator("#deck-screen").isVisible(), true, "Save must stay on Deck");
    const storedLoadout = await page.evaluate(() => JSON.parse(localStorage.getItem("taptics-prototype-v3")));
    assert.deepEqual(storedLoadout.deck, savedOrder);
    assert.equal(storedLoadout.weapon, "volley");
    assert.equal(storedLoadout.deckDraft, null);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#open-deck").click();
    assert.deepEqual(await page.locator("[data-deck-slot]").evaluateAll(elements => elements.map(element => element.dataset.cardKey)), savedOrder, "saved order must survive reload");
    assert.equal(await page.locator('[data-weapon="volley"]').getAttribute("aria-pressed"), "true", "saved weapon must survive reload");
    assert.equal(await page.locator("#deck-status").getAttribute("data-state"), "saved");

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
    assert.equal(await page.locator("#next-card-label").textContent(), "NEXT: HOURGLASS CURSE", "CPU battle must use the saved queue order");
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
      const profile = JSON.parse(localStorage.getItem(key)) || { version: 4, duels: 0, wins: 0, run: 0, bestRun: 0, challenge: 0, challengeComplete: false, recent: [], deck: [...window.GAME_DATA.defaultDeck], weapon: "cannon" };
      profile.weapon = "volley";
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
      profile.deck = ["scavenger", "emergencyCache", "phaseShield", "piercingShot", "timeBomb", "suppressingFire"];
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
      profile.deck = ["tapForge", "phaseShield", "piercingShot", "scavenger", "timeBomb", "suppressingFire"];
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
      profile.deck = ["timeBomb", "scavenger", "piercingShot", "phaseShield", "emergencyCache", "suppressingFire"];
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
      resultParticles: document.querySelector("#result-particles").children.length,
      transientHidden: ["#card-inspector", "#toast", "#leave-modal", "#result-modal"].every(selector => document.querySelector(selector).classList.contains("hidden")),
      singletonSurfaces: ["#card-inspector", "#toast", "#leave-modal", "#result-modal", "#deck-details"].every(selector => document.querySelectorAll(selector).length === 1),
      listeners: Object.fromEntries(["queueStatus", "matchFound", "state", "gameOver", "disconnect", "connect"].map(event => [event, socket.listeners(event).length]))
    }));
    assert.ok(finalLifecycle.nodes < 1200, `repeated matches must keep the final DOM bounded; observed ${finalLifecycle.nodes} nodes`);
    assert.ok([0, 29].includes(finalLifecycle.libraryCards), "repeated matches must retain either the lazy-unopened or one complete bounded Deck catalogue");
    assert.deepEqual([finalLifecycle.effectNodes, finalLifecycle.cardFlights, finalLifecycle.resultParticles], [0, 0, 0], "returning to the lobby must clear all transient presentation nodes");
    assert.equal(finalLifecycle.transientHidden && finalLifecycle.singletonSurfaces, true, "repeated matches must leave one hidden transient surface of each kind");
    assert.deepEqual(finalLifecycle.listeners, { queueStatus: 1, matchFound: 1, state: 1, gameOver: 1, disconnect: 1, connect: 1 }, "repeated matches must not accumulate Socket.IO listeners");
    assert.deepEqual(errors, [], errors.join("\n"));
    process.stdout.write(`Browser smoke passed; ${fs.readdirSync(ARTIFACTS).length} captures in ${path.relative(ROOT, ARTIFACTS)}; identical renders: ${renderBenchmark.iterations} in ${renderBenchmark.durationMs.toFixed(1)}ms with ${renderBenchmark.mutations} mutations; final DOM: ${finalLifecycle.nodes} nodes\n`);
  } finally {
    await browser.close();
    await closeServer();
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
