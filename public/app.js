const socket = io();
const DATA = window.GAME_DATA;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
function setText(element, value) {
  const text = String(value);
  if (element.textContent !== text) element.textContent = text;
}
function setAttribute(element, name, value) {
  const text = String(value);
  if (element.getAttribute(name) !== text) element.setAttribute(name, text);
}
function setStyle(element, name, value) {
  const text = String(value);
  if (element.style.getPropertyValue(name) !== text) element.style.setProperty(name, text);
}
function setDataset(element, name, value) {
  const text = String(value);
  if (element.dataset[name] !== text) element.dataset[name] = text;
}
function toggleClass(element, name, force) {
  const enabled = Boolean(force);
  if (element.classList.contains(name) !== enabled) element.classList.toggle(name, enabled);
}
function actionUnavailable(element) {
  return Boolean(element?.disabled || element?.getAttribute("aria-disabled") === "true");
}
const SAVE_KEY = "taptics-prototype-v3";
const MAX_SAVED_DECKS = 5;
const PHASE_COPY = {
  fortify: { number: "01", kicker: "OPENING PHASE", name: "FORTIFY", rule: "Damage reduced 25%" },
  clash: { number: "02", kicker: "MIDDLE PHASE", name: "CLASH", rule: "Core shields are down" },
  overload: { number: "03", kicker: "ELIMINATION PHASE", name: "OVERLOAD", rule: "Damage rising - Walls weakening" }
};
const CHALLENGES = [
  { title: "Win with one economy engine", copy: "Finish a CPU duel after constructing no more than one Bellows Guild or Alchemist's Furnace.", test: (me, won) => won && me.forges + me.glassReactors <= 1 },
  { title: "Land three weapon hits", copy: "Use your permanent Cannon or Volley at least three times in one duel.", test: me => me.stats.cannons + me.stats.volleys >= 3 },
  { title: "Raise two defenses", copy: "Resolve Timber Rampart or Stone Bulwark twice while managing your rotating hand.", test: me => me.stats.wallsBuilt >= 2 },
  { title: "Waste less than five seconds", copy: "Keep the reserve productive instead of sitting at the 40-tap cap.", test: me => me.stats.capWaste < 5 }
];

let profile = loadProfile();
let builderDeckIndex = profile.selectedDeck;
let builderDeck = [];
let builderWeapon = "cannon";
let builderFilter = "all";
let builderSearch = "";
let builderSort = "recommended";
let activeDeckSlot = -1;
let replacementCandidate = null;
let deckUndoState = null;
let deckKeyboardDrag = null;
let deckPointerDrag = null;
let suppressDeckClick = false;
let deckMotionSequence = 0;
let deckReflowSequence = 0;
let deckTravelClone = null;
let deckRemovalClone = null;
let deckUndoTimer = null;
let deckOpenedOnce = false;
let deckHintDismissed = Boolean(profile.deckHintDismissed);
let deckHeaderObserver = null;
let deckBuilderLoaded = false;
let deckCatalogueReady = false;
let deckScrollTop = 0;
let deckStorageError = false;
let expandedArmoryKey = null;
const volatileBuilderLoadouts = new Map();
let matchState = null;
let ownSide = 1;
let mode = "cpu";
let gameActive = false;
let searching = false;
let lastEventId = 0;
let lastPhase = null;
let lastDoubleTaps = false;
let soundEnabled = true;
let audioContext = null;
let toastTimer = null;
let toastSequence = 0;
let inspectedElement = null;
let activeDialog = null;
let dialogReturnFocus = null;
let resultParticleTimer = null;
let connectionInterrupted = false;
let rematchPending = false;
let hasConnected = false;

function defaultLoadout() { return { deck: [...DATA.defaultDeck], weapon: "cannon", deckDraft: null }; }
function defaultProfile() {
  return { version: 6, duels: 0, wins: 0, run: 0, bestRun: 0, challenge: 0, challengeComplete: false, recent: [], loadouts: Array.from({ length: MAX_SAVED_DECKS }, defaultLoadout), activeDeck: 0, selectedDeck: 0 };
}
function ownsDefinition(registry, key) { return typeof key === "string" && Object.hasOwn(registry, key); }
function isValidDeck(deck) {
  return Array.isArray(deck) && deck.length === DATA.deckSize && new Set(deck).size === DATA.deckSize && deck.every(key => ownsDefinition(DATA.cards, key));
}
function isValidDeckDraft(draft) {
  return Boolean(draft) && Array.isArray(draft.deck) && draft.deck.length <= DATA.deckSize && new Set(draft.deck).size === draft.deck.length && draft.deck.every(key => ownsDefinition(DATA.cards, key)) && ownsDefinition(DATA.weapons, draft.weapon);
}
function sameOrderedDeck(left, right) { return left.length === right.length && left.every((key, index) => key === right[index]); }
function normalizedLoadout(value, fallback = defaultLoadout()) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const deck = isValidDeck(source.deck) ? [...source.deck] : [...fallback.deck];
  const weapon = ownsDefinition(DATA.weapons, source.weapon) ? source.weapon : fallback.weapon;
  if (isValidDeckDraft(source.deckDraft) && isValidDeck(source.deckDraft.deck)) {
    return { deck: [...source.deckDraft.deck], weapon: source.deckDraft.weapon, deckDraft: null };
  }
  const deckDraft = isValidDeckDraft(source.deckDraft) && (!sameOrderedDeck(source.deckDraft.deck, deck) || source.deckDraft.weapon !== weapon) ? { deck: [...source.deckDraft.deck], weapon: source.deckDraft.weapon } : null;
  return { deck, weapon, deckDraft };
}
function loadProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY));
    const base = defaultProfile();
    const saved = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    const legacyLoadout = normalizedLoadout({ deck: saved.deck, weapon: saved.weapon, deckDraft: saved.deckDraft });
    const suppliedLoadouts = Array.isArray(saved.loadouts) ? saved.loadouts : null;
    const loadouts = Array.from({ length: MAX_SAVED_DECKS }, (_, index) => normalizedLoadout(suppliedLoadouts && Object.hasOwn(suppliedLoadouts, index) ? suppliedLoadouts[index] : (!suppliedLoadouts && index === 0 ? legacyLoadout : null)));
    const activeDeck = Number.isInteger(saved.activeDeck) && saved.activeDeck >= 0 && saved.activeDeck < MAX_SAVED_DECKS ? saved.activeDeck : 0;
    const selectedDeck = Number.isInteger(saved.selectedDeck) && saved.selectedDeck >= 0 && saved.selectedDeck < MAX_SAVED_DECKS ? saved.selectedDeck : activeDeck;
    const { deck: _legacyDeck, weapon: _legacyWeapon, deckDraft: _legacyDraft, loadouts: _savedLoadouts, activeDeck: _savedActiveDeck, selectedDeck: _savedSelectedDeck, ...savedProfile } = saved;
    const normalized = { ...base, ...savedProfile, version: 6, loadouts, activeDeck, selectedDeck };
    localStorage.setItem(SAVE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    const base = defaultProfile();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(base)); } catch { /* Storage can be unavailable without blocking play. */ }
    return base;
  }
}
function saveProfile(candidate = profile) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(candidate));
    return true;
  } catch {
    return false;
  }
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function other(side) { return side === 1 ? 2 : 1; }
function me() { return matchState?.players?.[ownSide]; }
function rival() { return matchState?.players?.[other(ownSide)]; }
function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
function savedLoadout(index = profile.activeDeck) { return profile.loadouts[index] || profile.loadouts[0]; }
function loadout() {
  const active = savedLoadout();
  return { deck: [...active.deck], weapon: active.weapon };
}
function currentRating() { return Math.max(0, 1000 + profile.wins * 30 - (profile.duels - profile.wins) * 20); }
function resultPresentation({ winner, reason } = {}, side = ownSide, interruption = false) {
  if (interruption) return Object.freeze({ outcome: "interrupted", title: "CONNECTION LOST", reason: "MATCH INTERRUPTED", copy: "This duel cannot be resumed. Your local record was not changed.", emblem: "status-warning", warning: true, tone: 120 });
  const draw = winner === 0;
  const won = winner === side;
  const outcome = draw ? "draw" : won ? "victory" : "defeat";
  const reasonCopy = reason === "leave" ? "RIVAL FORFEITED" : reason === "disconnect" ? "RIVAL CONNECTION LOST" : draw ? "BOTH CORES DESTROYED" : won ? "RIVAL CORE DESTROYED" : "YOUR CORE DESTROYED";
  const copy = draw ? "Both cores fell in the same final exchange." : reason === "leave" ? won ? "The rival left the field. Your saved strategy earns the victory." : "You left the field before the duel was decided." : reason === "disconnect" ? won ? "The rival connection failed. The server awarded you the duel." : "The connection ended before the battle could continue." : won ? "Your six-card cycle destroyed the rival core." : "The rival sequence broke through and destroyed your core.";
  return Object.freeze({ outcome, title: draw ? "STALEMATE" : won ? "VICTORY" : "DEFEAT", reason: reasonCopy, copy, emblem: `result-${outcome}`, warning: reason !== "core", tone: won ? 520 : draw ? 240 : 120 });
}

function announceLifecycle(message) {
  const status = $("#lifecycle-status");
  status.textContent = "";
  requestAnimationFrame(() => { status.textContent = message; });
}
function setBackgroundInert(value) {
  const shell = $(".app-shell");
  shell.inert = value;
  shell.toggleAttribute("inert", value);
  if (value) shell.setAttribute("aria-hidden", "true");
  else shell.removeAttribute("aria-hidden");
}
function dialogControls(dialog) {
  return $$(`#${dialog.id} button:not([disabled]), #${dialog.id} [href], #${dialog.id} [tabindex]:not([tabindex="-1"])`).filter(element => !element.closest(".hidden"));
}
function openLifecycleDialog(dialog, initialFocus, returnFocus = document.activeElement) {
  hideCardInspector();
  hideToast();
  if (activeDialog && activeDialog !== dialog) activeDialog.classList.add("hidden");
  activeDialog = dialog;
  dialogReturnFocus = returnFocus instanceof HTMLElement ? returnFocus : null;
  setBackgroundInert(true);
  dialog.classList.remove("hidden");
  requestAnimationFrame(() => initialFocus?.focus({ preventScroll: true }));
}
function closeLifecycleDialog(dialog, { restoreFocus = true } = {}) {
  dialog.classList.add("hidden");
  if (activeDialog !== dialog) return;
  activeDialog = null;
  setBackgroundInert(false);
  const returnFocus = dialogReturnFocus;
  dialogReturnFocus = null;
  if (restoreFocus && returnFocus?.isConnected && !returnFocus.closest(".hidden")) requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
}
function closeAllLifecycleDialogs() {
  $("#leave-modal").classList.add("hidden");
  $("#result-modal").classList.add("hidden");
  $("#deck-info-modal").classList.add("hidden");
  $("#deck-replace-modal").classList.add("hidden");
  if (replacementCandidate) $(`[data-library-card="${replacementCandidate}"]`)?.classList.remove("is-replacement-candidate");
  replacementCandidate = null;
  activeDialog = null;
  dialogReturnFocus = null;
  setBackgroundInert(false);
  clearResultParticles();
  clearDeckMotion();
}

