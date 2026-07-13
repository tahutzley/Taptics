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
let builderDeck = [];
let builderWeapon = "cannon";
let builderFilter = "all";
let builderDetailKey = null;
let deckDraftActive = false;
let deckCatalogueReady = false;
let deckScrollTop = 0;
let deckSaving = false;
let deckStorageError = false;
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

function defaultProfile() {
  return { version: 5, duels: 0, wins: 0, run: 0, bestRun: 0, challenge: 0, challengeComplete: false, recent: [], deck: [...DATA.defaultDeck], weapon: "cannon", deckDraft: null };
}
function ownsDefinition(registry, key) { return typeof key === "string" && Object.hasOwn(registry, key); }
function isValidDeck(deck) {
  return Array.isArray(deck) && deck.length === DATA.deckSize && new Set(deck).size === DATA.deckSize && deck.every(key => ownsDefinition(DATA.cards, key));
}
function isValidDeckDraft(draft) {
  return Boolean(draft) && Array.isArray(draft.deck) && draft.deck.length <= DATA.deckSize && new Set(draft.deck).size === draft.deck.length && draft.deck.every(key => ownsDefinition(DATA.cards, key)) && ownsDefinition(DATA.weapons, draft.weapon);
}
function sameOrderedDeck(left, right) { return left.length === right.length && left.every((key, index) => key === right[index]); }
function loadProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY));
    const base = defaultProfile();
    const saved = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    const deck = isValidDeck(saved.deck) ? saved.deck : base.deck;
    const weapon = ownsDefinition(DATA.weapons, saved.weapon) ? saved.weapon : "cannon";
    const draft = isValidDeckDraft(saved.deckDraft) && (!sameOrderedDeck(saved.deckDraft.deck, deck) || saved.deckDraft.weapon !== weapon) ? { deck: [...saved.deckDraft.deck], weapon: saved.deckDraft.weapon } : null;
    const normalized = { ...base, ...saved, version: 5, deck: [...deck], weapon, deckDraft: draft };
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
function loadout() { return { deck: [...profile.deck], weapon: profile.weapon }; }
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
  activeDialog = null;
  dialogReturnFocus = null;
  setBackgroundInert(false);
  clearResultParticles();
}