const CARD_FRAME_VARIANTS = new Set(["lobby", "battle", "queued", "deck", "armory", "detail"]);
function escapeMarkup(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function cardFrame(key, options = {}) {
  const source = options.source === "weapon" ? "weapon" : "card";
  const registry = source === "weapon" ? DATA.weapons : DATA.cards;
  if (!ownsDefinition(registry, key)) return "";
  const card = registry[key];
  const categoryKey = source === "weapon" ? "attack" : card.category;
  const category = DATA.categories[categoryKey];
  const type = source === "weapon" ? "weapon" : card.type;
  const variant = CARD_FRAME_VARIANTS.has(options.variant) ? options.variant : "lobby";
  const states = ["selected", "busy", "pending"].filter(state => options[state]);
  const accessibleName = options.accessibleName || `${card.name}, ${category.name}, ${card.cost} taps`;
  return `<article class="card-frame card-frame--${variant} category-${categoryKey} ${states.map(state => `is-${state}`).join(" ")}" data-card-frame="${variant}" data-card-source="${source}" data-card-key="${key}" style="--card-color:${card.color};--category-color:${category.color}" aria-label="${escapeMarkup(accessibleName)}"><span class="card-frame__art pixel-sprite pixel-portrait-fallback pixel-${source}-${key}" data-art-key="${key}" aria-hidden="true"><b>${escapeMarkup(card.short)}</b></span><span class="card-frame__body"><small class="card-frame__category">${escapeMarkup(category.short)}<i>${escapeMarkup(type)}</i></small><strong>${escapeMarkup(card.name)}</strong></span><em class="card-frame__cost" aria-label="${card.cost} taps">${card.cost}</em><span class="card-frame__seal" aria-hidden="true">&#10003;</span></article>`;
}
function effectPresentation(key, source = "card") {
  const registry = source === "weapon" ? DATA.weapons : DATA.cards;
  if (!ownsDefinition(registry, key)) return null;
  const definition = registry[key];
  const family = definition && DATA.effectFamilies[definition.effectFamily];
  if (!definition || !family) return null;
  return Object.freeze({ key, family: definition.effectFamily, className: `pixel-family-${definition.effectFamily}`, color: definition.color || family.color, intensity: family.intensity, pitch: family.pitch });
}
function validPresentationEvent(event) {
  if (!event || !Number.isSafeInteger(event.id) || ![1, 2].includes(event.side) || typeof event.type !== "string") return false;
  const knownCard = key => ownsDefinition(DATA.cards, key);
  const knownWeapon = key => ownsDefinition(DATA.weapons, key);
  if (event.type === "place") return knownCard(event.key) && Boolean(DATA.categories[event.category]);
  if (event.type === "commit") return event.source === "weapon" ? knownWeapon(event.key) : event.source === "card" && knownCard(event.key);
  if (event.type === "siphon") return event.source === "weapon" ? knownWeapon(event.key) : event.source === "card" && knownCard(event.key);
  if (["hit", "wallBreak"].includes(event.type)) return (knownCard(event.source) || knownWeapon(event.source)) && (event.targetSide == null || [1, 2].includes(event.targetSide)) && (Number.isFinite(event.amount) || (event.damage && typeof event.damage === "object"));
  if (event.type === "card") return knownCard(event.card);
  return false;
}
function presentationEvents(state, afterId = 0) {
  const candidates = Array.isArray(state?.recentEvents) ? [...state.recentEvents] : [];
  if (validPresentationEvent(state?.lastEvent) && !candidates.some(event => validPresentationEvent(event) && event.id === state.lastEvent.id)) candidates.push(state.lastEvent);
  const unique = new Map();
  for (const event of candidates) {
    if (!validPresentationEvent(event) || event.id <= afterId) continue;
    unique.set(event.id, event);
  }
  return [...unique.values()].sort((left, right) => left.id - right.id);
}
window.TapticsUI = Object.freeze({ cardFrame, effectPresentation, isValidDeck, presentationEvents, resultPresentation });

function renderProfile() {
  const rating = currentRating();
  const leagues = [
    { name: "BRONZE LEAGUE", floor: 0, ceiling: 1200 },
    { name: "SILVER LEAGUE", floor: 1200, ceiling: 1500 },
    { name: "GOLD LEAGUE", floor: 1500, ceiling: 1800 },
    { name: "MASTER LEAGUE", floor: 1800, ceiling: 2100 },
    { name: "CHAMPION LEAGUE", floor: 2100, ceiling: 2400 }
  ];
  const league = leagues.find(entry => rating < entry.ceiling) || leagues.at(-1);
  const nextLeague = leagues[leagues.indexOf(league) + 1];
  const progress = clamp((rating - league.floor) / (league.ceiling - league.floor), 0, 1);
  $("#rating-value").textContent = rating;
  $("#header-rating").textContent = rating;
  $("#rating-league").textContent = league.name;
  $("#rating-progress").style.width = `${progress * 100}%`;
  $("#rating-next").textContent = nextLeague ? `${league.ceiling - rating} ELO TO ${nextLeague.name.replace(" LEAGUE", "")}` : "TOP LEAGUE";
  $("#stat-duels").textContent = profile.duels;
  $("#stat-winrate").textContent = profile.duels ? `${Math.round(profile.wins / profile.duels * 100)}%` : "--";
  $("#stat-run").textContent = profile.run;
  $("#stat-best").textContent = profile.bestRun;
  const challenge = CHALLENGES[profile.challenge % CHALLENGES.length];
  $("#challenge-title").textContent = challenge.title;
  $("#challenge-copy").textContent = challenge.copy;
  $("#challenge-status").textContent = profile.challengeComplete ? "COMPLETE" : "0 / 1";
  renderLobbyLoadout();
}
function renderLobbyLoadout() {
  const active = savedLoadout();
  $("#loadout-deck").innerHTML = active.deck.map(key => cardFrame(key, { variant: "lobby" })).join("");
  const weapon = DATA.weapons[active.weapon];
  $("#loadout-weapon-name").textContent = weapon.name.toUpperCase();
  $("#loadout-weapon-copy").textContent = `${weapon.cost} taps - ${weapon.description}`;
}
function setMenuTab(tab) {
  const battleActive = tab === "battle";
  $("#battle-tab").classList.toggle("active", battleActive);
  $("#open-deck").classList.toggle("active", !battleActive);
  if (battleActive) {
    $("#battle-tab").setAttribute("aria-current", "page");
    $("#open-deck").removeAttribute("aria-current");
  } else {
    $("#open-deck").setAttribute("aria-current", "page");
    $("#battle-tab").removeAttribute("aria-current");
  }
}
function deckIsDirty() {
  const saved = savedLoadout(builderDeckIndex);
  return deckBuilderLoaded && (builderWeapon !== saved.weapon || !sameOrderedDeck(builderDeck, saved.deck));
}
function loadoutWithEditorState(saved, editor) {
  const complete = isValidDeck(editor.deck) && ownsDefinition(DATA.weapons, editor.weapon);
  return complete ? { deck: [...editor.deck], weapon: editor.weapon, deckDraft: null } : { ...saved, deckDraft: { deck: [...editor.deck], weapon: editor.weapon } };
}
function loadoutsWithPendingEdits() {
  return profile.loadouts.map((saved, index) => {
    const editor = volatileBuilderLoadouts.get(index);
    return editor ? loadoutWithEditorState(saved, editor) : saved;
  });
}
function autoSaveBuilderDeck() {
  volatileBuilderLoadouts.set(builderDeckIndex, { deck: [...builderDeck], weapon: builderWeapon });
  const candidate = { ...profile, version: 6, loadouts: loadoutsWithPendingEdits(), activeDeck: builderDeckIndex, selectedDeck: builderDeckIndex };
  const saved = saveProfile(candidate);
  if (!saved) {
    const firstFailure = !deckStorageError;
    deckStorageError = true;
    if (firstFailure) toast("AUTO-SAVE UNAVAILABLE - EDIT KEPT IN MEMORY");
    return false;
  }
  profile = candidate;
  volatileBuilderLoadouts.clear();
  deckStorageError = false;
  renderProfile();
  return true;
}
function announceDeck(message) {
  const status = $("#deck-announcer");
  status.textContent = "";
  requestAnimationFrame(() => { status.textContent = message; });
}
function renderQueueState() {
  const connected = socket.connected;
  const button = $("#online-button");
  const state = !connected ? "offline" : searching ? "searching" : "idle";
  button.classList.toggle("searching", searching);
  button.dataset.state = state;
  button.disabled = !connected;
  button.setAttribute("aria-pressed", String(searching));
  button.setAttribute("aria-busy", String(searching));
  button.querySelector("span").textContent = !connected ? "CONNECTION OFFLINE" : searching ? "CANCEL SEARCH" : "SEARCH FOR BATTLE";
  $("#queue-message").textContent = !connected ? "Reconnect to enter matchmaking" : searching ? "War table scanning - press again to cancel" : "Ranked real-time 1v1";
  const icon = button.querySelector("i .pixel-sprite");
  icon.classList.toggle("pixel-status-search", connected);
  icon.classList.toggle("pixel-status-warning", !connected);
  $("#solo-button").disabled = !connected;
  $("#challenge-play").disabled = !connected;
  if (connectionInterrupted && !$("#result-modal").classList.contains("hidden")) $("#again-button").disabled = !connected || rematchPending;
}
function clearBattlePresentation() {
  $("#battle-effects").replaceChildren();
  $$(".card-flight").forEach(element => element.remove());
}
function showLobby() {
  const leavingDeck = !$("#deck-screen").classList.contains("hidden");
  if (leavingDeck) deckScrollTop = $("#deck-screen").scrollTop;
  gameActive = false;
  matchState = null;
  hideCardInspector();
  hideToast();
  clearBattlePresentation();
  closeAllLifecycleDialogs();
  connectionInterrupted = false;
  rematchPending = false;
  $("#game").classList.add("hidden");
  $("#deck-screen").classList.add("hidden");
  $("#lobby").classList.remove("hidden");
  $("#main-menu-tabs").classList.remove("hidden");
  document.body.classList.add("menu-active");
  document.body.classList.remove("deck-active");
  $(".lobby-scroll").scrollTop = 0;
  setMenuTab("battle");
  window.scrollTo({ top: 0, behavior: "auto" });
  renderProfile();
  if (leavingDeck && deckIsDirty()) toast(`DECK ${builderDeckIndex + 1} EDIT KEPT - BATTLE USES THE LAST AUTO-SAVED ACTIVE LOADOUT`);
}
function showGame() {
  if (!$("#deck-screen").classList.contains("hidden")) deckScrollTop = $("#deck-screen").scrollTop;
  gameActive = true;
  lastEventId = 0;
  lastPhase = null;
  lastDoubleTaps = false;
  connectionInterrupted = false;
  rematchPending = false;
  hideCardInspector();
  hideToast();
  clearBattlePresentation();
  closeAllLifecycleDialogs();
  $("#lobby").classList.add("hidden");
  $("#deck-screen").classList.add("hidden");
  $("#main-menu-tabs").classList.add("hidden");
  document.body.classList.remove("menu-active", "deck-active");
  $("#game").classList.remove("hidden");
  $("#mode-label").textContent = mode === "cpu" ? "TRAINING" : "ONLINE";
  window.scrollTo({ top: 0, behavior: "auto" });
  requestAnimationFrame(() => $("#arena").focus({ preventScroll: true }));
}
function startCpu() {
  if (!socket.connected) {
    toast("CONNECTION OFFLINE - CPU BATTLE CANNOT START", "warning");
    announceLifecycle("Connection offline. CPU battle cannot start.");
    return false;
  }
  if (searching) {
    socket.emit("cancelSearch");
    searching = false;
    renderQueueState();
    announceLifecycle("Online search canceled. Preparing CPU battle.");
  } else announceLifecycle("Preparing CPU battle.");
  mode = "cpu";
  socket.emit("startCpu", loadout());
  return true;
}
function toggleOnlineQueue() {
  if (!socket.connected) {
    toast("CONNECTION OFFLINE - MATCHMAKING UNAVAILABLE", "warning");
    announceLifecycle("Connection offline. Matchmaking unavailable.");
    return;
  }
  if (searching) {
    socket.emit("cancelSearch");
    searching = false;
    renderQueueState();
    announceLifecycle("Matchmaking canceled.");
    return;
  }
  socket.emit("findMatch", loadout());
  searching = true;
  renderQueueState();
  announceLifecycle("Matchmaking started. Press Search for Battle again to cancel.");
}

function loadBuilderDeck(index) {
  const saved = savedLoadout(index);
  const volatile = volatileBuilderLoadouts.get(index);
  const editor = volatile || (isValidDeckDraft(saved.deckDraft) ? saved.deckDraft : saved);
  builderDeckIndex = index;
  builderDeck = [...editor.deck];
  builderWeapon = editor.weapon;
}
function switchBuilderDeck(index, { focus = true } = {}) {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_SAVED_DECKS) return false;
  if (index === builderDeckIndex) {
    if (focus) $(`[data-deck-tab="${index}"]`)?.focus({ preventScroll: true });
    return false;
  }
  clearDeckMotion();
  clearDeckUndo();
  activeDeckSlot = -1;
  expandedArmoryKey = null;
  replacementCandidate = null;
  const candidate = { ...profile, version: 6, loadouts: loadoutsWithPendingEdits(), activeDeck: index, selectedDeck: index };
  const saved = saveProfile(candidate);
  if (saved) {
    profile = candidate;
    volatileBuilderLoadouts.clear();
    deckStorageError = false;
    renderProfile();
  } else {
    deckStorageError = true;
    toast("DECK SWITCH KEPT IN MEMORY - AUTO-SAVE UNAVAILABLE");
  }
  loadBuilderDeck(index);
  renderDeckBuilder({ animateLibrary: true });
  if (focus) requestAnimationFrame(() => $(`[data-deck-tab="${index}"]`)?.focus({ preventScroll: true }));
  const incomplete = !isValidDeck(builderDeck);
  announceDeck(saved ? `Deck ${index + 1} selected${incomplete ? ". Its incomplete edit is open; battles use its last complete version until all six cards are present." : " and active for battle."}` : `Deck ${index + 1} is open in memory. Battle still uses auto-saved Deck ${profile.activeDeck + 1}.`);
  return true;
}
function openDeckBuilder() {
  const continuingDraft = deckBuilderLoaded;
  const canceledSearch = searching;
  if (canceledSearch) {
    socket.emit("cancelSearch");
    searching = false;
    renderQueueState();
  }
  if (!deckBuilderLoaded) {
    loadBuilderDeck(profile.selectedDeck);
    deckBuilderLoaded = true;
    if (isValidDeck(builderDeck) && deckIsDirty()) autoSaveBuilderDeck();
  }
  activeDeckSlot = -1;
  expandedArmoryKey = null;
  replacementCandidate = null;
  clearDeckMotion();
  ensureDeckCatalogue();
  renderDeckBuilder();
  $("#lobby").classList.add("hidden");
  const deckScreen = $("#deck-screen");
  deckScreen.classList.remove("hidden", "is-entering", "is-returning");
  observeDeckLayoutMetrics();
  deckScreen.classList.add(deckOpenedOnce ? "is-returning" : "is-entering");
  deckOpenedOnce = true;
  $("#main-menu-tabs").classList.remove("hidden");
  document.body.classList.add("menu-active", "deck-active");
  deckScreen.scrollTop = continuingDraft ? deckScrollTop : 0;
  requestAnimationFrame(() => { deckScreen.scrollTop = continuingDraft ? deckScrollTop : 0; });
  setTimeout(() => deckScreen.classList.remove("is-entering", "is-returning"), 320);
  setMenuTab("deck");
  $("#deck-builder-title").focus({ preventScroll: true });
  if (canceledSearch) {
    announceDeck("Matchmaking canceled so you can edit the saved loadout safely.");
  }
}
const DECK_CATEGORIES = ["attack", "crew", "magic"];
function syncDeckLayoutMetrics() {
  const screen = $("#deck-screen");
  const header = screen.querySelector(".deck-screen-header");
  const height = Math.ceil(header.getBoundingClientRect().height);
  if (height > 0) screen.style.setProperty("--deck-header-height", `${height}px`);
}
function observeDeckLayoutMetrics() {
  syncDeckLayoutMetrics();
  if (deckHeaderObserver || typeof ResizeObserver !== "function") return;
  deckHeaderObserver = new ResizeObserver(syncDeckLayoutMetrics);
  deckHeaderObserver.observe($("#deck-screen .deck-screen-header"));
}
function reducedDeckMotion() { return matchMedia("(prefers-reduced-motion: reduce)").matches; }
function deckPosition(key) { return builderDeck.indexOf(key); }
function headlineStats(key, source = "card") {
  const registry = source === "weapon" ? DATA.weaponStats : DATA.cardStats;
  return (registry[key] || []).slice(0, 2);
}
function headlineStatsMarkup(key, source = "card") {
  return headlineStats(key, source).map(stat => `<b>${escapeMarkup(stat)}</b>`).join("");
}
function deckSlotMarkup(index) {
  return `<article class="deck-slot empty" data-deck-slot="${index}" data-card-key="" role="listitem"><span class="deck-slot-order" aria-hidden="true">#${index + 1}</span><button class="deck-slot__select library-card__select" type="button" data-slot-action="select" data-card-key="" aria-expanded="false" aria-controls="deck-slot-actions-${index}" aria-grabbed="false"><span class="deck-slot__frame" aria-hidden="true"></span><span class="library-card__strengths deck-slot__strengths" aria-hidden="true"></span></button><div id="deck-slot-actions-${index}" class="card-action-popover deck-slot__actions" role="group" aria-label="Card actions" hidden><button class="deck-slot__info card-action-popover__info pixel-button" type="button" data-slot-action="info" data-card-key="">INFO</button><button class="deck-slot__remove card-action-popover__remove pixel-button" type="button" data-slot-action="remove" data-card-key="">REMOVE</button></div><button class="deck-slot__empty pixel-button" type="button" data-slot-action="empty" data-slot-index="${index}"><b aria-hidden="true">+</b><span>ADD CARD</span></button><span class="deck-insertion-marker" aria-hidden="true">#${index + 1}</span></article>`;
}
function ensureDeckCatalogue() {
  if (deckCatalogueReady) return;
  $("#weapon-options").innerHTML = Object.entries(DATA.weapons).map(([key, weapon]) => `<article class="weapon-option" data-weapon-root="${key}"><button class="weapon-option__select" type="button" role="radio" data-weapon="${key}" data-weapon-action="select" aria-checked="false" aria-label="Select ${escapeMarkup(weapon.name)} as permanent weapon">${cardFrame(key, { variant: "armory", source: "weapon" })}<span class="weapon-option__strengths library-card__strengths">${headlineStatsMarkup(key, "weapon")}</span><span class="weapon-option__availability">ALWAYS AVAILABLE</span></button><button class="card-info-button weapon-option__info pixel-button" type="button" data-weapon-action="info" data-info-source="weapon" data-info-key="${key}" aria-label="Info for ${escapeMarkup(weapon.name)}">INFO</button></article>`).join("");
  $("#builder-deck").innerHTML = `<section class="deck-cycle-row" aria-labelledby="opening-hand-label"><h3 id="opening-hand-label" class="deck-cycle-row__label">OPENING HAND <span>POSITIONS 1-3</span></h3><div class="deck-cycle-cards" role="list" aria-label="Opening hand draw positions">${Array.from({ length: 3 }, (_, index) => deckSlotMarkup(index)).join("")}</div></section><section class="deck-cycle-row" aria-labelledby="next-cycle-label"><h3 id="next-cycle-label" class="deck-cycle-row__label">NEXT IN CYCLE <span>POSITIONS 4-6</span></h3><div class="deck-cycle-cards" role="list" aria-label="Next draw positions">${Array.from({ length: 3 }, (_, index) => deckSlotMarkup(index + 3)).join("")}</div></section>`;
  $("#card-library").innerHTML = DECK_CATEGORIES.map(category => `<section class="armory-group category-${category}" data-armory-group="${category}" aria-labelledby="armory-${category}-title"><h3 id="armory-${category}-title" class="armory-group__heading">${DATA.categories[category].name.toUpperCase()} <span data-armory-group-count="${category}">0</span></h3><div class="armory-grid" data-armory-grid="${category}"></div></section>`).join("");
  Object.entries(DATA.cards).forEach(([key, card], recommendedIndex) => {
    const entry = document.createElement("article");
    entry.className = `library-card category-${card.category}`;
    entry.dataset.libraryCard = key;
    entry.dataset.cardCategory = card.category;
    entry.dataset.cardName = card.name.toLocaleLowerCase();
    entry.dataset.cardCost = String(card.cost);
    entry.dataset.recommendedIndex = String(recommendedIndex);
    entry.style.setProperty("--card-color", card.color);
    entry.style.setProperty("--category-color", DATA.categories[card.category].color);
    entry.innerHTML = `<button class="library-card__select" type="button" data-card-action="toggle" aria-expanded="false" aria-controls="armory-actions-${key}" aria-label="${escapeMarkup(card.name)}. Show card actions.">${cardFrame(key, { variant: "armory" })}<span class="library-card__strengths" aria-hidden="true">${headlineStatsMarkup(key)}</span></button><div id="armory-actions-${key}" class="card-action-popover library-card__actions" role="group" aria-label="Actions for ${escapeMarkup(card.name)}" hidden><button class="card-action-popover__info pixel-button" type="button" data-card-action="info" data-info-source="card" data-info-key="${key}">INFO</button><button class="card-action-popover__primary pixel-button" type="button" data-card-action="choose">CHOOSE POSITION</button></div>`;
    $(`[data-armory-grid="${card.category}"]`).append(entry);
  });
  deckCatalogueReady = true;
}
function focusDeckSlot(key, action = "select") {
  requestAnimationFrame(() => $(`#builder-deck [data-card-key="${key}"][data-slot-action="${action}"]`)?.focus({ preventScroll: true }));
}
function focusDeckSlotIndex(index, action = "empty") {
  requestAnimationFrame(() => $(`#builder-deck [data-deck-slot="${index}"] [data-slot-action="${action}"]`)?.focus({ preventScroll: true }));
}
function updateDeckSlots(focus = null) {
  $$("#builder-deck [data-deck-slot]").forEach((slot, index) => {
    const key = builderDeck[index];
    slot.dataset.cardKey = key || "";
    const selected = index === activeDeckSlot;
    const main = slot.querySelector(".deck-slot__select");
    const frameSlot = slot.querySelector(".deck-slot__frame");
    const strengths = slot.querySelector(".deck-slot__strengths");
    const actions = slot.querySelector(".deck-slot__actions");
    const info = slot.querySelector(".deck-slot__info");
    const remove = slot.querySelector(".deck-slot__remove");
    const empty = slot.querySelector(".deck-slot__empty");
    if (slot.dataset.renderedKey !== (key || "")) {
      frameSlot.innerHTML = key ? cardFrame(key, { variant: "armory" }) : "";
      strengths.innerHTML = key ? headlineStatsMarkup(key) : "";
      slot.dataset.renderedKey = key || "";
    }
    slot.classList.toggle("empty", !key);
    slot.classList.toggle("filled", Boolean(key));
    slot.classList.toggle("is-active", selected);
    slot.classList.toggle("is-expanded", selected);
    DECK_CATEGORIES.forEach(category => slot.classList.toggle(`category-${category}`, DATA.cards[key]?.category === category));
    main.hidden = !key;
    actions.hidden = !selected || !key;
    empty.hidden = Boolean(key);
    if (key) {
      const card = DATA.cards[key];
      for (const control of [main, info, remove]) control.dataset.cardKey = key;
      main.setAttribute("aria-label", `${card.name}, draw position ${index + 1}. Activate to show Info and Remove. Hold the card to drag it, or press Space to pick it up for keyboard reordering.`);
      main.setAttribute("aria-expanded", String(selected));
      main.setAttribute("aria-grabbed", String(deckKeyboardDrag?.key === key));
      info.setAttribute("aria-label", `Info for ${card.name}, draw position ${index + 1}`);
      remove.setAttribute("aria-label", `Remove ${card.name} from draw position ${index + 1}`);
    } else {
      const isNextPosition = index === builderDeck.length;
      main.setAttribute("aria-expanded", "false");
      main.setAttribute("aria-grabbed", "false");
      empty.disabled = !isNextPosition;
      empty.querySelector("span").textContent = isNextPosition ? "ADD CARD" : `FILL #${builderDeck.length + 1} FIRST`;
      empty.setAttribute("aria-label", isNextPosition ? `Empty draw position ${index + 1}. Choose a card from the Armory.` : `Empty draw position ${index + 1}. Fill draw position ${builderDeck.length + 1} first.`);
    }
  });
  if (focus?.key) focusDeckSlot(focus.key, focus.action || "select");
  else if (Number.isInteger(focus?.index)) focusDeckSlotIndex(focus.index, focus.action || "empty");
}
function updateWeaponOptions() {
  $$("#weapon-options [data-weapon]").forEach(button => {
    const selected = button.dataset.weapon === builderWeapon;
    button.closest(".weapon-option").classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.querySelector(".card-frame")?.classList.toggle("is-selected", selected);
  });
}
function updateDeckTabs() {
  $$("#deck-tabs [data-deck-tab]").forEach(button => {
    const index = Number(button.dataset.deckTab);
    const selected = index === builderDeckIndex;
    const active = index === profile.activeDeck;
    const record = savedLoadout(index);
    const hasDraft = Boolean(record.deckDraft);
    const pendingStorage = volatileBuilderLoadouts.has(index);
    button.classList.toggle("is-active", active);
    button.classList.toggle("has-draft", hasDraft);
    button.classList.toggle("has-storage-error", pendingStorage);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.querySelector("small").textContent = pendingStorage ? "MEMORY" : hasDraft ? "EDITING" : active ? "ACTIVE" : "READY";
    button.setAttribute("aria-label", `Deck ${index + 1}${active ? ", active for battle" : ""}${pendingStorage ? ", edit kept in memory while auto-save is unavailable" : hasDraft ? ", incomplete edit auto-saved" : ", ready"}`);
  });
}
function animateArmoryLayout(firstRects, previouslyVisible) {
  if (!firstRects || reducedDeckMotion()) return;
  const sequence = ++deckMotionSequence;
  requestAnimationFrame(() => {
    if (sequence !== deckMotionSequence) return;
    const viewport = $("#deck-screen").getBoundingClientRect();
    $$("#card-library [data-library-card]:not([hidden])").forEach(entry => {
      const first = firstRects.get(entry);
      const last = entry.getBoundingClientRect();
      if (last.bottom < viewport.top || last.top > viewport.bottom) return;
      if (first) {
        const x = Math.round(first.left - last.left);
        const y = Math.round(first.top - last.top);
        if (x || y) entry.animate([{ transform: `translate(${x}px, ${y}px)`, opacity: .72 }, { transform: "translate(0, 0)", opacity: 1 }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
      } else if (!previouslyVisible.has(entry)) entry.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 160, easing: "ease-out" });
    });
  });
}
function animateArmoryDepartures(entries, desiredVisibility) {
  const viewport = $("#deck-screen").getBoundingClientRect();
  entries.filter(entry => !entry.hidden && !desiredVisibility.get(entry)).filter(entry => {
    const rect = entry.getBoundingClientRect();
    return rect.width && rect.height && rect.bottom >= viewport.top && rect.top <= viewport.bottom;
  }).slice(0, 8).forEach(entry => {
    const rect = entry.getBoundingClientRect();
    const clone = entry.cloneNode(true);
    clone.classList.add("armory-filter-clone");
    clone.removeAttribute("data-library-card");
    clone.inert = true;
    clone.setAttribute("aria-hidden", "true");
    Object.assign(clone.style, { left: `${Math.round(rect.left)}px`, top: `${Math.round(rect.top)}px`, width: `${Math.round(rect.width)}px`, height: `${Math.round(rect.height)}px` });
    $("#deck-screen").append(clone);
    const animation = clone.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-8px)", opacity: 0 }], { duration: 150, easing: "ease-out" });
    animation.finished.catch(() => {}).finally(() => clone.remove());
  });
}
function updateLibraryState(options = {}) {
  const entries = $$("#card-library [data-library-card]");
  const query = builderSearch.trim().toLocaleLowerCase();
  const desiredVisibility = new Map(entries.map(entry => [entry, (builderFilter === "all" || builderFilter === entry.dataset.cardCategory) && (!query || entry.dataset.cardName.includes(query))]));
  if (expandedArmoryKey && !desiredVisibility.get($(`[data-library-card="${expandedArmoryKey}"]`))) expandedArmoryKey = null;
  const animate = Boolean(options.animate) && !reducedDeckMotion();
  if (!animate) deckMotionSequence++;
  const firstRects = animate ? new Map(entries.filter(entry => !entry.hidden).map(entry => [entry, entry.getBoundingClientRect()])) : null;
  const previouslyVisible = new Set(entries.filter(entry => !entry.hidden));
  entries.forEach(entry => entry.getAnimations().forEach(animation => animation.cancel()));
  document.querySelectorAll(".armory-filter-clone").forEach(element => element.remove());
  if (animate) animateArmoryDepartures(entries, desiredVisibility);
  let visible = 0;
  for (const category of DECK_CATEGORIES) {
    const group = $(`[data-armory-group="${category}"]`);
    const grid = $(`[data-armory-grid="${category}"]`);
    const categoryEntries = entries.filter(entry => entry.dataset.cardCategory === category).sort((left, right) => {
      if (builderSort === "cost-asc") return Number(left.dataset.cardCost) - Number(right.dataset.cardCost) || left.dataset.cardName.localeCompare(right.dataset.cardName);
      if (builderSort === "cost-desc") return Number(right.dataset.cardCost) - Number(left.dataset.cardCost) || left.dataset.cardName.localeCompare(right.dataset.cardName);
      if (builderSort === "name") return left.dataset.cardName.localeCompare(right.dataset.cardName);
      return Number(left.dataset.recommendedIndex) - Number(right.dataset.recommendedIndex);
    });
    categoryEntries.forEach(entry => grid.append(entry));
    let groupVisible = 0;
    categoryEntries.forEach(entry => {
      const key = entry.dataset.libraryCard;
      const card = DATA.cards[key];
      const position = deckPosition(key);
      const shown = desiredVisibility.get(entry);
      entry.hidden = !shown;
      if (shown) { visible++; groupVisible++; }
      const expanded = key === expandedArmoryKey;
      entry.classList.toggle("is-in-deck", position >= 0);
      entry.classList.toggle("is-expanded", expanded);
      const face = entry.querySelector('[data-card-action="toggle"]');
      const actions = entry.querySelector(".library-card__actions");
      const choose = entry.querySelector('[data-card-action="choose"], [data-card-action="locate"]');
      face.setAttribute("aria-expanded", String(expanded));
      face.setAttribute("aria-label", position >= 0 ? `${card.name}, in Deck ${builderDeckIndex + 1} at draw position ${position + 1}. Show Info and deck position.` : `${card.name}, not in Deck ${builderDeckIndex + 1}. Show Info and Choose Position.`);
      actions.hidden = !expanded;
      if (position >= 0) {
        choose.dataset.cardAction = "locate";
        choose.textContent = `IN DECK #${position + 1}`;
        choose.setAttribute("aria-label", `${card.name} is already in draw position ${position + 1}. Identify that position.`);
      } else {
        choose.dataset.cardAction = "choose";
        choose.textContent = "CHOOSE POSITION";
        choose.setAttribute("aria-label", `Choose a draw position for ${card.name}`);
      }
    });
    group.hidden = groupVisible === 0;
    $(`[data-armory-group-count="${category}"]`).textContent = `- ${groupVisible}`;
  }
  $("#library-count").textContent = `${visible} ${visible === 1 ? "CARD" : "CARDS"}`;
  $$("#deck-filters [data-deck-filter]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.deckFilter === builderFilter)));
  $("#deck-search").value = builderSearch;
  $("#deck-sort").value = builderSort;
  $("#clear-deck-search").classList.toggle("hidden", !builderSearch);
  $("#armory-no-results").classList.toggle("hidden", visible !== 0);
  animateArmoryLayout(firstRects, previouslyVisible);
}
function setDeckSummaryValue(selector, value) {
  const element = $(selector);
  const text = String(value);
  if (element.textContent === text) return;
  element.textContent = text;
  element.parentElement.classList.remove("is-updated");
  requestAnimationFrame(() => element.parentElement.classList.add("is-updated"));
  setTimeout(() => element.parentElement.classList.remove("is-updated"), reducedDeckMotion() ? 40 : 320);
}
function updateDeckSummary() {
  const total = builderDeck.reduce((sum, key) => sum + DATA.cards[key].cost, 0);
  const counts = Object.fromEntries(DECK_CATEGORIES.map(category => [category, builderDeck.filter(key => DATA.cards[key].category === category).length]));
  setDeckSummaryValue("#deck-average-cost", builderDeck.length ? (total / builderDeck.length).toFixed(1) : "0.0");
  setDeckSummaryValue("#deck-attack-count", counts.attack);
  setDeckSummaryValue("#deck-crew-count", counts.crew);
  setDeckSummaryValue("#deck-magic-count", counts.magic);
  const missing = DATA.deckSize - builderDeck.length;
  setDeckSummaryValue("#deck-readiness", missing ? `${missing} ${missing === 1 ? "CARD" : "CARDS"} MISSING` : `${DATA.deckSize} / ${DATA.deckSize} READY`);
}
function updateDeckUndo() {
  $("#deck-undo").classList.toggle("hidden", !deckUndoState);
  $("#deck-undo").parentElement.classList.toggle("hidden", !deckUndoState);
  if (deckUndoState) $("#deck-undo-copy").textContent = deckUndoState.copy;
}
function updateDeckStatus() {
  const valid = isValidDeck(builderDeck) && ownsDefinition(DATA.weapons, builderWeapon);
  const state = deckStorageError ? "error" : !valid ? "invalid" : "saved";
  const status = $("#deck-status");
  const missing = DATA.deckSize - builderDeck.length;
  const copy = state === "error" ? `Auto-save unavailable. Deck ${builderDeckIndex + 1}'s edit is kept in memory; battles use the last auto-saved active loadout.` : state === "invalid" ? `Deck ${builderDeckIndex + 1} edit auto-saved - ${missing} ${missing === 1 ? "card" : "cards"} still needed. Battles use its last complete version.` : `Deck ${builderDeckIndex + 1} is auto-saved and ready for battle.`;
  if ($("#deck-status-copy").textContent !== copy) {
    $("#deck-status-copy").textContent = copy;
    status.classList.remove("is-changing");
    requestAnimationFrame(() => status.classList.add("is-changing"));
  }
  status.dataset.state = state;
  status.querySelector(".deck-status__emblem").textContent = state === "saved" ? "\u2713" : "!";
  $("#builder-count").textContent = `${builderDeck.length} / ${DATA.deckSize}${valid ? " READY" : ""}`;
  $("#deck-hint").classList.toggle("is-dismissed", deckHintDismissed);
  $("#dismiss-deck-hint").classList.toggle("hidden", deckHintDismissed);
  updateDeckSummary();
}
function renderDeckBuilder(options = {}) {
  ensureDeckCatalogue();
  updateDeckSlots(options.focus);
  updateWeaponOptions();
  updateDeckTabs();
  updateLibraryState({ animate: options.animateLibrary });
  updateDeckStatus();
  updateDeckUndo();
}
function clearDeckDragVisuals({ keepAvatar = false } = {}) {
  $$("#builder-deck .deck-slot__select, #builder-deck .deck-slot__info").forEach(control => control.style.removeProperty("transform"));
  $$("#builder-deck [data-deck-slot]").forEach(slot => slot.classList.remove("is-dragging", "is-drop-target", "is-shifting"));
  if (!keepAvatar) document.querySelectorAll(".deck-drag-avatar").forEach(element => element.remove());
}
function clearDeckMotion() {
  deckMotionSequence++;
  deckReflowSequence++;
  if (deckPointerDrag?.holdTimer) clearTimeout(deckPointerDrag.holdTimer);
  if (deckPointerDrag?.capture.hasPointerCapture?.(deckPointerDrag.pointerId)) deckPointerDrag.capture.releasePointerCapture(deckPointerDrag.pointerId);
  deckPointerDrag = null;
  deckKeyboardDrag = null;
  suppressDeckClick = false;
  deckTravelClone?.remove();
  deckTravelClone = null;
  deckRemovalClone?.remove();
  deckRemovalClone = null;
  document.querySelectorAll(".deck-travel-clone, .deck-drag-avatar, .armory-filter-clone").forEach(element => element.remove());
  $$("#builder-deck .deck-slot__select, #builder-deck .deck-slot__info").forEach(control => control.getAnimations().forEach(animation => animation.cancel()));
  $$("#card-library [data-library-card]").forEach(entry => entry.getAnimations().forEach(animation => animation.cancel()));
  clearDeckDragVisuals();
}
function restoreDeckScroll(scrollTop) {
  $("#deck-screen").scrollTop = scrollTop;
  requestAnimationFrame(() => { $("#deck-screen").scrollTop = scrollTop; });
}
function clearDeckUndo() {
  if (deckUndoTimer) clearTimeout(deckUndoTimer);
  deckUndoTimer = null;
  deckUndoState = null;
  updateDeckUndo();
}
function setDeckUndo(snapshot, copy) {
  if (deckUndoTimer) clearTimeout(deckUndoTimer);
  deckUndoState = { deck: [...snapshot.deck], weapon: snapshot.weapon, copy };
  updateDeckUndo();
  const expire = () => {
    if ($("#deck-undo").contains(document.activeElement)) {
      deckUndoTimer = setTimeout(expire, 2000);
      return;
    }
    deckUndoState = null;
    deckUndoTimer = null;
    updateDeckUndo();
  };
  deckUndoTimer = setTimeout(expire, 9000);
}
function captureTravelRect(element) {
  if (!(element instanceof Element)) return null;
  const rect = element.getBoundingClientRect();
  return rect.width && rect.height ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
}
function captureDeckRects() {
  return new Map($$("#builder-deck [data-deck-slot]").flatMap(slot => {
    const key = slot.dataset.cardKey;
    const rect = slot.querySelector(".deck-slot__select")?.getBoundingClientRect();
    return key && rect?.width && rect?.height ? [[key, { left: rect.left, top: rect.top }]] : [];
  }));
}
function animateDeckReflow(firstRects) {
  if (!firstRects?.size || reducedDeckMotion()) return;
  const sequence = ++deckReflowSequence;
  requestAnimationFrame(() => {
    if (sequence !== deckReflowSequence) return;
    for (const [key, first] of firstRects) {
      const slot = $(`#builder-deck [data-card-key="${key}"]`);
      const main = slot?.querySelector(".deck-slot__select");
      if (!main) continue;
      const controls = slot.querySelectorAll(".deck-slot__select, .deck-slot__info");
      controls.forEach(control => control.getAnimations().forEach(animation => animation.cancel()));
      const last = main.getBoundingClientRect();
      const x = Math.round(first.left - last.left);
      const y = Math.round(first.top - last.top);
      if (!x && !y) continue;
      controls.forEach(control => control.animate([{ transform: `translate(${x}px, ${y}px)`, opacity: .72 }, { transform: "translate(0, 0)", opacity: 1 }], { duration: 210, easing: "cubic-bezier(.2,.8,.2,1)" }));
    }
  });
}
function pulseDeckSlot(index, className = "is-confirmed") {
  const slot = $(`[data-deck-slot="${index}"]`);
  if (!slot) return;
  slot.classList.remove(className);
  requestAnimationFrame(() => slot.classList.add(className));
  setTimeout(() => slot.classList.remove(className), reducedDeckMotion() ? 40 : 360);
}
function animateDeckTravel(startRect, key, destinationIndex) {
  pulseDeckSlot(destinationIndex);
  if (!startRect || reducedDeckMotion()) return;
  const destination = $(`[data-deck-slot="${destinationIndex}"] .deck-slot__select`)?.getBoundingClientRect();
  if (!destination || startRect.top + startRect.height < 0 || startRect.top > innerHeight) return;
  const destinationVisible = destination.bottom >= 0 && destination.top <= innerHeight;
  deckTravelClone?.remove();
  const clone = document.createElement("div");
  clone.className = "deck-travel-clone";
  clone.setAttribute("aria-hidden", "true");
  clone.innerHTML = cardFrame(key, { variant: "deck" });
  const width = Math.max(88, Math.min(150, destination.width));
  clone.style.left = `${Math.round(startRect.left + startRect.width / 2 - width / 2)}px`;
  clone.style.top = `${Math.round(startRect.top + startRect.height / 2 - destination.height / 2)}px`;
  clone.style.width = `${Math.round(width)}px`;
  clone.style.height = `${Math.round(destination.height)}px`;
  document.body.append(clone);
  deckTravelClone = clone;
  const start = clone.getBoundingClientRect();
  const x = destinationVisible ? Math.round(destination.left + destination.width / 2 - (start.left + start.width / 2)) : 0;
  const y = destinationVisible ? Math.round(destination.top + destination.height / 2 - (start.top + start.height / 2)) : -8;
  const animation = clone.animate([{ transform: "translate(0, 0)", opacity: .92 }, { transform: `translate(${x}px, ${y}px)`, opacity: .28 }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
  animation.finished.catch(() => {}).finally(() => {
    if (deckTravelClone === clone) deckTravelClone = null;
    clone.remove();
  });
}
function animateDeckRemoval(startRect, key) {
  if (!startRect || reducedDeckMotion()) return;
  const clone = document.createElement("div");
  clone.className = "deck-travel-clone is-removing";
  clone.setAttribute("aria-hidden", "true");
  clone.innerHTML = cardFrame(key, { variant: "deck" });
  Object.assign(clone.style, { left: `${Math.round(startRect.left)}px`, top: `${Math.round(startRect.top)}px`, width: `${Math.round(startRect.width)}px`, height: `${Math.round(startRect.height)}px` });
  document.body.append(clone);
  deckRemovalClone?.remove();
  deckRemovalClone = clone;
  const animation = clone.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(8px)", opacity: 0 }], { duration: 200, easing: "ease-out" });
  animation.finished.catch(() => {}).finally(() => {
    if (deckRemovalClone === clone) deckRemovalClone = null;
    clone.remove();
  });
}
function commitDeckMutation({ copy, announcement, focus = null, travel = null, removed = null, destination = null }, mutation) {
  const before = { deck: [...builderDeck], weapon: builderWeapon };
  const firstRects = captureDeckRects();
  const scrollTop = $("#deck-screen").scrollTop;
  mutation();
  setDeckUndo(before, copy);
  autoSaveBuilderDeck();
  renderDeckBuilder({ focus });
  restoreDeckScroll(scrollTop);
  animateDeckReflow(firstRects);
  if (travel) animateDeckTravel(travel.rect, travel.key, destination);
  if (removed) animateDeckRemoval(removed.rect, removed.key);
  if (Number.isInteger(destination) && !travel) pulseDeckSlot(destination);
  announceDeck(announcement);
}
function selectDeckSlot(index) {
  if (!builderDeck[index]) return;
  const same = activeDeckSlot === index;
  activeDeckSlot = same ? -1 : index;
  expandedArmoryKey = null;
  renderDeckBuilder({ focus: { key: builderDeck[index], action: "select" } });
  announceDeck(same ? `${DATA.cards[builderDeck[index]].name} actions closed.` : `${DATA.cards[builderDeck[index]].name} actions opened. Info is followed by Remove.`);
}
function selectEmptyDeckSlot(index) {
  if (builderDeck[index] || builderDeck.length >= DATA.deckSize || index !== builderDeck.length) return;
  activeDeckSlot = -1;
  expandedArmoryKey = null;
  updateDeckSlots();
  updateLibraryState();
  $("#armory-toolbar").scrollIntoView({ block: "start", behavior: reducedDeckMotion() ? "auto" : "smooth" });
  announceDeck(`Choose a card from the Armory, then choose its exact draw position.`);
}
function cancelDeckSelection(announce = true, restoreFocus = false) {
  if (activeDeckSlot < 0 && !expandedArmoryKey) return false;
  const index = activeDeckSlot;
  const deckKey = index >= 0 ? builderDeck[index] : null;
  const armoryKey = expandedArmoryKey;
  activeDeckSlot = -1;
  expandedArmoryKey = null;
  updateDeckSlots(restoreFocus && deckKey ? { key: deckKey, action: "select" } : null);
  updateLibraryState();
  if (restoreFocus && armoryKey) requestAnimationFrame(() => $(`[data-library-card="${armoryKey}"] [data-card-action="toggle"]`)?.focus({ preventScroll: true }));
  if (announce) announceDeck("Card actions closed.");
  return true;
}
function toggleArmoryCard(key) {
  if (!ownsDefinition(DATA.cards, key)) return;
  const same = expandedArmoryKey === key;
  expandedArmoryKey = same ? null : key;
  activeDeckSlot = -1;
  updateDeckSlots();
  updateLibraryState();
  announceDeck(same ? `${DATA.cards[key].name} actions closed.` : `${DATA.cards[key].name} actions opened. Info is followed by ${builderDeck.includes(key) ? `In Deck number ${deckPosition(key) + 1}` : "Choose Position"}.`);
}
function identifyDeckMember(key) {
  const index = deckPosition(key);
  if (index < 0) return;
  const slot = $(`[data-deck-slot="${index}"]`);
  slot.classList.remove("is-located");
  requestAnimationFrame(() => slot.classList.add("is-located"));
  setTimeout(() => slot.classList.remove("is-located"), 500);
  announceDeck(`${DATA.cards[key].name} is already in draw position ${index + 1}.`);
}
function armoryChooseControl(origin, key) {
  const entry = origin?.closest?.("[data-library-card]") || $(`[data-library-card="${key}"]`);
  return entry?.querySelector('[data-card-action="toggle"]') || null;
}
function restoreArmoryFocus(control) {
  if (control?.isConnected) requestAnimationFrame(() => control.focus({ preventScroll: true }));
}
function addDeckCard(key, origin, destination = builderDeck.length) {
  if (!ownsDefinition(DATA.cards, key) || builderDeck.includes(key) || builderDeck.length >= DATA.deckSize || !Number.isInteger(destination) || destination < 0 || destination > builderDeck.length) return false;
  const armoryFocus = armoryChooseControl(origin, key);
  const travel = { rect: captureTravelRect(origin), key };
  commitDeckMutation({ copy: `Added ${DATA.cards[key].name}.`, announcement: `${DATA.cards[key].name} added in draw position ${destination + 1}.`, focus: armoryFocus ? null : { key, action: "select" }, travel, destination }, () => {
    builderDeck.splice(destination, 0, key);
    activeDeckSlot = -1;
    expandedArmoryKey = null;
  });
  if (activeDialog === $("#deck-replace-modal")) closeReplacementSheet({ restoreFocus: false });
  restoreArmoryFocus(armoryFocus);
  return true;
}
function replaceDeckCard(index, key, origin = null) {
  if (!ownsDefinition(DATA.cards, key) || !builderDeck[index]) return false;
  const existingPosition = deckPosition(key);
  if (existingPosition >= 0) {
    identifyDeckMember(key);
    return false;
  }
  const oldKey = builderDeck[index];
  const armoryFocus = activeDialog === $("#deck-replace-modal") ? dialogReturnFocus : armoryChooseControl(origin, key);
  const travel = { rect: captureTravelRect(origin), key };
  const removedOrigin = origin?.closest?.("[data-replace-slot]") || $(`[data-deck-slot="${index}"] .deck-slot__select`);
  const removed = { rect: captureTravelRect(removedOrigin), key: oldKey };
  commitDeckMutation({ copy: `Replaced ${DATA.cards[oldKey].name} with ${DATA.cards[key].name}.`, announcement: `${DATA.cards[oldKey].name} replaced by ${DATA.cards[key].name} in draw position ${index + 1}.`, focus: armoryFocus ? null : { key, action: "select" }, travel, removed, destination: index }, () => {
    builderDeck[index] = key;
    activeDeckSlot = -1;
    expandedArmoryKey = null;
  });
  if (activeDialog === $("#deck-replace-modal")) closeReplacementSheet({ restoreFocus: false });
  restoreArmoryFocus(armoryFocus);
  return true;
}
function removeSelectedDeckCard() {
  const index = activeDeckSlot;
  const key = builderDeck[index];
  if (!key) return false;
  const focusKey = builderDeck[index + 1] || builderDeck[index - 1] || null;
  const focus = focusKey ? { key: focusKey, action: "select" } : { index: 0, action: "empty" };
  const rect = captureTravelRect($(`[data-deck-slot="${index}"] .deck-slot__select`));
  commitDeckMutation({ copy: `Removed ${DATA.cards[key].name}.`, announcement: `${DATA.cards[key].name} removed. ${DATA.deckSize - (builderDeck.length - 1)} ${DATA.deckSize - (builderDeck.length - 1) === 1 ? "card" : "cards"} now missing.`, focus, removed: { rect, key }, destination: Math.min(index, builderDeck.length - 2) }, () => {
    builderDeck.splice(index, 1);
    activeDeckSlot = -1;
    expandedArmoryKey = null;
  });
  return true;
}
function reorderDeck(from, to, focus = true) {
  if (from === to || from < 0 || to < 0 || from >= builderDeck.length || to >= builderDeck.length) return false;
  const key = builderDeck[from];
  commitDeckMutation({ copy: `Moved ${DATA.cards[key].name}.`, announcement: `${DATA.cards[key].name} moved from position ${from + 1} to position ${to + 1}.`, focus: focus ? { key, action: "select" } : null, destination: to }, () => {
    const [moved] = builderDeck.splice(from, 1);
    builderDeck.splice(to, 0, moved);
    activeDeckSlot = -1;
  });
  return true;
}
function changeBuilderWeapon(key) {
  if (!ownsDefinition(DATA.weapons, key) || key === builderWeapon) return false;
  const previous = builderWeapon;
  commitDeckMutation({ copy: `Changed weapon from ${DATA.weapons[previous].name} to ${DATA.weapons[key].name}.`, announcement: `${DATA.weapons[key].name} selected as the always-available weapon.` }, () => { builderWeapon = key; });
  const root = $(`[data-weapon-root="${key}"]`);
  root.classList.add("is-confirmed");
  setTimeout(() => root.classList.remove("is-confirmed"), reducedDeckMotion() ? 40 : 360);
  requestAnimationFrame(() => $(`[data-weapon="${key}"]`)?.focus({ preventScroll: true }));
  return true;
}
function undoDeckEdit() {
  if (!deckUndoState) return;
  const undo = deckUndoState;
  const firstRects = captureDeckRects();
  const scrollTop = $("#deck-screen").scrollTop;
  if (deckUndoTimer) clearTimeout(deckUndoTimer);
  deckUndoTimer = null;
  deckUndoState = null;
  builderDeck = [...undo.deck];
  builderWeapon = undo.weapon;
  activeDeckSlot = -1;
  replacementCandidate = null;
  expandedArmoryKey = null;
  autoSaveBuilderDeck();
  renderDeckBuilder({ animateLibrary: true });
  restoreDeckScroll(scrollTop);
  animateDeckReflow(firstRects);
  $("#builder-deck").classList.add("is-restored");
  setTimeout(() => $("#builder-deck").classList.remove("is-restored"), reducedDeckMotion() ? 40 : 360);
  announceDeck(`Undone. ${undo.copy}`);
  $("#deck-builder-title").focus({ preventScroll: true });
}
function openDeckInfo(source, key, origin) {
  const registry = source === "weapon" ? DATA.weapons : DATA.cards;
  const definition = registry[key];
  if (!definition) return;
  const categoryKey = source === "weapon" ? "attack" : definition.category;
  const category = DATA.categories[categoryKey];
  const stats = source === "weapon" ? DATA.weaponStats[key] : DATA.cardStats[key];
  const art = $("#deck-info-art");
  art.className = `pixel-sprite pixel-portrait-fallback pixel-${source}-${key}`;
  $("#deck-info-short").textContent = definition.short;
  $("#deck-info-category").innerHTML = `<span></span> ${escapeMarkup(category.name.toUpperCase())} INFORMATION`;
  $("#deck-info-name").textContent = definition.name.toUpperCase();
  $("#deck-info-meta").textContent = `${category.name.toUpperCase()} / ${(source === "weapon" ? "WEAPON" : definition.type).toUpperCase()}`;
  $("#deck-info-cost").textContent = `${definition.cost} TAPS`;
  $("#deck-info-description").textContent = definition.description;
  $("#deck-info-stats").innerHTML = (stats || []).map(stat => `<b role="listitem">${escapeMarkup(stat)}</b>`).join("");
  const position = source === "card" ? deckPosition(key) : -1;
  $("#deck-info-membership").textContent = source === "weapon" ? (builderWeapon === key ? "Selected as your always-available weapon." : "Available as an alternate permanent weapon.") : position >= 0 ? `Currently in draw position ${position + 1}.` : "Not currently in your draw order.";
  openLifecycleDialog($("#deck-info-modal"), $("#deck-info-name"), origin);
}
function closeDeckInfo() { closeLifecycleDialog($("#deck-info-modal")); }
function openReplacementSheet(key, origin) {
  if (!ownsDefinition(DATA.cards, key) || builderDeck.includes(key) || builderDeck.length > DATA.deckSize) return;
  replacementCandidate = key;
  $(`[data-library-card="${key}"]`)?.classList.add("is-replacement-candidate");
  const full = builderDeck.length === DATA.deckSize;
  $("#deck-replace-title").textContent = `CHOOSE A POSITION FOR ${DATA.cards[key].name.toUpperCase()}`;
  $("#deck-replace-copy").textContent = full ? `Choose the draw position to replace with ${DATA.cards[key].name}. The complete deck auto-saves immediately.` : `Choose where to insert ${DATA.cards[key].name}. Existing cards keep their relative order.`;
  const positions = full ? builderDeck.map((deckKey, index) => ({ index, deckKey, label: `REPLACE #${index + 1}` })) : Array.from({ length: builderDeck.length + 1 }, (_, index) => ({ index, deckKey: builderDeck[index] || null, label: `INSERT AS #${index + 1}` }));
  $("#deck-replacement-options").innerHTML = positions.map(({ index, deckKey, label }) => `<article role="listitem"><button class="replacement-slot" type="button" data-replace-slot="${index}" data-card-key="${deckKey || ""}" aria-label="${full ? `Replace ${escapeMarkup(DATA.cards[deckKey].name)} at draw position ${index + 1}` : `Insert ${escapeMarkup(DATA.cards[key].name)} at draw position ${index + 1}`}"><span class="replacement-slot__position">${label}</span>${deckKey ? cardFrame(deckKey, { variant: "deck" }) : `<span class="replacement-slot__empty">END OF CYCLE</span>`}</button></article>`).join("");
  openLifecycleDialog($("#deck-replace-modal"), $("#deck-replace-title"), origin);
}
function closeReplacementSheet(options = {}) {
  if (replacementCandidate) $(`[data-library-card="${replacementCandidate}"]`)?.classList.remove("is-replacement-candidate");
  replacementCandidate = null;
  closeLifecycleDialog($("#deck-replace-modal"), options);
}
function chooseArmoryCard(key, origin) {
  if (!ownsDefinition(DATA.cards, key)) return;
  if (builderDeck.includes(key)) {
    identifyDeckMember(key);
    return;
  }
  openReplacementSheet(key, origin?.querySelector?.('[data-card-action="choose"]') || origin);
}
function placeArmoryCard(index, key, origin) {
  if (!ownsDefinition(DATA.cards, key) || builderDeck.includes(key)) return false;
  return builderDeck.length === DATA.deckSize ? replaceDeckCard(index, key, origin) : addDeckCard(key, origin, index);
}
function resetDeckBrowse() {
  builderSearch = "";
  builderFilter = "all";
  builderSort = "recommended";
  updateLibraryState({ animate: true });
  announceDeck("Armory search, category, and sort reset.");
}
function dismissDeckHint() {
  deckHintDismissed = true;
  const candidate = { ...profile, deckHintDismissed: true };
  if (saveProfile(candidate)) profile = candidate;
  $("#deck-builder-title").focus({ preventScroll: true });
  updateDeckStatus();
  announceDeck("Deck guidance dismissed. The same instructions remain available to assistive technology.");
}
function applyDeckDragPreview(from, to) {
  clearDeckDragVisuals({ keepAvatar: true });
  const slots = $$("#builder-deck [data-deck-slot]");
  const order = Array.from({ length: builderDeck.length }, (_, index) => index);
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  order.forEach((oldIndex, newIndex) => {
    const controls = slots[oldIndex]?.querySelectorAll(".deck-slot__select, .deck-slot__info");
    if (!controls?.length || oldIndex === newIndex) return;
    const start = slots[oldIndex].getBoundingClientRect();
    const end = slots[newIndex].getBoundingClientRect();
    controls.forEach(control => { control.style.transform = `translate(${Math.round(end.left - start.left)}px, ${Math.round(end.top - start.top)}px)`; });
    slots[oldIndex].classList.add("is-shifting");
  });
  slots[from]?.classList.add("is-dragging");
  slots[to]?.classList.add("is-drop-target");
}
function beginKeyboardDeckDrag(index) {
  const key = builderDeck[index];
  if (!key) return;
  activeDeckSlot = -1;
  expandedArmoryKey = null;
  deckKeyboardDrag = { key, from: index, proposed: index };
  updateDeckSlots();
  updateLibraryState({ animate: true });
  applyDeckDragPreview(index, index);
  announceDeck(`${DATA.cards[key].name} picked up from position ${index + 1}. Use Arrow keys, Home, or End to choose a position; Space drops and Escape cancels.`);
}
function cancelKeyboardDeckDrag() {
  if (!deckKeyboardDrag) return;
  const { key, from } = deckKeyboardDrag;
  deckKeyboardDrag = null;
  suppressDeckClick = false;
  clearDeckDragVisuals();
  updateDeckSlots({ key, action: "select" });
  announceDeck(`${DATA.cards[key].name} movement canceled. It remains in position ${from + 1}.`);
}
function handleDeckReorderKey(event) {
  const control = event.target.closest('[data-slot-action="select"]');
  if (!control || !event.currentTarget.contains(control)) return;
  const index = Number(control.closest("[data-deck-slot]")?.dataset.deckSlot);
  if (!Number.isInteger(index) || !builderDeck[index]) return;
  if (!deckKeyboardDrag) {
    if (event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    event.stopPropagation();
    suppressDeckClick = true;
    beginKeyboardDeckDrag(index);
    return;
  }
  if (deckKeyboardDrag.key !== control.dataset.cardKey) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    suppressDeckClick = true;
    cancelKeyboardDeckDrag();
    return;
  }
  if (event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    event.stopPropagation();
    suppressDeckClick = true;
    const drag = deckKeyboardDrag;
    deckKeyboardDrag = null;
    clearDeckDragVisuals();
    if (!reorderDeck(drag.from, drag.proposed)) {
      updateDeckSlots({ key: drag.key, action: "select" });
      announceDeck(`${DATA.cards[drag.key].name} returned to position ${drag.from + 1}.`);
    }
    return;
  }
  let proposed = deckKeyboardDrag.proposed;
  if (event.key === "ArrowLeft") proposed--;
  else if (event.key === "ArrowRight") proposed++;
  else if (event.key === "ArrowUp") proposed -= 3;
  else if (event.key === "ArrowDown") proposed += 3;
  else if (event.key === "Home") proposed = 0;
  else if (event.key === "End") proposed = builderDeck.length - 1;
  else return;
  event.preventDefault();
  event.stopPropagation();
  proposed = clamp(proposed, 0, builderDeck.length - 1);
  if (proposed === deckKeyboardDrag.proposed) return;
  deckKeyboardDrag.proposed = proposed;
  applyDeckDragPreview(deckKeyboardDrag.from, proposed);
  announceDeck(`${DATA.cards[deckKeyboardDrag.key].name} proposed for position ${proposed + 1}.`);
}
function positionDeckDragAvatar(state, x, y) {
  if (!state.avatar) return;
  state.avatar.style.left = `${Math.round(x - state.avatar.offsetWidth / 2)}px`;
  state.avatar.style.top = `${Math.round(y - 28)}px`;
}
function beginPointerDeckDrag(state) {
  if (deckPointerDrag !== state || state.active) return;
  if (state.holdTimer) clearTimeout(state.holdTimer);
  state.holdTimer = null;
  state.active = true;
  if (activeDeckSlot >= 0 || expandedArmoryKey) {
    activeDeckSlot = -1;
    expandedArmoryKey = null;
    updateDeckSlots();
    updateLibraryState({ animate: true });
  }
  state.capture.setPointerCapture?.(state.pointerId);
  const avatar = document.createElement("div");
  avatar.className = "deck-drag-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.innerHTML = cardFrame(state.key, { variant: "deck" });
  document.body.append(avatar);
  state.avatar = avatar;
  positionDeckDragAvatar(state, state.lastX, state.lastY);
  applyDeckDragPreview(state.from, state.proposed);
  suppressDeckClick = true;
  announceDeck(`${DATA.cards[state.key].name} picked up from position ${state.from + 1}. Drag to another numbered position.`);
}
function handleDeckPointerDown(event) {
  if (event.button !== 0 || !event.isPrimary || deckPointerDrag || deckKeyboardDrag) return;
  const control = event.target.closest('.deck-slot__select');
  if (!control || !event.currentTarget.contains(control)) return;
  const slot = control.closest("[data-deck-slot]");
  const index = Number(slot?.dataset.deckSlot);
  const key = builderDeck[index];
  if (!key) return;
  const state = { pointerId: event.pointerId, pointerType: event.pointerType, from: index, proposed: index, validDrop: true, key, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, capture: event.currentTarget, active: false, holdTimer: null, avatar: null };
  deckPointerDrag = state;
  if (event.pointerType === "touch") state.holdTimer = setTimeout(() => beginPointerDeckDrag(state), 220);
}
function handleDeckPointerMove(event) {
  const state = deckPointerDrag;
  if (!state || state.pointerId !== event.pointerId) return;
  state.lastX = event.clientX;
  state.lastY = event.clientY;
  const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
  if (!state.active && state.pointerType === "touch" && distance >= 8) {
    if (state.holdTimer) clearTimeout(state.holdTimer);
    deckPointerDrag = null;
    return;
  }
  if (!state.active && state.pointerType !== "touch" && distance >= 6) beginPointerDeckDrag(state);
  if (!state.active) return;
  event.preventDefault();
  positionDeckDragAvatar(state, event.clientX, event.clientY);
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-deck-slot]");
  const proposed = Number(target?.dataset.deckSlot);
  state.validDrop = Number.isInteger(proposed) && proposed >= 0 && proposed < builderDeck.length;
  if (state.validDrop && proposed !== state.proposed) {
    state.proposed = proposed;
    applyDeckDragPreview(state.from, proposed);
    announceDeck(`${DATA.cards[state.key].name} over position ${proposed + 1}.`);
  }
  const screen = $("#deck-screen");
  if (event.clientY < 76) screen.scrollTop = Math.max(0, screen.scrollTop - 12);
  else if (event.clientY > innerHeight - 112) screen.scrollTop += 12;
}
function finishDeckPointerDrag(event, canceled = false) {
  const state = deckPointerDrag;
  if (!state || state.pointerId !== event.pointerId) return;
  if (state.holdTimer) clearTimeout(state.holdTimer);
  deckPointerDrag = null;
  if (!state.active) return;
  event.preventDefault();
  if (state.capture.hasPointerCapture?.(state.pointerId)) state.capture.releasePointerCapture(state.pointerId);
  state.avatar?.remove();
  clearDeckDragVisuals();
  suppressDeckClick = true;
  setTimeout(() => { suppressDeckClick = false; }, 0);
  if (canceled || !state.validDrop || state.from === state.proposed) {
    updateDeckSlots({ key: state.key, action: "select" });
    announceDeck(canceled || !state.validDrop ? `${DATA.cards[state.key].name} movement canceled. It remains in position ${state.from + 1}.` : `${DATA.cards[state.key].name} returned to position ${state.from + 1}.`);
  } else reorderDeck(state.from, state.proposed);
}
function cancelPointerDeckDrag() {
  const state = deckPointerDrag;
  if (!state) return false;
  if (state.holdTimer) clearTimeout(state.holdTimer);
  deckPointerDrag = null;
  suppressDeckClick = true;
  if (!state.active) return true;
  if (state.capture.hasPointerCapture?.(state.pointerId)) state.capture.releasePointerCapture(state.pointerId);
  state.avatar?.remove();
  clearDeckDragVisuals();
  updateDeckSlots({ key: state.key, action: "select" });
  announceDeck(`${DATA.cards[state.key].name} movement canceled. It remains in position ${state.from + 1}.`);
  return true;
}
function finishGlobalDeckPointer(event, canceled = false) {
  const hadDrag = Boolean(deckPointerDrag);
  finishDeckPointerDrag(event, canceled);
  if (!hadDrag && suppressDeckClick) setTimeout(() => { suppressDeckClick = false; }, 0);
}
function laneOccupant(player, category) {
  if (!player || !category) return null;
  if (category === "attack" && (player.weaponProgress > 0 || player.pending.some(job => job.source === "weapon"))) return { source: "weapon", key: player.weapon };
  const placed = player.placed?.[category];
  if (placed && (player.cardProgress[placed.key] || 0) > 0) return { source: "card", key: placed.key };
  const pending = player.pending.find(job => job.source === "card" && DATA.cards[job.key]?.category === category);
  return pending ? { source: "card", key: pending.key } : null;
}
function laneBlocked(player, source, key) {
  const category = source === "weapon" ? "attack" : DATA.cards[key]?.category;
  const occupant = laneOccupant(player, category);
  return Boolean(occupant && (occupant.source !== source || occupant.key !== key));
}
function cardButton(key, slot) {
  if (!key) return `<div class="action-card hand-placeholder" data-hand-placeholder="${slot}" aria-label="Card ${slot + 1} is queued on the battlefield"><span>${slot + 1}</span><b>QUEUED</b></div>`;
  const card = DATA.cards[key];
  const category = DATA.categories[card.category];
  return `<button class="action-card battle-card category-${card.category}" data-hand-slot="${slot}" data-card-key="${key}" data-busy-label="${category.name.toUpperCase()} IS BUSY" aria-label="Place ${card.name} in the ${category.name} zone. Press I or F2 for details." aria-keyshortcuts="I F2" style="--card-color:${card.color};--category-color:${category.color}">${cardFrame(key, { variant: "battle", accessibleName: `${card.name}, ${category.name}, ${card.cost} taps` })}</button>`;
}
function renderBattleHand() {
  const player = me();
  if (!player) return;
  const hand = $("#battle-hand");
  const handSignature = player.hand.map(key => key || "_").join("|");
  if (hand.dataset.signature !== handSignature) {
    if (inspectedElement && hand.contains(inspectedElement)) hideCardInspector();
    hand.innerHTML = player.hand.map((key, slot) => cardButton(key, slot)).join("");
    hand.dataset.signature = handSignature;
  }
  $$('#battle-hand [data-hand-slot]').forEach(button => {
    const slot = Number(button.dataset.handSlot);
    const key = player.hand[slot];
    const card = DATA.cards[key];
    const blocked = Boolean(laneOccupant(player, card.category));
    toggleClass(button, "disabled", blocked);
    if (button.disabled) button.disabled = false;
    setAttribute(button, "aria-disabled", blocked);
    setDataset(button, "busyLabel", `${DATA.categories[card.category].name.toUpperCase()} IS BUSY`);
  });
  const next = DATA.cards[player.nextCard];
  setText($("#next-card-label"), next ? `NEXT: ${next.name.toUpperCase()}` : "NEXT: --");
  const weapon = DATA.weapons[player.weapon];
  const weaponArt = $("#weapon-short");
  const weaponButton = $("#weapon-card");
  if (weaponButton.dataset.weaponKey !== player.weapon) {
    weaponArt.className = `pixel-sprite pixel-portrait-fallback pixel-weapon-${player.weapon}`;
    weaponArt.innerHTML = `<b>${escapeMarkup(weapon.short)}</b>`;
    setText($("#weapon-name"), weapon.name.toUpperCase());
    setText($("#weapon-cost"), weapon.cost);
    setStyle(weaponButton, "--card-color", weapon.color);
    weaponButton.dataset.weaponKey = player.weapon;
  }
  const weaponPending = player.pending.some(job => job.source === "weapon");
  toggleClass(weaponButton, "pending", weaponPending);
  toggleClass(weaponButton, "high-threat", weaponPending && player.weapon === "cannon");
  const weaponBlocked = laneBlocked(player, "weapon", player.weapon);
  toggleClass(weaponButton, "disabled", weaponBlocked);
  if (weaponButton.disabled) weaponButton.disabled = false;
  setAttribute(weaponButton, "aria-disabled", weaponBlocked);
  setStyle(weaponButton.querySelector(".action-progress"), "width", `${player.weaponProgress / weapon.cost * 100}%`);
  setAttribute(weaponButton, "aria-label", `${weaponBlocked ? "Attack is busy. " : "Tap to load "}${weapon.name}. ${player.weaponProgress} of ${weapon.cost} taps committed. Press I or F2 for details.`);
}

function renderStructures(prefix, player) {
  const element = $(`#${prefix}-structures`);
  const signature = player.structures.join("|");
  if (element.dataset.signature === signature) return;
  element.dataset.signature = signature;
  const owner = prefix === "own" ? "Your" : "Rival";
  const builtNames = player.structures.map(key => DATA.cards[key]?.name).filter(Boolean);
  setAttribute(element, "aria-label", `${owner} structures, ${builtNames.length} of 8 built${builtNames.length ? `: ${builtNames.join(", ")}` : ""}.`);
  element.innerHTML = Array.from({ length: 8 }, (_, index) => {
    const key = player.structures[index];
    if (!key) return `<i class="structure-tile empty" aria-hidden="true"><span>${index + 1}</span></i>`;
    const card = DATA.cards[key];
    return `<i class="structure-tile built" role="listitem" aria-label="${escapeMarkup(card.name)}" style="--structure-color:${card.color}" title="${escapeMarkup(card.name)}"><span class="structure-art pixel-sprite pixel-structure-${key}" aria-hidden="true"></span><b aria-hidden="true">${escapeMarkup(card.short)}</b></i>`;
  }).join("");
}
function renderWall(prefix, player) {
  const element = $(`#${prefix}-wall`);
  toggleClass(element, "broken", player.wallHp <= 0 && player.shield <= 0);
  toggleClass(element, "shielded", player.shield > 0);
  setStyle($(`#${prefix}-wall-bar`), "width", `${clamp(player.wallHp / player.wallCap * 100, 0, 100)}%`);
  setStyle($(`#${prefix}-shield-bar`), "width", `${clamp(player.shield / 90 * 100, 0, 100)}%`);
  setText($(`#${prefix}-wall-value`), Math.ceil(player.wallHp));
  setText($(`#${prefix}-shield-value`), Math.ceil(player.shield));
  setAttribute(element, "aria-label", `${prefix === "own" ? "Your" : "Rival"} defenses: ${Math.ceil(player.shield)} Shield and ${Math.ceil(player.wallHp)} Wall`);
}
function applyCue(element, progress, pending, visible = true) {
  if (!element) return;
  setStyle(element, "--load", pending ? 1 : progress);
  toggleClass(element, "project-active", progress > 0 && !pending);
  toggleClass(element, "project-pending", pending);
  toggleClass(element, "weapon-disabled", !visible && progress <= 0 && !pending);
}
function cueState(player, category) {
  let progress = 0;
  if (category === "attack") progress = player.weaponProgress / DATA.weapons[player.weapon].cost;
  const placedKey = player.placed?.[category]?.key;
  if (placedKey) progress = Math.max(progress, (player.cardProgress[placedKey] || 0) / DATA.cards[placedKey].cost);
  const pending = player.pending.some(job => job.source === "weapon" ? category === "attack" : DATA.cards[job.key]?.category === category);
  return { progress, pending };
}
function siphonTarget(player, attacker, category) {
  const candidates = [];
  const weapon = DATA.weapons[player.weapon];
  if (category === "attack" && player.weaponProgress > 0 && !player.pending.some(job => job.source === "weapon")) {
    candidates.push({ source: "weapon", key: player.weapon, progress: player.weaponProgress / weapon.cost });
  }
  const placedKey = player.placed?.[category]?.key;
  if (placedKey) {
    const card = DATA.cards[placedKey];
    if ((player.cardProgress[placedKey] || 0) > 0 && !player.pending.some(job => job.source === "card" && job.key === placedKey)) {
      candidates.push({ source: "card", key: placedKey, progress: player.cardProgress[placedKey] / card.cost });
    }
  }
  candidates.sort((a, b) => {
    const aLocked = attacker?.siphons?.[`${a.source}:${a.key}`]?.totalTaps > 0 ? 1 : 0;
    const bLocked = attacker?.siphons?.[`${b.source}:${b.key}`]?.totalTaps > 0 ? 1 : 0;
    return bLocked - aLocked || b.progress - a.progress;
  });
  return candidates[0] || null;
}
function setSiphonCue(element, target, attacker) {
  if (!element) return;
  const lock = target ? attacker?.siphons?.[`${target.source}:${target.key}`] : null;
  const inspectable = Boolean(element.dataset.inspectKey || element.dataset.actionKey);
  toggleClass(element, "counterable", Boolean(target));
  toggleClass(element, "siphon-locked", Boolean(lock?.totalTaps));
  const tabIndex = target || inspectable ? 0 : -1;
  if (element.tabIndex !== tabIndex) element.tabIndex = tabIndex;
  setAttribute(element, "aria-disabled", !target);
  if (!target) {
    delete element.dataset.siphonSource;
    delete element.dataset.siphonKey;
    delete element.dataset.siphonDots;
    return;
  }
  setDataset(element, "siphonSource", target.source);
  setDataset(element, "siphonKey", target.key);
  setDataset(element, "siphonDots", `${"●".repeat(lock?.burst || 0)}${"○".repeat(3 - (lock?.burst || 0))}`);
  const definition = target.source === "weapon" ? DATA.weapons[target.key] : DATA.cards[target.key];
  setAttribute(element, "aria-label", `Siphon rival ${definition?.name || target.key}. ${lock?.burst || 0} of 3 burst taps. Press Enter or Space to siphon; press I or F2 for details.`);
}
function cueElement(prefix, category) { return $(`#${prefix}-${category === "attack" ? "weapon" : category}`); }
function renderQueuedAction(prefix, player, category, siphon = null) {
  const element = $(`#${prefix}-action-${category}`);
  const entry = player.placed?.[category];
  const pendingJob = player.pending.find(job => job.source === "card" && DATA.cards[job.key]?.category === category);
  const key = entry?.key || pendingJob?.key;
  if (!key) {
    if (inspectedElement === element) hideCardInspector();
    toggleClass(element, "hidden", true);
    delete element.dataset.actionKey;
    delete element.dataset.inspectSource;
    delete element.dataset.inspectKey;
    return;
  }
  const card = DATA.cards[key];
  const progress = pendingJob ? card.cost : player.cardProgress[key] || 0;
  const laneConflict = laneBlocked(player, "card", key);
  const blocked = Boolean(pendingJob || player.taps < 1 || laneConflict);
  toggleClass(element, "hidden", false);
  toggleClass(element, "locked", blocked);
  toggleClass(element, "pending", Boolean(pendingJob));
  setStyle(element, "--action-color", card.color);
  setStyle(element, "--action-progress", progress / card.cost);
  setDataset(element, "actionKey", key);
  if (prefix === "enemy") {
    setDataset(element, "inspectSource", "card");
    setDataset(element, "inspectKey", key);
  }
  if (element.dataset.frameKey !== key) {
    element.querySelector(".queued-frame-slot").innerHTML = cardFrame(key, { variant: "queued", accessibleName: card.name });
    element.dataset.frameKey = key;
  }
  const queuedFrame = element.querySelector(".card-frame");
  if (queuedFrame) toggleClass(queuedFrame, "is-pending", Boolean(pendingJob));
  setText(element.querySelector(".commit-icon"), card.short);
  const categoryName = DATA.categories[category].name.toUpperCase();
  setText(element.querySelector(".commit-copy small"), pendingJob ? "WINDING UP" : prefix === "enemy" ? `${categoryName} ${progress > 0 ? "ACTIVE" : "STAGED"}` : laneConflict ? `${categoryName} BUSY` : player.taps < 1 ? "WAIT FOR TAPS" : `TAP ${categoryName}`);
  setText(element.querySelector(".commit-copy strong"), card.name.toUpperCase());
  setText(element.querySelector(":scope > em"), `${progress}/${card.cost}`);
  if (!siphon) {
    const label = `${prefix === "enemy" ? "Rival" : "Your"} ${card.name}. ${progress} of ${card.cost} taps committed${pendingJob ? ", winding up" : ""}. Press I or F2 for details.`;
    setAttribute(element, "aria-label", label);
  }
  toggleClass(element, "high-threat", Boolean(pendingJob && ["timeBomb", "cannon"].includes(key)));
  if (prefix === "own") {
    if (element.disabled) element.disabled = false;
    setAttribute(element, "aria-disabled", blocked);
  }
}
function renderProjectCues(prefix, player, attacker = null) {
  const weapon = DATA.weapons[player.weapon];
  const weaponElement = cueElement(prefix, "attack");
  toggleClass(weaponElement, "cannon", player.weapon === "cannon");
  toggleClass(weaponElement, "volley", player.weapon === "volley");
  const weaponPending = player.pending.some(job => job.source === "weapon");
  toggleClass(weaponElement, "high-threat", weaponPending && player.weapon === "cannon");
  setText(weaponElement.querySelector(".weapon-label"), weapon.short);
  if (prefix === "enemy") {
    setDataset(weaponElement, "inspectSource", "weapon");
    setDataset(weaponElement, "inspectKey", player.weapon);
  }
  if (prefix === "own") setAttribute(weaponElement, "aria-label", `Your ${weapon.name} and Attack commitment`);
  for (const category of ["attack", "crew", "magic"]) {
    const state = cueState(player, category);
    const element = cueElement(prefix, category);
    const target = prefix === "enemy" ? siphonTarget(player, attacker, category) : null;
    applyCue(element, state.progress, state.pending, true);
    if (prefix === "enemy" && !target) {
      const name = category === "attack" ? `${weapon.name} and Attack` : DATA.categories[category].name;
      setAttribute(element, "aria-label", `Rival ${name} commitment. Press I or F2 for details.`);
    }
    setSiphonCue(element, target, attacker);
    renderQueuedAction(prefix, player, category, target);
    if (prefix === "enemy") setSiphonCue($(`#enemy-action-${category}`), target, attacker);
  }
}
function renderPhase(phase) {
  const copy = PHASE_COPY[phase.key];
  const banner = $("#phase-banner");
  const signature = `${phase.key}:${phase.tapMultiplier}`;
  if (banner.dataset.signature !== signature) {
    banner.className = `phase-banner ${phase.key} ${phase.tapMultiplier === 2 ? "double-taps" : ""}`;
    banner.dataset.signature = signature;
    setText($("#phase-number"), copy.number);
    setText($("#phase-kicker"), phase.tapMultiplier === 2 ? "3:00 ESCALATION" : copy.kicker);
    setText($("#phase-name"), phase.tapMultiplier === 2 ? "DOUBLE TAPS" : copy.name);
    setText($("#phase-rule"), phase.tapMultiplier === 2 ? "All tap generation x2" : copy.rule);
  }
  if (lastPhase && lastPhase !== phase.key) {
    toast(phase.key === "clash" ? "CORE SHIELDS DOWN - FULL DAMAGE" : "OVERLOAD - DAMAGE RISING, WALLS WEAKENING");
    tone(phase.key === "overload" ? 110 : 440, .2, "sawtooth", .05);
  }
  if (phase.tapMultiplier === 2 && !lastDoubleTaps) {
    toast("DOUBLE TAPS - ALL TAP GENERATION x2");
    tone(620, .28, "sawtooth", .06);
  }
  lastDoubleTaps = phase.tapMultiplier === 2;
  lastPhase = phase.key;
}
const MAX_EFFECT_NODES = 18;
function effectTarget(side, layer) {
  const prefix = side === ownSide ? "own" : "enemy";
  if (layer === "core" || layer === "taps") return $(`.${prefix}-core`);
  return $(`#${prefix}-wall`);
}
function addEffectNode(className) {
  const overlay = $("#battle-effects");
  while (overlay.children.length >= MAX_EFFECT_NODES) overlay.firstElementChild.remove();
  const node = document.createElement("i");
  node.className = className;
  overlay.appendChild(node);
  return node;
}
function placeEffect(node, target) {
  if (!node || !target) return;
  const arena = $("#arena").getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  node.style.left = `${rect.left - arena.left + rect.width / 2}px`;
  node.style.top = `${rect.top - arena.top + rect.height / 2}px`;
}
function floatDelta(side, layer, amount) {
  if (!Number.isFinite(amount) || Math.abs(amount) < .01) return;
  const target = effectTarget(side, layer);
  const node = addEffectNode(`effect-delta ${amount > 0 ? "positive" : "damage"} layer-${layer}`);
  node.textContent = `${amount > 0 ? "+" : "−"}${Math.round(Math.abs(amount))}`;
  placeEffect(node, target);
  setTimeout(() => node.remove(), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 900 : 650);
}
function reactTarget(side, layer) {
  const target = effectTarget(side, layer);
  if (!target) return;
  target.classList.remove("impact-shield", "impact-wall", "impact-core");
  void target.offsetWidth;
  target.classList.add(`impact-${layer}`);
  setTimeout(() => target.classList.remove(`impact-${layer}`), 240);
}
function targetEffect(side, layer, positive = false) {
  const target = effectTarget(side, layer);
  if (!target || layer === "taps") return;
  const sprite = layer === "wall" ? "pixel-effect-debris" : "pixel-effect-impact";
  const node = addEffectNode(`pixel-sprite ${sprite} effect-burst layer-${layer}${positive ? " restoration" : ""}`);
  placeEffect(node, target);
  setTimeout(() => node.remove(), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 520 : 360);
}
function projectileSource(event) {
  const prefix = event.side === ownSide ? "own" : "enemy";
  if (DATA.weapons[event.source]) return $(`#${prefix}-weapon`);
  const category = DATA.cards[event.source]?.category;
  return category ? $(`#${prefix}-action-${category}`) : $(`#${prefix}-weapon`);
}
function eventEffectPresentation(event) {
  if (DATA.cards[event?.card]) return effectPresentation(event.card);
  if (DATA.cards[event?.source]) return effectPresentation(event.source);
  if (DATA.weapons[event?.source]) return effectPresentation(event.source, "weapon");
  if (event?.source === "weapon" && DATA.weapons[event.key]) return effectPresentation(event.key, "weapon");
  if (event?.source === "card" && DATA.cards[event.key]) return effectPresentation(event.key);
  return null;
}
function familyEffect(event, options = {}) {
  const presentation = eventEffectPresentation(event);
  const side = options.side || event.side;
  const layer = options.layer || "core";
  const target = options.target || effectTarget(side, layer);
  if (!presentation || !target) return null;
  const intensity = Number.isFinite(options.intensity) ? options.intensity : presentation.intensity;
  const node = addEffectNode(`pixel-sprite ${presentation.className} effect-family effect-family-${presentation.family}${options.positive ? " positive" : ""}`);
  node.dataset.effectFamily = presentation.family;
  node.dataset.effectSource = presentation.key;
  node.style.setProperty("--effect-color", options.color || presentation.color);
  node.style.setProperty("--effect-intensity", intensity);
  node.style.setProperty("--effect-scale", .8 + .25 * intensity);
  placeEffect(node, target);
  setTimeout(() => node.remove(), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 720 : 520);
  return node;
}
function travelProjectile(event, layer) {
  const source = projectileSource(event);
  const target = effectTarget(event.targetSide, layer);
  const presentation = eventEffectPresentation(event);
  if (!source || !target || !presentation) return;
  const intensity = presentation.intensity;
  const node = addEffectNode(`pixel-sprite ${presentation.className} effect-family effect-family--travel effect-family-${presentation.family}`);
  node.dataset.effectFamily = presentation.family;
  node.dataset.effectSource = presentation.key;
  node.style.setProperty("--effect-color", presentation.color);
  node.style.setProperty("--effect-intensity", intensity);
  node.style.setProperty("--effect-scale", .8 + .25 * intensity);
  const arena = $("#arena").getBoundingClientRect();
  const start = source.getBoundingClientRect();
  const end = target.getBoundingClientRect();
  const startX = start.left - arena.left + start.width / 2;
  const startY = start.top - arena.top + start.height / 2;
  const moveX = end.left + end.width / 2 - (start.left + start.width / 2);
  const moveY = end.top + end.height / 2 - (start.top + start.height / 2);
  node.style.left = `${startX}px`;
  node.style.top = `${startY}px`;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    node.style.transform = `translate(${moveX}px,${moveY}px)`;
    setTimeout(() => node.remove(), 240);
    return;
  }
  const animation = node.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1 },
    { transform: `translate(${moveX * .5}px,${moveY * .5 - (8 + 12 * intensity)}px) scale(${.85 + .3 * intensity})`, opacity: 1, offset: .55 },
    { transform: `translate(${moveX}px,${moveY}px) scale(.75)`, opacity: .1 }
  ], { duration: 130 + 60 * intensity, easing: "steps(5,end)", fill: "forwards" });
  animation.finished.finally(() => node.remove());
}
function siphonPull(event, target) {
  const destination = effectTarget(event.side, "core");
  if (!target || !destination) return;
  const node = addEffectNode("pixel-sprite pixel-effect-siphon-pip effect-siphon-pull");
  const arena = $("#arena").getBoundingClientRect();
  const start = target.getBoundingClientRect();
  const end = destination.getBoundingClientRect();
  const moveX = end.left + end.width / 2 - (start.left + start.width / 2);
  const moveY = end.top + end.height / 2 - (start.top + start.height / 2);
  node.style.left = `${start.left - arena.left + start.width / 2}px`;
  node.style.top = `${start.top - arena.top + start.height / 2}px`;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    node.style.transform = `translate(${moveX}px,${moveY}px)`;
    setTimeout(() => node.remove(), 420);
    return;
  }
  const animation = node.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1 },
    { transform: `translate(${moveX}px,${moveY}px) scale(.75)`, opacity: .2 }
  ], { duration: 210, easing: "steps(5,end)", fill: "forwards" });
  animation.finished.finally(() => node.remove());
}
function showOutcomeDeltas(event) {
  if (!event.outcomes || typeof event.outcomes !== "object") return;
  for (const [sideKey, fields] of Object.entries(event.outcomes)) {
    const side = Number(sideKey);
    if (![1, 2].includes(side) || !fields || typeof fields !== "object") continue;
    for (const [field, change] of Object.entries(fields)) {
      if (!change || !Number.isFinite(change.delta)) continue;
      const layer = { coreHp: "core", wallHp: "wall", shield: "shield", taps: "taps" }[field];
      if (!layer) continue;
      const damageAlreadyShown = event.targetSide === side && change.delta < 0 && Number(event.damage?.[layer] || 0) > 0;
      if (!damageAlreadyShown) floatDelta(side, layer, change.delta);
      if (change.delta > 0 && layer !== "taps") {
        reactTarget(side, layer);
        targetEffect(side, layer, true);
      }
    }
  }
}
function showResolutionFamily(event) {
  const presentation = eventEffectPresentation(event);
  if (!presentation) return;
  const candidates = [];
  for (const [sideKey, fields] of Object.entries(event.outcomes || {})) {
    const side = Number(sideKey);
    if (![1, 2].includes(side) || !fields || typeof fields !== "object") continue;
    const changes = Object.entries(fields)
      .filter(([, change]) => change && Number.isFinite(change.delta) && Math.abs(change.delta) >= .01)
      .sort(([leftField, left], [rightField, right]) => (rightField !== "taps") - (leftField !== "taps") || Math.abs(right.delta) - Math.abs(left.delta));
    if (!changes.length) continue;
    const [field, change] = changes[0];
    candidates.push({ side, layer: { coreHp: "core", wallHp: "wall", shield: "shield", taps: "taps" }[field] || "core", positive: change.delta > 0 });
  }
  if (!candidates.length) {
    const hostile = ["delay", "counter"].includes(presentation.family);
    candidates.push({ side: hostile ? other(event.side) : event.side, layer: "core", positive: !hostile });
  }
  for (const candidate of candidates.slice(0, 2)) familyEffect(event, candidate);
}
function announceCombat(message) {
  const status = $("#combat-status");
  status.textContent = "";
  requestAnimationFrame(() => { status.textContent = message; });
}
function animateEvent(event) {
  if (!event || event.id <= lastEventId) return;
  if (["hit", "wallBreak"].includes(event.type)) {
    const damage = event.damage && typeof event.damage === "object" ? event.damage : { [event.target || "core"]: event.amount };
    const layers = ["shield", "wall", "core"].filter(layer => Number(damage[layer]) > 0);
    const deepest = layers.at(-1) || event.target || "core";
    const targetSide = event.targetSide || (event.side === 1 ? 2 : 1);
    travelProjectile({ ...event, targetSide }, deepest);
    for (const layer of layers) {
      floatDelta(targetSide, layer, -Number(damage[layer]));
      reactTarget(targetSide, layer);
      targetEffect(targetSide, layer);
    }
    const presentation = eventEffectPresentation(event);
    tone(presentation?.pitch || 180, .13, "square", .055);
    if (event.type === "wallBreak") {
      const message = event.targetSide === ownSide ? "YOUR WALL IS DOWN" : "RIVAL WALL IS DOWN";
      toast(message, "notice", false);
      announceCombat(message);
    }
  }
  if (event.type === "place" && [1, 2].includes(event.side) && DATA.categories[event.category]) {
    const element = $(`#${event.side === ownSide ? "own" : "enemy"}-action-${event.category}`);
    element?.classList.add("arrived");
    setTimeout(() => element?.classList.remove("arrived"), 360);
  }
  if (event.type === "siphon") {
    const ownAttack = event.side === ownSide;
    const category = event.source === "weapon" ? "attack" : DATA.cards[event.key]?.category;
    const element = cueElement(ownAttack ? "enemy" : "own", category);
    if (element) {
      element.classList.remove(event.removed ? "siphon-hit" : "siphon-tap");
      void element.offsetWidth;
      element.classList.add(event.removed ? "siphon-hit" : "siphon-tap");
      setTimeout(() => element.classList.remove("siphon-hit", "siphon-tap"), 230);
      siphonPull(event, element);
    }
    tone(event.removed ? 680 : 510, event.removed ? .09 : .035, "triangle", .035);
    if (event.removed) toast(ownAttack ? `SIPHONED ${event.removed} TAP${event.removed === 1 ? "" : "S"}` : `RIVAL SIPHONED ${event.removed} TAP${event.removed === 1 ? "" : "S"}`);
  }
  if (event.type === "commit" && event.side !== ownSide && event.key === "timeBomb") {
    toast(`RIVAL ${DATA.cards.timeBomb.name.toUpperCase()} ARMED`, "warning", false);
    announceCombat("Rival high-threat ritual is winding up.");
  }
  if (event.type === "card") showResolutionFamily(event);
  showOutcomeDeltas(event);
}
function consumePresentationEvents(state) {
  for (const event of presentationEvents(state, lastEventId)) {
    try { animateEvent(event); }
    catch { /* Unknown additive presentation data must not interrupt later events. */ }
    finally { lastEventId = Math.max(lastEventId, event.id); }
  }
}
function render(state) {
  if (!state?.players) return;
  matchState = state;
  const player = me();
  const enemy = rival();
  renderPhase(state.phase);
  setText($("#timer"), formatTime(state.elapsed));
  setText($("#own-core-board"), Math.ceil(player.coreHp));
  setText($("#enemy-core-value"), Math.ceil(enemy.coreHp));
  setText($("#enemy-core-board"), Math.ceil(enemy.coreHp));
  setStyle($("#enemy-core-bar"), "width", `${enemy.coreHp / 360 * 100}%`);
  setStyle($("#own-core-bar-board"), "width", `${player.coreHp / 360 * 100}%`);
  setStyle($("#enemy-core-bar-board"), "width", `${enemy.coreHp / 360 * 100}%`);
  setText($("#tap-value"), Math.floor(player.taps));
  setStyle($("#tap-bar"), "width", `${player.taps / 40 * 100}%`);
  setStyle($("#enemy-tap-bar"), "width", `${enemy.taps / 40 * 100}%`);
  setAttribute($("#enemy-tap-meter"), "aria-valuenow", Math.floor(enemy.taps));
  const regen = (state.phase.regen + player.forges * .2 + player.glassReactors * .28 + player.scoutCamps * .12 + (player.guilds || 0) * .1) * state.phase.tapMultiplier;
  setText($("#regen-value"), `+${regen.toFixed(2)}/s`);
  const enemyHasProject = ["attack", "crew", "magic"].some(category => siphonTarget(enemy, player, category));
  const reserveHint = player.taps >= 39.8 ? "RESERVE CAPPED - regeneration is being wasted." : enemyHasProject ? "Purple target: tap the rival project 3 times to siphon its progress." : player.taps < 3 ? "Low reserve. Your hand is narrowing." : "Place cards into category zones, then tap each queued card directly.";
  if ($("#reserve-hint").textContent !== reserveHint) $("#reserve-hint").textContent = reserveHint;
  renderWall("own", player);
  renderWall("enemy", enemy);
  renderStructures("own", player);
  renderStructures("enemy", enemy);
  renderProjectCues("own", player);
  renderProjectCues("enemy", enemy, player);
  const bot = enemy.bot;
  setText($("#enemy-label"), bot?.name || "LIVE RIVAL");
  setText($("#enemy-plan"), bot?.label || "ONLINE TACTICIAN");
  renderBattleHand();
  consumePresentationEvents(state);
}
function pulseTap(element, event) {
  const ripple = element.querySelector(".tap-ripple");
  if (!ripple) {
    element.classList.remove("tap-pulse");
    void element.offsetWidth;
    element.classList.add("tap-pulse");
    return;
  }
  const rect = element.getBoundingClientRect();
  ripple.style.left = `${(event?.clientX || rect.left + rect.width / 2) - rect.left}px`;
  ripple.style.top = `${(event?.clientY || rect.top + rect.height / 2) - rect.top}px`;
  ripple.classList.remove("go");
  void ripple.offsetWidth;
  ripple.classList.add("go");
}
function hideCardInspector() {
  if (inspectedElement) {
    inspectedElement.classList.remove("inspect-holding");
    inspectedElement.removeAttribute("aria-describedby");
  }
  inspectedElement = null;
  $("#card-inspector").classList.add("hidden");
}
function showCardInspector(source, key, anchor) {
  const definition = source === "weapon" ? DATA.weapons[key] : DATA.cards[key];
  if (!definition || !anchor) return;
  hideCardInspector();
  const category = source === "weapon" ? DATA.categories.attack : DATA.categories[definition.category];
  const stats = source === "weapon" ? DATA.weaponStats?.[key] : DATA.cardStats?.[key];
  const inspector = $("#card-inspector");
  inspectedElement = anchor;
  anchor.classList.add("inspect-holding");
  anchor.setAttribute("aria-describedby", "card-inspector");
  inspector.style.setProperty("--inspect-color", definition.color || category.color);
  const inspectorIcon = $("#inspector-icon");
  inspectorIcon.className = `pixel-sprite pixel-portrait-fallback pixel-${source === "weapon" ? "weapon" : "card"}-${key}`;
  inspectorIcon.innerHTML = `<b>${escapeMarkup(definition.short)}</b>`;
  $("#inspector-category").textContent = source === "weapon" ? "PERMANENT WEAPON" : category.name.toUpperCase();
  $("#inspector-name").textContent = definition.name.toUpperCase();
  $("#inspector-cost").textContent = `${definition.cost} TAPS`;
  $("#inspector-stats").innerHTML = (stats || []).map(stat => `<b>${stat}</b>`).join("");
  inspector.classList.remove("hidden");
  const anchorRect = anchor.getBoundingClientRect();
  const inspectorRect = inspector.getBoundingClientRect();
  const gap = 10;
  const left = clamp(anchorRect.left + anchorRect.width / 2 - inspectorRect.width / 2, 10, window.innerWidth - inspectorRect.width - 10);
  const above = anchorRect.top - inspectorRect.height - gap;
  const top = above >= 10 ? above : Math.min(window.innerHeight - inspectorRect.height - 10, anchorRect.bottom + gap);
  inspector.style.left = `${left}px`;
  inspector.style.top = `${Math.max(10, top)}px`;
}
function inspectCardContext(event, element, source, key) {
  if (!element || !key) return;
  event.preventDefault();
  event.stopPropagation();
  if (inspectedElement === element && !$("#card-inspector").classList.contains("hidden")) {
    hideCardInspector();
    return;
  }
  showCardInspector(source, key, element);
  tone(220, .035, "sine", .012);
}
function commitQueuedAction(event, element = event.currentTarget) {
  if (event.type === "pointerdown" && event.button !== 0) return;
  const player = me();
  const category = element.dataset.queuedAction;
  const key = element.dataset.actionKey;
  const progress = player?.cardProgress?.[key] || 0;
  if (!gameActive || !key || player.placed?.[category]?.key !== key || actionUnavailable(element) || player.taps < 1) { tone(70, .035, "square", .02); return; }
  event.preventDefault();
  pulseTap(element, event);
  tone(320 + progress * 18, .025, "sine", .018);
  socket.emit("action", { type: "tap", source: "card", key });
}
function activateCommit(event) {
  if (event.type === "click" && event.detail !== 0) return;
  commitQueuedAction(event);
}
function activateCommitKey(event) {
  if ((event.key === "i" || event.key === "F2") && event.currentTarget.dataset.actionKey) {
    inspectCardContext(event, event.currentTarget, "card", event.currentTarget.dataset.actionKey);
    return;
  }
  if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  commitQueuedAction(event);
}
function flyCard(source, destination, returning = false) {
  if (!source || !destination) return;
  const start = source.getBoundingClientRect();
  const end = destination.getBoundingClientRect();
  if (!start.width || !end.width) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    destination.classList.add("arrived-static");
    setTimeout(() => destination.classList.remove("arrived-static"), 300);
    return;
  }
  const clone = source.cloneNode(true);
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  clone.className = `card-flight ${returning ? "returning" : "deploying"}`;
  Object.assign(clone.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px` });
  document.body.appendChild(clone);
  const moveX = end.left + end.width / 2 - (start.left + start.width / 2);
  const moveY = end.top + end.height / 2 - (start.top + start.height / 2);
  const scale = Math.min(1.25, end.width / start.width);
  const animation = clone.animate([
    { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 },
    { transform: `translate(${moveX * .55}px,${moveY * .55 - 28}px) scale(1.08) rotate(${returning ? -3 : 3}deg)`, opacity: 1, offset: .58 },
    { transform: `translate(${moveX}px,${moveY}px) scale(${scale}) rotate(0deg)`, opacity: .15 }
  ], { duration: 220, easing: "steps(6,end)", fill: "forwards" });
  animation.finished.finally(() => clone.remove());
}
function placeHandCard(event, explicitButton = null) {
  if (event.type === "pointerdown" && event.button !== 0) return;
  const button = explicitButton || event.target.closest("[data-hand-slot]");
  if (!button || !$("#battle-hand").contains(button)) return;
  if (event.type === "click" && event.detail !== 0) return;
  event.preventDefault();
  const player = me();
  const slot = Number(button.dataset.handSlot);
  const key = player?.hand?.[slot];
  const card = DATA.cards[key];
  if (!gameActive || !card || actionUnavailable(button) || button.dataset.placing) { tone(70, .035, "square", .02); return; }
  button.focus({ preventScroll: true });
  const existing = player.placed?.[card.category];
  if (existing) flyCard($(`#own-action-${card.category}`), $(`[data-hand-placeholder="${existing.slot}"]`), true);
  flyCard(button, cueElement("own", card.category));
  button.dataset.placing = "true";
  setTimeout(() => delete button.dataset.placing, 500);
  tone(280, .045, "triangle", .028);
  socket.emit("action", { type: "place", key, slot });
}
function placeHandCardKey(event) {
  const button = event.target.closest("[data-hand-slot]");
  if ((event.key === "i" || event.key === "F2") && button) {
    inspectCardContext(event, button, "card", button.dataset.cardKey);
    return;
  }
  if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  placeHandCard(event);
}
function commitWeapon(event, element = event.currentTarget) {
  if (event.type === "pointerdown" && event.button !== 0) return;
  if (event.type === "click" && event.detail !== 0) return;
  event.preventDefault();
  const player = me();
  if (!gameActive || !player || actionUnavailable(element) || player.taps < 1) { tone(70, .035, "square", .02); return; }
  pulseTap(element, event);
  tone(360 + player.weaponProgress * 18, .025, "sine", .018);
  socket.emit("action", { type: "tap", source: "weapon", key: player.weapon });
}
function commitWeaponKey(event) {
  if (event.key === "i" || event.key === "F2") {
    inspectCardContext(event, event.currentTarget, "weapon", me()?.weapon);
    return;
  }
  if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  commitWeapon(event);
}
function siphonTap(event, element = event.currentTarget) {
  if (event.type === "pointerdown" && event.button !== 0) return;
  if (event.type === "click" && event.detail !== 0) return;
  if (!gameActive || !element.classList.contains("counterable") || me()?.taps < 1) { tone(70, .035, "square", .02); return; }
  event.preventDefault();
  element.classList.remove("siphon-tap");
  void element.offsetWidth;
  element.classList.add("siphon-tap");
  tone(470, .025, "triangle", .022);
  socket.emit("action", { type: "siphon", source: element.dataset.siphonSource, key: element.dataset.siphonKey });
}
function siphonTapKey(event) {
  const inspectKey = event.currentTarget.dataset.siphonKey || event.currentTarget.dataset.inspectKey || event.currentTarget.dataset.actionKey;
  const inspectSource = event.currentTarget.dataset.siphonSource || event.currentTarget.dataset.inspectSource || "card";
  if ((event.key === "i" || event.key === "F2") && inspectKey) {
    inspectCardContext(event, event.currentTarget, inspectSource, inspectKey);
    return;
  }
  if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  siphonTap(event);
}

function tacticalRead(player, enemy) {
  if (player.stats.capWaste > 12) return `Your reserve sat full for ${Math.round(player.stats.capWaste)} seconds. Rotate cheap cards sooner so regeneration keeps producing options.`;
  if (player.forges + player.glassReactors >= 3 && player.stats.damage < enemy.stats.damage * .7) return "You over-invested in engines while the rival converted their hand into pressure. Trim one economy card or attack sooner.";
  if (player.stats.cardsPlayed < 4) return "Your deck barely cycled. Cheaper cards or more decisive commitments would expose more of your six-card strategy.";
  if (player.stats.cannons + player.stats.volleys < 2) return "Your permanent weapon was underused. It exists outside the cycle so a difficult hand never removes your basic pressure option.";
  return "Review which cards were stranded in hand. A strong deck needs useful plays at several reserve levels, not only powerful expensive effects.";
}
function clearResultParticles() {
  clearTimeout(resultParticleTimer);
  resultParticleTimer = null;
  $("#result-particles").replaceChildren();
}
function showResultParticles(outcome) {
  clearResultParticles();
  if (outcome === "interrupted" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const particles = $("#result-particles");
  const count = outcome === "victory" ? 6 : 4;
  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("i");
    particle.style.setProperty("--particle-left", `${8 + index * 15}%`);
    particle.style.setProperty("--particle-x", `${(index % 2 ? 1 : -1) * 28}px`);
    particle.style.setProperty("--particle-delay", `${index * 35}ms`);
    particles.appendChild(particle);
  }
  resultParticleTimer = setTimeout(clearResultParticles, 1000);
}
function renderResult(payload, { interruption = false } = {}) {
  const presentation = resultPresentation(payload, ownSide, interruption);
  const state = payload?.state || matchState;
  const player = state?.players?.[ownSide];
  const enemy = state?.players?.[other(ownSide)];
  const card = $("#result-card");
  card.dataset.outcome = presentation.outcome;
  card.dataset.reason = interruption ? "connection" : payload.reason;
  const emblem = $("#result-emblem");
  emblem.className = `result-emblem pixel-sprite pixel-${presentation.emblem}`;
  $("#result-reason").textContent = presentation.reason;
  $("#result-reason-icon").classList.toggle("hidden", !presentation.warning);
  $("#result-title").textContent = presentation.title;
  $("#result-copy").textContent = presentation.copy;
  $("#result-own-core").textContent = Math.ceil(player?.coreHp || 0);
  $("#result-enemy-core").textContent = Math.ceil(enemy?.coreHp || 0);
  $("#result-taps").textContent = player?.stats?.tapsSpent || 0;
  $("#result-damage").textContent = Math.round(player?.stats?.damage || 0);
  $("#result-waste").textContent = `${Math.round(player?.stats?.capWaste || 0)}s`;
  $("#result-read").textContent = interruption ? "No result was recorded. Return to the siege ledger or reconnect and begin a fresh battle." : tacticalRead(player, enemy);
  $("#again-button span").textContent = interruption ? "TRY AGAIN" : "RUN IT BACK";
  $("#again-copy").textContent = interruption ? "Reconnect, then begin a fresh battle" : mode === "cpu" ? "New CPU deck, same fair rules" : "Search the war table for a new rival";
  $("#again-button").disabled = interruption && !socket.connected;
  $("#again-button").dataset.state = "ready";
  rematchPending = false;
  showResultParticles(presentation.outcome);
  openLifecycleDialog($("#result-modal"), $("#result-title"), null);
  announceLifecycle(`${presentation.title}. ${presentation.reason}.`);
  tone(presentation.tone, .35, presentation.outcome === "victory" ? "sine" : "triangle", .06);
}
function endGame({ winner, reason, state }) {
  if (!gameActive || !state || (matchState?.id && state.id && state.id !== matchState.id)) return;
  matchState = state;
  gameActive = false;
  const player = me();
  const enemy = rival();
  const won = winner === ownSide;
  const draw = winner === 0;
  profile.duels++;
  if (won) { profile.wins++; profile.run++; profile.bestRun = Math.max(profile.bestRun, profile.run); }
  else if (!draw) profile.run = 0;
  profile.recent.unshift(won ? "W" : draw ? "D" : "L");
  profile.recent = profile.recent.slice(0, 8);
  const challenge = CHALLENGES[profile.challenge % CHALLENGES.length];
  if (mode === "cpu" && challenge.test(player, won)) profile.challengeComplete = true;
  saveProfile();
  hideCardInspector();
  hideToast();
  renderResult({ winner, reason, state });
}
function showConnectionInterruption() {
  if (!gameActive) return;
  gameActive = false;
  connectionInterrupted = true;
  searching = false;
  renderQueueState();
  hideCardInspector();
  hideToast();
  renderResult({ winner: null, reason: "connection", state: matchState }, { interruption: true });
}
function hideToast() {
  toastSequence += 1;
  clearTimeout(toastTimer);
  toastTimer = null;
  const element = $("#toast");
  element.setAttribute("aria-live", "off");
  setText($("#toast-message"), "");
  element.classList.add("hidden");
}
function toast(message, toneName = "notice", announce = true) {
  const element = $("#toast");
  const sequence = ++toastSequence;
  const icon = $("#toast-icon");
  const iconName = toneName === "warning" ? "status-warning" : toneName === "search" ? "status-search" : toneName === "positive" ? "result-victory" : "crest";
  element.dataset.tone = toneName;
  element.setAttribute("aria-live", announce ? "polite" : "off");
  icon.className = `pixel-sprite pixel-${iconName}`;
  $("#toast-message").textContent = "";
  element.classList.add("hidden");
  clearTimeout(toastTimer);
  requestAnimationFrame(() => {
    if (sequence !== toastSequence) return;
    $("#toast-message").textContent = message;
    element.classList.remove("hidden");
  });
  toastTimer = setTimeout(hideToast, 2400);
}
function tone(frequency, duration, type = "sine", volume = .04) {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch { /* Audio is optional. */ }
}