const CARD_FRAME_VARIANTS = new Set(["lobby", "battle", "queued", "deck", "detail"]);
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
  $("#loadout-deck").innerHTML = profile.deck.map(key => cardFrame(key, { variant: "lobby" })).join("");
  const weapon = DATA.weapons[profile.weapon];
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
  return deckDraftActive && (builderWeapon !== profile.weapon || !sameOrderedDeck(builderDeck, profile.deck));
}
function persistDeckDraft() {
  const deckDraft = deckIsDirty() ? { deck: [...builderDeck], weapon: builderWeapon } : null;
  const candidate = { ...profile, deckDraft };
  if (!saveProfile(candidate)) {
    const firstFailure = !deckStorageError;
    deckStorageError = true;
    if (firstFailure) toast("BROWSER STORAGE UNAVAILABLE - DRAFT KEPT IN MEMORY");
    return false;
  }
  profile = candidate;
  deckStorageError = false;
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
  $(".lobby-scroll").scrollTop = 0;
  setMenuTab("battle");
  window.scrollTo({ top: 0, behavior: "auto" });
  renderProfile();
  if (leavingDeck && deckIsDirty()) toast("DECK DRAFT KEPT - BATTLES USE SAVED LOADOUT");
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
  document.body.classList.remove("menu-active");
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

function openDeckBuilder() {
  const continuingDraft = deckDraftActive;
  const canceledSearch = searching;
  if (canceledSearch) {
    socket.emit("cancelSearch");
    searching = false;
    renderQueueState();
  }
  if (!deckDraftActive) {
    const savedDraft = isValidDeckDraft(profile.deckDraft) ? profile.deckDraft : null;
    builderDeck = [...(savedDraft?.deck || profile.deck)];
    builderWeapon = savedDraft?.weapon || profile.weapon;
    builderDetailKey = builderDeck[0] || Object.keys(DATA.cards)[0];
    deckDraftActive = true;
  }
  ensureDeckCatalogue();
  renderDeckBuilder();
  $("#lobby").classList.add("hidden");
  $("#deck-screen").classList.remove("hidden");
  $("#main-menu-tabs").classList.remove("hidden");
  document.body.classList.add("menu-active");
  $("#deck-screen").scrollTop = continuingDraft ? deckScrollTop : 0;
  setMenuTab("deck");
  $("#deck-builder-title").focus({ preventScroll: true });
  if (canceledSearch) {
    announceDeck("Matchmaking canceled so you can edit the saved loadout safely.");
  }
}
function ensureDeckCatalogue() {
  if (deckCatalogueReady) return;
  $("#weapon-options").innerHTML = Object.entries(DATA.weapons).map(([key, weapon]) => `<button class="weapon-option" type="button" data-weapon="${key}" aria-pressed="false" aria-label="Select ${escapeMarkup(weapon.name)} as permanent weapon">${cardFrame(key, { variant: "deck", source: "weapon" })}<small>${escapeMarkup(weapon.description)}</small></button>`).join("");
  $("#builder-deck").innerHTML = Array.from({ length: DATA.deckSize }, (_, index) => `<article class="deck-slot" data-deck-slot="${index}" role="listitem"></article>`).join("");
  $("#card-library").innerHTML = Object.entries(DATA.cards).map(([key, card]) => `<article class="library-card category-${card.category}" data-library-card="${key}" data-card-category="${card.category}" style="--card-color:${card.color};--category-color:${DATA.categories[card.category].color}"><button class="library-card__details" type="button" data-card-action="details" aria-label="View details for ${escapeMarkup(card.name)}">${cardFrame(key, { variant: "deck" })}</button><button class="library-card__toggle pixel-button" type="button" data-card-action="toggle" aria-pressed="false">ADD TO DECK</button></article>`).join("");
  deckCatalogueReady = true;
}
function focusDeckSlot(key, action = "details") {
  requestAnimationFrame(() => $(`#builder-deck [data-card-key="${key}"][data-slot-action="${action}"]`)?.focus({ preventScroll: true }));
}
function updateDeckSlots(focus = null) {
  $$("#builder-deck [data-deck-slot]").forEach((slot, index) => {
    const key = builderDeck[index];
    slot.dataset.cardKey = key || "";
    if (!key) {
      slot.className = "deck-slot empty";
      slot.innerHTML = `<span class="deck-slot-order">${index + 1}</span><div class="deck-slot-empty" aria-label="Empty deck slot ${index + 1}"><b>+</b><small>SLOT ${index + 1}</small></div>`;
      return;
    }
    const card = DATA.cards[key];
    slot.className = `deck-slot filled category-${card.category}`;
    slot.innerHTML = `<span class="deck-slot-order" aria-hidden="true">${index + 1}</span><button class="deck-slot-card" type="button" data-slot-action="details" data-card-key="${key}" aria-label="View ${escapeMarkup(card.name)} details, position ${index + 1}">${cardFrame(key, { variant: "deck", selected: true })}</button><div class="deck-slot-actions"><button type="button" data-slot-action="left" data-card-key="${key}" aria-label="Move ${escapeMarkup(card.name)} left from position ${index + 1}" ${index === 0 ? "disabled" : ""}>&larr;</button><button type="button" data-slot-action="remove" data-card-key="${key}" aria-label="Remove ${escapeMarkup(card.name)} from deck">&times;</button><button type="button" data-slot-action="right" data-card-key="${key}" aria-label="Move ${escapeMarkup(card.name)} right from position ${index + 1}" ${index === builderDeck.length - 1 ? "disabled" : ""}>&rarr;</button></div>`;
  });
  if (focus?.key) focusDeckSlot(focus.key, focus.action);
}
function updateWeaponOptions() {
  $$("#weapon-options [data-weapon]").forEach(button => {
    const selected = button.dataset.weapon === builderWeapon;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.querySelector(".card-frame")?.classList.toggle("is-selected", selected);
  });
}
function updateLibraryState() {
  const full = builderDeck.length === DATA.deckSize;
  let visible = 0;
  $$("#card-library [data-library-card]").forEach(entry => {
    const key = entry.dataset.libraryCard;
    const selected = builderDeck.includes(key);
    const shown = builderFilter === "all" || entry.dataset.cardCategory === builderFilter;
    entry.hidden = !shown;
    if (shown) visible++;
    entry.classList.toggle("selected", selected);
    entry.querySelector(".card-frame")?.classList.toggle("is-selected", selected);
    const details = entry.querySelector('[data-card-action="details"]');
    if (key === builderDetailKey) details.setAttribute("aria-current", "true");
    else details.removeAttribute("aria-current");
    const toggle = entry.querySelector('[data-card-action="toggle"]');
    toggle.disabled = full && !selected;
    toggle.setAttribute("aria-pressed", String(selected));
    toggle.textContent = selected ? "REMOVE" : full ? "DECK FULL" : "ADD TO DECK";
    toggle.setAttribute("aria-label", selected ? `Remove ${DATA.cards[key].name} from deck` : full ? `Deck full. View ${DATA.cards[key].name} details or remove another card first` : `Add ${DATA.cards[key].name} to deck`);
  });
  $("#library-count").textContent = builderFilter === "all" ? `${visible} CARDS` : `${visible} / ${Object.keys(DATA.cards).length}`;
  $$("#deck-filters [data-deck-filter]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.deckFilter === builderFilter)));
}
function renderDeckDetails(key = builderDetailKey, restoreToggleFocus = false) {
  if (!ownsDefinition(DATA.cards, key)) return;
  builderDetailKey = key;
  const card = DATA.cards[key];
  const category = DATA.categories[card.category];
  $("#deck-detail-frame").innerHTML = cardFrame(key, { variant: "detail", selected: builderDeck.includes(key) });
  $("#deck-detail-category").textContent = `${category.name.toUpperCase()} / ${card.type.toUpperCase()} / ${card.cost} TAPS`;
  $("#deck-detail-name").textContent = card.name.toUpperCase();
  $("#deck-detail-description").textContent = card.description;
  $("#deck-detail-stats").innerHTML = (DATA.cardStats[key] || []).map(stat => `<b>${escapeMarkup(stat)}</b>`).join("");
  const selected = builderDeck.includes(key);
  const toggle = $("#deck-detail-toggle");
  toggle.disabled = builderDeck.length === DATA.deckSize && !selected;
  toggle.dataset.cardKey = key;
  toggle.setAttribute("aria-pressed", String(selected));
  toggle.textContent = selected ? "REMOVE FROM DECK" : builderDeck.length === DATA.deckSize ? "DECK FULL" : "ADD TO DECK";
  toggle.setAttribute("aria-label", selected ? `Remove ${card.name} from deck` : builderDeck.length === DATA.deckSize ? `Deck full. Remove another card before adding ${card.name}` : `Add ${card.name} to deck`);
  updateLibraryState();
  if (restoreToggleFocus) requestAnimationFrame(() => toggle.focus({ preventScroll: true }));
}
function updateDeckStatus() {
  const valid = isValidDeck(builderDeck) && ownsDefinition(DATA.weapons, builderWeapon);
  const dirty = deckIsDirty();
  const state = deckStorageError ? "error" : deckSaving ? "saving" : !valid ? "invalid" : dirty ? "dirty" : "saved";
  const status = $("#deck-status");
  status.dataset.state = state;
  status.textContent = state === "error" ? `Browser storage is unavailable. This ${valid ? "loadout" : "draft"} is only in memory; battles still use the last saved loadout.` : state === "invalid" ? `${builderDeck.length} of ${DATA.deckSize} cards selected. Choose ${DATA.deckSize - builderDeck.length} more.` : state === "dirty" ? "Unsaved draft preserved. Save before battle to use this exact order." : state === "saving" ? "Sealing loadout..." : "Loadout saved and ready for battle.";
  $("#builder-count").textContent = `${builderDeck.length} / ${DATA.deckSize}${valid ? " - VALID" : ""}`;
  const save = $("#save-deck");
  save.disabled = !valid || !dirty || deckSaving;
  save.dataset.state = state;
  save.querySelector("span").textContent = state === "saving" ? "SAVING..." : state === "saved" ? "LOADOUT SAVED" : state === "error" && valid ? "RETRY SAVE" : "SAVE LOADOUT";
  $("#restore-deck").classList.toggle("hidden", !dirty || deckSaving);
}
function renderDeckBuilder(options = {}) {
  ensureDeckCatalogue();
  updateDeckSlots(options.focus);
  updateWeaponOptions();
  renderDeckDetails(builderDetailKey || builderDeck[0] || Object.keys(DATA.cards)[0], options.restoreDetailFocus);
  updateDeckStatus();
}
function restoreDeckScroll(scrollTop) {
  $("#deck-screen").scrollTop = scrollTop;
  requestAnimationFrame(() => { $("#deck-screen").scrollTop = scrollTop; });
}
function toggleDeckCard(key, options = {}) {
  if (!ownsDefinition(DATA.cards, key)) return false;
  const scrollTop = $("#deck-screen").scrollTop;
  const index = builderDeck.indexOf(key);
  if (index >= 0) {
    builderDeck.splice(index, 1);
    announceDeck(`${DATA.cards[key].name} removed. ${builderDeck.length} of ${DATA.deckSize} cards selected.`);
  } else if (builderDeck.length < DATA.deckSize) {
    builderDeck.push(key);
    announceDeck(`${DATA.cards[key].name} added in position ${builderDeck.length}.`);
  } else {
    builderDetailKey = key;
    renderDeckDetails(key, options.restoreDetailFocus);
    announceDeck(`Deck full. Details for ${DATA.cards[key].name} remain available.`);
    return false;
  }
  builderDetailKey = key;
  persistDeckDraft();
  renderDeckBuilder({ focus: options.focus, restoreDetailFocus: options.restoreDetailFocus });
  restoreDeckScroll(scrollTop);
  return true;
}
function saveDeckBuilder() {
  if (!isValidDeck(builderDeck) || !ownsDefinition(DATA.weapons, builderWeapon)) return;
  const candidate = { ...profile, deck: [...builderDeck], weapon: builderWeapon, deckDraft: null };
  deckSaving = true;
  deckStorageError = false;
  updateDeckStatus();
  if (!saveProfile(candidate)) {
    deckSaving = false;
    deckStorageError = true;
    updateDeckStatus();
    announceDeck("Loadout was not saved because browser storage is unavailable. Battles still use the previous saved loadout.");
    toast("LOADOUT NOT SAVED - STORAGE UNAVAILABLE");
    return;
  }
  profile = candidate;
  renderProfile();
  updateDeckStatus();
  setTimeout(() => {
    deckSaving = false;
    renderDeckBuilder();
    announceDeck("Loadout saved. Battles will use this exact order and weapon.");
    toast("LOADOUT SAVED");
  }, 120);
}

function restoreSavedDeck() {
  const candidate = { ...profile, deckDraft: null };
  if (!saveProfile(candidate)) {
    deckStorageError = true;
    updateDeckStatus();
    announceDeck("Saved loadout could not be restored because browser storage is unavailable. The current in-memory draft remains open.");
    toast("DRAFT NOT DISCARDED - STORAGE UNAVAILABLE");
    return;
  }
  profile = candidate;
  builderDeck = [...profile.deck];
  builderWeapon = profile.weapon;
  builderDetailKey = builderDeck[0];
  deckStorageError = false;
  renderDeckBuilder();
  announceDeck("Saved loadout restored. Unsaved draft discarded.");
  $("#deck-builder-title").focus({ preventScroll: true });
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
$("#save-deck").addEventListener("click", saveDeckBuilder);
$("#restore-deck").addEventListener("click", restoreSavedDeck);
$("#weapon-options").addEventListener("click", event => {
  const button = event.target.closest("[data-weapon]");
  if (!button || !ownsDefinition(DATA.weapons, button.dataset.weapon)) return;
  builderWeapon = button.dataset.weapon;
  persistDeckDraft();
  renderDeckBuilder();
  announceDeck(`${DATA.weapons[builderWeapon].name} selected as permanent weapon.`);
});
$("#deck-filters").addEventListener("click", event => {
  const button = event.target.closest("[data-deck-filter]");
  if (!button || (button.dataset.deckFilter !== "all" && !ownsDefinition(DATA.categories, button.dataset.deckFilter))) return;
  builderFilter = button.dataset.deckFilter;
  updateLibraryState();
  announceDeck(`${button.textContent.toLowerCase()} cards shown.`);
});
$("#card-library").addEventListener("click", event => {
  const action = event.target.closest("[data-card-action]");
  const entry = event.target.closest("[data-library-card]");
  if (!action || !entry || !event.currentTarget.contains(entry)) return;
  const key = entry.dataset.libraryCard;
  if (action.dataset.cardAction === "details") {
    renderDeckDetails(key);
    announceDeck(`Details for ${DATA.cards[key].name}.`);
  } else if (action.dataset.cardAction === "toggle") toggleDeckCard(key);
});
$("#builder-deck").addEventListener("click", event => {
  const button = event.target.closest("[data-slot-action]");
  if (!button || !event.currentTarget.contains(button)) return;
  const key = button.dataset.cardKey;
  const index = builderDeck.indexOf(key);
  if (index < 0) return;
  const action = button.dataset.slotAction;
  if (action === "details") {
    renderDeckDetails(key);
    announceDeck(`Details for ${DATA.cards[key].name}, position ${index + 1}.`);
    return;
  }
  if (action === "remove") {
    const scrollTop = $("#deck-screen").scrollTop;
    builderDeck.splice(index, 1);
    builderDetailKey = key;
    persistDeckDraft();
    renderDeckBuilder({ restoreDetailFocus: true });
    restoreDeckScroll(scrollTop);
    announceDeck(`${DATA.cards[key].name} removed. ${builderDeck.length} of ${DATA.deckSize} cards selected.`);
    return;
  }
  const targetIndex = action === "left" ? index - 1 : action === "right" ? index + 1 : -1;
  if (targetIndex < 0 || targetIndex >= builderDeck.length) return;
  const scrollTop = $("#deck-screen").scrollTop;
  [builderDeck[index], builderDeck[targetIndex]] = [builderDeck[targetIndex], builderDeck[index]];
  persistDeckDraft();
  renderDeckBuilder({ focus: { key, action } });
  restoreDeckScroll(scrollTop);
  announceDeck(`${DATA.cards[key].name} moved to position ${targetIndex + 1}.`);
});
$("#deck-detail-toggle").addEventListener("click", event => {
  const key = event.currentTarget.dataset.cardKey;
  if (key) toggleDeckCard(key, { restoreDetailFocus: true });
});
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
document.addEventListener("keydown", event => { if (!handleDialogKeydown(event) && event.key === "Escape") hideCardInspector(); });
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
  if (preservedDraft) toast("MATCH FOUND - DECK DRAFT KEPT", "positive");
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