function advanceCompletedChallenge() {
  if (!profile.challengeComplete) return;
  profile.challenge = (profile.challenge + 1) % CHALLENGES.length;
  profile.challengeComplete = false;
  saveProfile();
}
function requestLeaveBattle() {
  if (!gameActive) return;
  $("#confirm-leave").disabled = false;
  openLifecycleDialog($("#leave-modal"), $("#cancel-leave"), $("#leave-battle"));
  announceLifecycle("Leave battle confirmation. Staying in battle is the safe action.");
}
function cancelLeaveBattle() {
  closeLifecycleDialog($("#leave-modal"));
  announceLifecycle("Leave canceled. Battle continues.");
}
function confirmLeaveBattle() {
  if (!gameActive || $("#confirm-leave").disabled) return;
  $("#confirm-leave").disabled = true;
  closeLifecycleDialog($("#leave-modal"), { restoreFocus: false });
  socket.emit("leaveMatch");
  showLobby();
  announceLifecycle("Battle forfeited. Returned to the siege ledger.");
  requestAnimationFrame(() => $("#solo-button").focus({ preventScroll: true }));
}
function returnToLobbyFromResult() {
  if (rematchPending) return;
  advanceCompletedChallenge();
  closeLifecycleDialog($("#result-modal"), { restoreFocus: false });
  showLobby();
  announceLifecycle("Returned to the siege ledger.");
  requestAnimationFrame(() => $("#online-button").focus({ preventScroll: true }));
}
function rematchFromResult() {
  if (rematchPending || !socket.connected) return;
  advanceCompletedChallenge();
  if (mode === "cpu") {
    rematchPending = true;
    const button = $("#again-button");
    button.disabled = true;
    button.dataset.state = "pending";
    button.querySelector("span").textContent = "MUSTERING...";
    announceLifecycle("Preparing a fresh CPU battle.");
    if (!startCpu()) {
      rematchPending = false;
      button.disabled = false;
      button.dataset.state = "ready";
      button.querySelector("span").textContent = "TRY AGAIN";
    }
    return;
  }
  closeLifecycleDialog($("#result-modal"), { restoreFocus: false });
  showLobby();
  searching = false;
  toggleOnlineQueue();
  requestAnimationFrame(() => $("#online-button").focus({ preventScroll: true }));
}
function handleDialogKeydown(event) {
  if (!activeDialog) return false;
  if (event.key === "Escape") {
    event.preventDefault();
    if (activeDialog === $("#leave-modal")) cancelLeaveBattle();
    else if (activeDialog === $("#deck-info-modal")) closeDeckInfo();
    else if (activeDialog === $("#deck-replace-modal")) closeReplacementSheet();
    else if (!rematchPending) returnToLobbyFromResult();
    return true;
  }
  if (event.key !== "Tab") return false;
  const controls = dialogControls(activeDialog);
  if (!controls.length) { event.preventDefault(); return true; }
  const currentIndex = controls.indexOf(document.activeElement);
  if (currentIndex === -1) {
    event.preventDefault();
    controls[event.shiftKey ? controls.length - 1 : 0].focus();
  } else if (!event.shiftKey && currentIndex === controls.length - 1) {
    event.preventDefault();
    controls[0].focus();
  } else if (event.shiftKey && currentIndex === 0) {
    event.preventDefault();
    controls.at(-1).focus();
  }
  return true;
}

$("#solo-button").addEventListener("click", startCpu);
$("#challenge-play").addEventListener("click", startCpu);
$("#online-button").addEventListener("click", toggleOnlineQueue);
$("#battle-tab").addEventListener("click", showLobby);
$("#open-deck").addEventListener("click", openDeckBuilder);
$("#edit-deck").addEventListener("click", openDeckBuilder);
$("#undo-deck-edit").addEventListener("click", undoDeckEdit);
$("#dismiss-deck-hint").addEventListener("click", dismissDeckHint);
$("#deck-tabs").addEventListener("click", event => {
  const tab = event.target.closest("[data-deck-tab]");
  if (tab) switchBuilderDeck(Number(tab.dataset.deckTab));
});
$("#deck-tabs").addEventListener("keydown", event => {
  const tab = event.target.closest("[data-deck-tab]");
  if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const current = Number(tab.dataset.deckTab);
  const next = event.key === "Home" ? 0 : event.key === "End" ? MAX_SAVED_DECKS - 1 : (current + (event.key === "ArrowLeft" ? -1 : 1) + MAX_SAVED_DECKS) % MAX_SAVED_DECKS;
  switchBuilderDeck(next);
});
$("#weapon-options").addEventListener("click", event => {
  const action = event.target.closest("[data-weapon-action]");
  const root = event.target.closest("[data-weapon-root]");
  if (!action || !root || !event.currentTarget.contains(root)) return;
  const key = root.dataset.weaponRoot;
  if (action.dataset.weaponAction === "info") openDeckInfo("weapon", key, action);
  else if (action.dataset.weaponAction === "select") changeBuilderWeapon(key);
});
$("#weapon-options").addEventListener("keydown", event => {
  const button = event.target.closest("[data-weapon]");
  if (!button || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const choices = $$("#weapon-options [data-weapon]");
  const current = choices.indexOf(button);
  const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (current + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + choices.length) % choices.length;
  const nextChoice = choices[next];
  changeBuilderWeapon(nextChoice.dataset.weapon);
  nextChoice.focus({ preventScroll: true });
});
$("#deck-filters").addEventListener("click", event => {
  const button = event.target.closest("[data-deck-filter]");
  if (!button || (button.dataset.deckFilter !== "all" && !ownsDefinition(DATA.categories, button.dataset.deckFilter))) return;
  builderFilter = button.dataset.deckFilter;
  updateLibraryState({ animate: true });
  announceDeck(`${button.textContent.toLowerCase()} cards shown.`);
});
$("#deck-search").addEventListener("input", event => {
  builderSearch = event.currentTarget.value;
  updateLibraryState({ animate: true });
  announceDeck(builderSearch ? `${$("#library-count").textContent.toLowerCase()} shown for search ${builderSearch}.` : "Armory search cleared.");
});
$("#deck-sort").addEventListener("change", event => {
  builderSort = event.currentTarget.value;
  updateLibraryState({ animate: true });
  announceDeck(`Armory sorted by ${event.currentTarget.selectedOptions[0].textContent.toLowerCase()}.`);
});
$("#clear-deck-search").addEventListener("click", () => {
  builderSearch = "";
  updateLibraryState({ animate: true });
  $("#deck-search").focus({ preventScroll: true });
  announceDeck("Armory search cleared.");
});
$("#reset-deck-filters").addEventListener("click", resetDeckBrowse);
$("#clear-empty-armory").addEventListener("click", () => {
  resetDeckBrowse();
  $("#deck-search").focus({ preventScroll: true });
});
$("#card-library").addEventListener("click", event => {
  const action = event.target.closest("[data-card-action]");
  const entry = event.target.closest("[data-library-card]");
  if (!action || !entry || !event.currentTarget.contains(entry)) return;
  const key = entry.dataset.libraryCard;
  if (action.dataset.cardAction === "toggle") toggleArmoryCard(key);
  else if (action.dataset.cardAction === "info") openDeckInfo("card", key, action);
  else if (action.dataset.cardAction === "choose") chooseArmoryCard(key, entry);
  else if (action.dataset.cardAction === "locate") identifyDeckMember(key);
});
$("#builder-deck").addEventListener("click", event => {
  if (suppressDeckClick) return;
  const button = event.target.closest("[data-slot-action]");
  if (!button || !event.currentTarget.contains(button)) return;
  const slot = button.closest("[data-deck-slot]");
  const index = Number(slot?.dataset.deckSlot);
  const key = builderDeck[index];
  const action = button.dataset.slotAction;
  if (action === "select") selectDeckSlot(index);
  else if (action === "empty") selectEmptyDeckSlot(index);
  else if (action === "info" && key) openDeckInfo("card", key, button);
  else if (action === "remove" && index === activeDeckSlot) removeSelectedDeckCard();
});
$("#builder-deck").addEventListener("keydown", handleDeckReorderKey);
$("#builder-deck").addEventListener("keyup", event => { if (event.key === " " || event.key === "Spacebar") setTimeout(() => { suppressDeckClick = false; }, 0); });
$("#builder-deck").addEventListener("pointerdown", handleDeckPointerDown);
$("#builder-deck").addEventListener("pointermove", handleDeckPointerMove);
$("#builder-deck").addEventListener("touchmove", event => {
  if (deckPointerDrag?.active && deckPointerDrag.pointerType === "touch") event.preventDefault();
}, { passive: false });
$("#builder-deck").addEventListener("pointerup", event => finishGlobalDeckPointer(event));
$("#builder-deck").addEventListener("pointercancel", event => finishGlobalDeckPointer(event, true));
document.addEventListener("pointerup", event => finishGlobalDeckPointer(event));
document.addEventListener("pointercancel", event => finishGlobalDeckPointer(event, true));
$("#close-deck-info").addEventListener("click", closeDeckInfo);
$("#deck-info-modal").addEventListener("pointerdown", event => { if (event.target === event.currentTarget) closeDeckInfo(); });
$("#cancel-replacement-sheet").addEventListener("click", () => closeReplacementSheet());
$("#deck-replace-modal").addEventListener("pointerdown", event => { if (event.target === event.currentTarget) closeReplacementSheet(); });
$("#deck-replacement-options").addEventListener("click", event => {
  const button = event.target.closest("[data-replace-slot]");
  if (!button || !replacementCandidate) return;
  placeArmoryCard(Number(button.dataset.replaceSlot), replacementCandidate, button);
});
$("#deck-screen").addEventListener("scroll", event => {
  const screen = event.currentTarget;
  screen.classList.toggle("is-scrolled", screen.scrollTop > 8);
  const toolbar = $("#armory-toolbar");
  screen.classList.toggle("is-browsing-armory", toolbar.getBoundingClientRect().top <= screen.getBoundingClientRect().top + 112);
}, { passive: true });
$("#battle-hand").addEventListener("pointerdown", placeHandCard);
$("#battle-hand").addEventListener("contextmenu", event => {
  const button = event.target.closest("[data-hand-slot]");
  if (!button || !event.currentTarget.contains(button)) return;
  inspectCardContext(event, button, "card", button.dataset.cardKey);
});
$("#battle-hand").addEventListener("click", placeHandCard);
$("#battle-hand").addEventListener("keydown", placeHandCardKey);
$("#weapon-card").addEventListener("pointerdown", commitWeapon);
$("#weapon-card").addEventListener("contextmenu", event => {
  inspectCardContext(event, event.currentTarget, "weapon", me()?.weapon);
});
$("#weapon-card").addEventListener("click", commitWeapon);
$("#weapon-card").addEventListener("keydown", commitWeaponKey);
for (const category of ["attack", "crew", "magic"]) {
  const action = $(`#own-action-${category}`);
  action.addEventListener("pointerdown", activateCommit);
  action.addEventListener("contextmenu", event => {
    inspectCardContext(event, action, "card", action.dataset.actionKey);
  });
  action.addEventListener("click", activateCommit);
  action.addEventListener("keydown", activateCommitKey);
}
for (const zone of ["weapon", "crew", "magic"]) {
  const element = $("#enemy-" + zone);
  element.addEventListener("pointerdown", siphonTap);
  element.addEventListener("click", siphonTap);
  element.addEventListener("keydown", siphonTapKey);
}
for (const category of ["attack", "crew", "magic"]) {
  const action = $(`#enemy-action-${category}`);
  action.addEventListener("pointerdown", siphonTap);
  action.addEventListener("click", siphonTap);
  action.addEventListener("keydown", siphonTapKey);
  action.addEventListener("contextmenu", event => {
    inspectCardContext(event, action, "card", action.dataset.actionKey);
  });
}
document.addEventListener("pointerdown", event => { if (event.button === 0) hideCardInspector(); }, true);
document.addEventListener("click", event => {
  if ((activeDeckSlot < 0 && !expandedArmoryKey) || $("#deck-screen").classList.contains("hidden")) return;
  if (event.target.closest("#builder-deck [data-deck-slot], #card-library [data-library-card], .deck-overlay")) return;
  cancelDeckSelection();
});
document.addEventListener("keydown", event => {
  if (handleDialogKeydown(event) || event.key !== "Escape") return;
  if (deckKeyboardDrag) {
    event.preventDefault();
    cancelKeyboardDeckDrag();
  } else if (cancelPointerDeckDrag()) event.preventDefault();
  else {
    const selectionFocusWillHide = Boolean(document.activeElement?.closest?.(".card-action-popover"));
    if (cancelDeckSelection(true, selectionFocusWillHide)) {
      event.preventDefault();
    }
    else hideCardInspector();
  }
});
$("#leave-battle").addEventListener("click", requestLeaveBattle);
$("#cancel-leave").addEventListener("click", cancelLeaveBattle);
$("#confirm-leave").addEventListener("click", confirmLeaveBattle);
$("#leave-modal").addEventListener("pointerdown", event => { if (event.target === event.currentTarget) cancelLeaveBattle(); });
$("#lobby-button").addEventListener("click", returnToLobbyFromResult);
$("#again-button").addEventListener("click", rematchFromResult);
$("#sound-toggle").addEventListener("click", event => {
  soundEnabled = !soundEnabled;
  event.currentTarget.setAttribute("aria-pressed", String(soundEnabled));
  event.currentTarget.querySelector("b").textContent = soundEnabled ? "SOUND ON" : "SOUND OFF";
  const icon = event.currentTarget.querySelector(".pixel-sprite");
  icon.classList.toggle("pixel-sound-on", soundEnabled);
  icon.classList.toggle("pixel-sound-off", !soundEnabled);
  if (soundEnabled) tone(420, .08);
  announceLifecycle(`Sound ${soundEnabled ? "on" : "off"}.`);
});

socket.on("queueStatus", ({ searching: value }) => {
  const changed = searching !== Boolean(value);
  searching = Boolean(value);
  renderQueueState();
  if (changed) announceLifecycle(searching ? "Matchmaking active." : "Matchmaking canceled.");
});
socket.on("matchFound", ({ side, state }) => {
  const preservedDraft = deckIsDirty();
  ownSide = side;
  mode = state.mode;
  searching = false;
  renderQueueState();
  showGame();
  render(state);
  announceLifecycle(`${state.mode === "cpu" ? "CPU battle" : "Online battle"} started.`);
  if (preservedDraft) toast("MATCH FOUND - DECK EDIT KEPT; LAST COMPLETE LOADOUT USED", "positive");
});
socket.on("state", state => { if (gameActive) render(state); });
socket.on("gameOver", payload => endGame(payload));
socket.on("disconnect", () => {
  const wasSearching = searching;
  searching = false;
  renderQueueState();
  if (gameActive) showConnectionInterruption();
  else if (!$("#result-modal").classList.contains("hidden")) {
    $("#again-button").disabled = true;
    announceLifecycle("Connection lost. Reconnect before beginning another battle.");
  } else {
    toast(wasSearching ? "CONNECTION LOST - MATCHMAKING CANCELED" : "CONNECTION LOST", "warning");
    announceLifecycle(wasSearching ? "Connection lost. Matchmaking canceled." : "Connection lost.");
  }
});
socket.on("connect", () => {
  const restored = hasConnected;
  hasConnected = true;
  renderQueueState();
  if (!restored) return;
  hideToast();
  const resultOpen = !$("#result-modal").classList.contains("hidden");
  if (resultOpen) {
    $("#again-button").disabled = rematchPending;
    if (connectionInterrupted) $("#again-copy").textContent = "Connection restored - begin a fresh battle";
  }
  announceLifecycle(connectionInterrupted && resultOpen ? "Connection restored. This battle cannot resume; begin a fresh one." : "Connection restored.");
});

renderProfile();
renderQueueState();
