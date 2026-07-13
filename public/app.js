const socket = io();
const DATA = window.GAME_DATA;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const SAVE_KEY = "taptics-prototype-v3";
const PHASE_COPY = {
  fortify: { number: "01", kicker: "OPENING PHASE", name: "FORTIFY", rule: "Damage reduced 25%" },
  clash: { number: "02", kicker: "MIDDLE PHASE", name: "CLASH", rule: "Core shields are down" },
  overload: { number: "03", kicker: "ELIMINATION PHASE", name: "OVERLOAD", rule: "Damage rising - Walls weakening" }
};
const CHALLENGES = [
  { title: "Win with one economy engine", copy: "Finish a CPU duel after constructing no more than one Tap Forge or Glass Reactor.", test: (me, won) => won && me.forges + me.glassReactors <= 1 },
  { title: "Land three weapon hits", copy: "Use your permanent Cannon or Volley at least three times in one duel.", test: me => me.stats.cannons + me.stats.volleys >= 3 },
  { title: "Raise two defenses", copy: "Resolve Rampart or Bulwark twice while managing your rotating hand.", test: me => me.stats.wallsBuilt >= 2 },
  { title: "Waste less than five seconds", copy: "Keep the reserve productive instead of sitting at the 40-tap cap.", test: me => me.stats.capWaste < 5 }
];

let profile = loadProfile();
let builderDeck = [];
let builderWeapon = "cannon";
let selectedTarget = { source: "card", slot: 0 };
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

function defaultProfile() {
  return { version: 4, duels: 0, wins: 0, run: 0, bestRun: 0, challenge: 0, challengeComplete: false, recent: [], deck: [...DATA.defaultDeck], weapon: "cannon" };
}
function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    const base = defaultProfile();
    if (!saved) return base;
    const deck = Array.isArray(saved.deck) && saved.deck.length === DATA.deckSize && saved.deck.every(key => DATA.cards[key]) ? saved.deck : base.deck;
    return { ...base, ...saved, version: 4, deck: [...deck], weapon: DATA.weapons[saved.weapon] ? saved.weapon : "cannon" };
  } catch { return defaultProfile(); }
}
function saveProfile() { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function other(side) { return side === 1 ? 2 : 1; }
function me() { return matchState?.players?.[ownSide]; }
function rival() { return matchState?.players?.[other(ownSide)]; }
function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
function loadout() { return { deck: [...profile.deck], weapon: profile.weapon }; }

function renderProfile() {
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
  $("#loadout-deck").innerHTML = profile.deck.map(key => {
    const card = DATA.cards[key];
    return `<div class="loadout-card category-${card.category}" style="--card-color:${card.color};--category-color:${DATA.categories[card.category].color}"><b>${card.short}</b><small>${DATA.categories[card.category].short} · ${card.cost}T</small></div>`;
  }).join("");
  const weapon = DATA.weapons[profile.weapon];
  $("#loadout-weapon-name").textContent = weapon.name.toUpperCase();
  $("#loadout-weapon-copy").textContent = `${weapon.cost} taps - ${weapon.description}`;
}
function showLobby() {
  gameActive = false;
  matchState = null;
  $("#game").classList.add("hidden");
  $("#lobby").classList.remove("hidden");
  $("#result-modal").classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "auto" });
  renderProfile();
}
function showGame() {
  gameActive = true;
  lastEventId = 0;
  lastPhase = null;
  lastDoubleTaps = false;
  $("#lobby").classList.add("hidden");
  $("#game").classList.remove("hidden");
  $("#result-modal").classList.add("hidden");
  $("#mode-label").textContent = mode === "cpu" ? "TRAINING" : "ONLINE";
  window.scrollTo({ top: 0, behavior: "auto" });
}
function startCpu() { mode = "cpu"; socket.emit("startCpu", loadout()); }
function toggleOnlineQueue() {
  if (searching) {
    socket.emit("cancelSearch");
    searching = false;
    $("#online-button").classList.remove("searching");
    $("#online-button span").textContent = "FIND RIVAL";
    $("#queue-message").textContent = "Real-time online 1v1";
    return;
  }
  socket.emit("findMatch", loadout());
  searching = true;
  $("#online-button").classList.add("searching");
  $("#online-button span").textContent = "CANCEL SEARCH";
  $("#queue-message").textContent = "Scanning for another tactician...";
}

function openDeckBuilder() {
  builderDeck = [...profile.deck];
  builderWeapon = profile.weapon;
  renderDeckBuilder();
  $("#deck-modal").classList.remove("hidden");
}
function renderDeckBuilder() {
  $("#builder-count").textContent = `${builderDeck.length} / ${DATA.deckSize}`;
  $("#library-count").textContent = `${Object.keys(DATA.cards).length} CARDS`;
  $("#builder-deck").innerHTML = Array.from({ length: DATA.deckSize }, (_, index) => {
    const key = builderDeck[index];
    if (!key) return `<button class="builder-slot" data-builder-slot="${index}"><b>+</b><small>EMPTY</small></button>`;
    const card = DATA.cards[key];
    return `<button class="builder-slot filled category-${card.category}" data-builder-slot="${index}" style="--card-color:${card.color}"><b>${card.short}</b><small>${DATA.categories[card.category].short} · ${card.cost}T</small></button>`;
  }).join("");
  $("#card-library").innerHTML = Object.entries(DATA.categories).map(([categoryKey, category]) => {
    const cards = Object.entries(DATA.cards).filter(([, card]) => card.category === categoryKey);
    const header = `<div class="library-group-label" style="--category-color:${category.color}"><b>${category.name.toUpperCase()}</b><span>${category.description}</span><em>${cards.length}</em></div>`;
    const entries = cards.map(([key, card]) => {
      const selected = builderDeck.includes(key);
      return `<button class="library-card category-${card.category} ${selected ? "selected" : ""}" data-library-card="${key}" style="--card-color:${card.color};--category-color:${category.color}"><span class="library-top"><i class="library-icon">${card.short}</i><i class="library-cost">${card.cost}T</i></span><span class="library-category">${category.name.toUpperCase()} · ${card.type.toUpperCase()}</span><b>${card.name}</b><small>${card.description}</small>${selected ? '<i class="selected-mark">IN DECK</i>' : ""}</button>`;
    }).join("");
    return header + entries;
  }).join("");
  $$("[data-weapon]").forEach(button => button.classList.toggle("selected", button.dataset.weapon === builderWeapon));
  $("#save-deck").disabled = builderDeck.length !== DATA.deckSize;
  $$("[data-builder-slot]").forEach(button => button.addEventListener("click", () => {
    const index = Number(button.dataset.builderSlot);
    if (builderDeck[index]) builderDeck.splice(index, 1);
    renderDeckBuilder();
  }));
  $$("[data-library-card]").forEach(button => button.addEventListener("click", () => {
    const key = button.dataset.libraryCard;
    const index = builderDeck.indexOf(key);
    if (index >= 0) builderDeck.splice(index, 1);
    else if (builderDeck.length < DATA.deckSize) builderDeck.push(key);
    else { toast("REMOVE A CARD BEFORE ADDING ANOTHER"); return; }
    renderDeckBuilder();
  }));
}
function saveDeckBuilder() {
  if (builderDeck.length !== DATA.deckSize) return;
  profile.deck = [...builderDeck];
  profile.weapon = builderWeapon;
  saveProfile();
  $("#deck-modal").classList.add("hidden");
  renderProfile();
  toast("LOADOUT SAVED");
}

function definitionForTarget(player, target = selectedTarget) {
  if (!player) return null;
  if (target.source === "weapon") return DATA.weapons[player.weapon];
  const key = player.hand[target.slot];
  return DATA.cards[key];
}
function keyForTarget(player, target = selectedTarget) { return target.source === "weapon" ? player.weapon : player.hand[target.slot]; }
function targetPending(player, target = selectedTarget) {
  const key = keyForTarget(player, target);
  return player?.pending?.some(job => job.source === target.source && job.key === key);
}
function targetProgress(player, target = selectedTarget) {
  if (!player) return 0;
  return target.source === "weapon" ? player.weaponProgress : player.cardProgress[player.hand[target.slot]] || 0;
}
function laneOccupant(player, category) {
  if (!player || !category) return null;
  if (category === "attack" && (player.weaponProgress > 0 || player.pending.some(job => job.source === "weapon"))) return { source: "weapon", key: player.weapon };
  const partial = player.hand.find(key => DATA.cards[key].category === category && (player.cardProgress[key] || 0) > 0);
  if (partial) return { source: "card", key: partial };
  const pending = player.pending.find(job => job.source === "card" && DATA.cards[job.key]?.category === category);
  return pending ? { source: "card", key: pending.key } : null;
}
function laneBlocked(player, source, key) {
  const category = source === "weapon" ? "attack" : DATA.cards[key]?.category;
  const occupant = laneOccupant(player, category);
  return Boolean(occupant && (occupant.source !== source || occupant.key !== key));
}
function targetBlocked(player, target = selectedTarget) {
  if (!player || player.taps < 1 || !definitionForTarget(player, target) || targetPending(player, target)) return true;
  const key = keyForTarget(player, target);
  return laneBlocked(player, target.source, key);
}
function selectTarget(source, slot = 0) {
  selectedTarget = source === "weapon" ? { source: "weapon" } : { source: "card", slot };
  renderBattleHand();
  renderActionControls();
  tone(260, .018, "sine", .025);
}
function cardButton(key, slot, player) {
  const card = DATA.cards[key];
  const progress = player.cardProgress[key] || 0;
  const selected = selectedTarget.source === "card" && selectedTarget.slot === slot;
  const pending = player.pending.some(job => job.source === "card" && job.key === key);
  const category = DATA.categories[card.category];
  return `<button class="action-card battle-card category-${card.category} ${selected ? "selected" : ""} ${pending ? "pending" : ""}" data-hand-slot="${slot}" data-busy-label="${category.name.toUpperCase()} IS BUSY" style="--card-color:${card.color};--category-color:${category.color}"><span class="action-key" style="border-color:${card.color}">${card.short}</span><b class="action-name">${card.name}</b><em>${card.cost}<small>T</small></em><i class="action-progress" style="width:${progress / card.cost * 100}%;background:${category.color}"></i></button>`;
}
function renderBattleHand() {
  const player = me();
  if (!player) return;
  if (selectedTarget.source === "card" && !player.hand[selectedTarget.slot]) selectedTarget = { source: "card", slot: 0 };
  const hand = $("#battle-hand");
  const handSignature = player.hand.join("|");
  if (hand.dataset.signature !== handSignature) {
    hand.innerHTML = player.hand.map((key, slot) => cardButton(key, slot, player)).join("");
    hand.dataset.signature = handSignature;
  }
  $$('[data-hand-slot]').forEach(button => {
    const slot = Number(button.dataset.handSlot);
    const key = player.hand[slot];
    const card = DATA.cards[key];
    const selected = selectedTarget.source === "card" && selectedTarget.slot === slot;
    const blocked = laneBlocked(player, "card", key);
    button.classList.toggle("selected", selected);
    button.classList.toggle("pending", player.pending.some(job => job.source === "card" && job.key === key));
    button.classList.toggle("disabled", blocked);
    button.disabled = blocked;
    button.setAttribute("aria-disabled", String(blocked));
    button.dataset.busyLabel = `${DATA.categories[card.category].name.toUpperCase()} IS BUSY`;
    button.querySelector(".action-key").style.background = selected ? card.color : "";
    button.querySelector(".action-progress").style.width = `${(player.cardProgress[key] || 0) / card.cost * 100}%`;
  });
  const next = DATA.cards[player.nextCard];
  $("#next-card-label").textContent = next ? `NEXT: ${next.name.toUpperCase()}` : "NEXT: --";
  const weapon = DATA.weapons[player.weapon];
  $("#weapon-short").textContent = weapon.short;
  $("#weapon-name").textContent = weapon.name.toUpperCase();
  $("#weapon-cost").textContent = weapon.cost;
  const weaponButton = $("#weapon-card");
  weaponButton.style.setProperty("--card-color", weapon.color);
  weaponButton.classList.toggle("selected", selectedTarget.source === "weapon");
  weaponButton.classList.toggle("pending", player.pending.some(job => job.source === "weapon"));
  const weaponBlocked = laneBlocked(player, "weapon", player.weapon);
  weaponButton.classList.toggle("disabled", weaponBlocked);
  weaponButton.disabled = weaponBlocked;
  weaponButton.querySelector(".action-progress").style.width = `${player.weaponProgress / weapon.cost * 100}%`;
}
function renderActionControls() {
  const player = me();
  const definition = definitionForTarget(player);
  if (!definition) return;
  const progress = targetProgress(player);
  const categoryKey = selectedTarget.source === "weapon" ? "attack" : definition.category;
  const category = DATA.categories[categoryKey];
  const button = $("#commit-button");
  const blocked = targetBlocked(player);
  button.className = `lane-commit target-${categoryKey} category-${categoryKey}${blocked ? " locked" : ""}`;
  button.style.setProperty("--action-color", definition.color);
  button.style.setProperty("--action-progress", progress / definition.cost);
  button.disabled = blocked;
  button.setAttribute("aria-label", `${blocked ? "Cannot use" : "Tap to use"} ${definition.name}. ${progress} of ${definition.cost} taps committed.`);
  $("#commit-icon").textContent = definition.short;
  const laneBusy = laneBlocked(player, selectedTarget.source, keyForTarget(player));
  $("#commit-lane").textContent = targetPending(player) ? "WINDING UP" : laneBusy ? `${category.name.toUpperCase()} BUSY` : player.taps < 1 ? "WAIT FOR TAPS" : `TAP ${category.name.toUpperCase()}`;
  $("#commit-title").textContent = definition.name.toUpperCase();
  $("#commit-progress").textContent = `${progress}/${definition.cost}`;
}

function renderStructures(prefix, player) {
  const element = $(`#${prefix}-structures`);
  const signature = player.structures.join("|");
  if (element.dataset.signature === signature) return;
  element.dataset.signature = signature;
  element.innerHTML = Array.from({ length: 8 }, (_, index) => {
    const key = player.structures[index];
    if (!key) return `<i class="structure-tile empty"><span>${index + 1}</span></i>`;
    const card = DATA.cards[key];
    return `<i class="structure-tile built" style="--structure-color:${card.color}" title="${card.name}"><span>${card.short}</span></i>`;
  }).join("");
}
function renderWall(prefix, player) {
  const element = $(`#${prefix}-wall`);
  element.classList.toggle("broken", player.wallHp <= 0 && player.shield <= 0);
  element.classList.toggle("shielded", player.shield > 0);
  element.querySelector("i").style.width = `${clamp((player.wallHp + player.shield) / (player.wallCap + 90) * 100, 0, 100)}%`;
  $(`#${prefix}-wall-value`).textContent = `${Math.ceil(player.wallHp)}${player.shield ? "+S" : ""}`;
}
function applyCue(element, progress, pending, visible = true) {
  if (!element) return;
  element.style.setProperty("--load", pending ? 1 : progress);
  element.classList.toggle("project-active", progress > 0 && !pending);
  element.classList.toggle("project-pending", pending);
  element.classList.toggle("weapon-disabled", !visible && progress <= 0 && !pending);
}
function cueState(player, category) {
  let progress = 0;
  if (category === "attack") progress = player.weaponProgress / DATA.weapons[player.weapon].cost;
  for (const key of player.hand) if (DATA.cards[key].category === category) progress = Math.max(progress, (player.cardProgress[key] || 0) / DATA.cards[key].cost);
  const pending = player.pending.some(job => job.source === "weapon" ? category === "attack" : DATA.cards[job.key]?.category === category);
  return { progress, pending };
}
function siphonTarget(player, attacker, category) {
  const candidates = [];
  const weapon = DATA.weapons[player.weapon];
  if (category === "attack" && player.weaponProgress > 0 && !player.pending.some(job => job.source === "weapon")) {
    candidates.push({ source: "weapon", key: player.weapon, progress: player.weaponProgress / weapon.cost });
  }
  for (const key of player.hand) {
    const card = DATA.cards[key];
    if (card.category !== category || (player.cardProgress[key] || 0) <= 0 || player.pending.some(job => job.source === "card" && job.key === key)) continue;
    candidates.push({ source: "card", key, progress: player.cardProgress[key] / card.cost });
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
  element.classList.toggle("counterable", Boolean(target));
  element.classList.toggle("siphon-locked", Boolean(lock?.totalTaps));
  if (!target) {
    delete element.dataset.siphonSource;
    delete element.dataset.siphonKey;
    delete element.dataset.siphonDots;
    return;
  }
  element.dataset.siphonSource = target.source;
  element.dataset.siphonKey = target.key;
  element.dataset.siphonDots = `${"●".repeat(lock?.burst || 0)}${"○".repeat(3 - (lock?.burst || 0))}`;
}
function cueElement(prefix, category) { return $(`#${prefix}-${category === "attack" ? "weapon" : category}`); }
function renderProjectCues(prefix, player, attacker = null) {
  const weapon = DATA.weapons[player.weapon];
  const weaponElement = cueElement(prefix, "attack");
  weaponElement.classList.toggle("cannon", player.weapon === "cannon");
  weaponElement.classList.toggle("volley", player.weapon === "volley");
  weaponElement.querySelector(".weapon-label").textContent = weapon.short;
  weaponElement.setAttribute("aria-label", `${prefix === "enemy" ? "Rival" : "Your"} ${weapon.name} and Attack commitment`);
  for (const category of ["attack", "crew", "magic"]) {
    const state = cueState(player, category);
    const element = cueElement(prefix, category);
    applyCue(element, state.progress, state.pending, true);
    setSiphonCue(element, prefix === "enemy" ? siphonTarget(player, attacker, category) : null, attacker);
  }
}
function renderPhase(phase) {
  const copy = PHASE_COPY[phase.key];
  const banner = $("#phase-banner");
  banner.className = `phase-banner ${phase.key} ${phase.tapMultiplier === 2 ? "double-taps" : ""}`;
  $("#phase-number").textContent = copy.number;
  $("#phase-kicker").textContent = phase.tapMultiplier === 2 ? "3:00 ESCALATION" : copy.kicker;
  $("#phase-name").textContent = phase.tapMultiplier === 2 ? "DOUBLE TAPS" : copy.name;
  $("#phase-rule").textContent = phase.tapMultiplier === 2 ? "All tap generation x2" : copy.rule;
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
function animateEvent(event) {
  if (!event || event.id <= lastEventId) return;
  lastEventId = event.id;
  if (["hit", "wallBreak"].includes(event.type)) {
    const ownAttack = event.side === ownSide;
    const projectile = ownAttack ? $("#own-projectile") : $("#enemy-projectile");
    const heavy = ["cannon", "timeBomb", "sappers"].includes(event.source);
    projectile.className = `projectile ${ownAttack ? "own-projectile fire-up" : "enemy-projectile fire-down"}`;
    projectile.style.background = heavy ? "var(--orange)" : "var(--cyan)";
    setTimeout(() => {
      $("#impact-flash").classList.remove("flash");
      void $("#impact-flash").offsetWidth;
      $("#impact-flash").classList.add("flash");
      projectile.className = `projectile ${ownAttack ? "own-projectile" : "enemy-projectile"}`;
    }, heavy ? 420 : 70);
    tone(heavy ? 90 : 180, .13, "square", .055);
    if (event.type === "wallBreak" && event.salvageSide === ownSide) toast(`WALL BREACHED - ${event.salvage || 4} TAPS SALVAGED`);
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
    }
    tone(event.removed ? 680 : 510, event.removed ? .09 : .035, "triangle", .035);
    if (event.removed) toast(ownAttack ? `SIPHONED ${event.removed} TAP${event.removed === 1 ? "" : "S"}` : `RIVAL SIPHONED ${event.removed} TAP${event.removed === 1 ? "" : "S"}`);
  }
  if (event.type === "commit" && event.side !== ownSide && event.key === "timeBomb") toast("RIVAL TIME BOMB ARMED");
}
function render(state) {
  if (!state?.players) return;
  matchState = state;
  const player = me();
  const enemy = rival();
  renderPhase(state.phase);
  $("#timer").textContent = formatTime(state.elapsed);
  $("#own-core-board").textContent = Math.ceil(player.coreHp);
  $("#enemy-core-value").textContent = Math.ceil(enemy.coreHp);
  $("#enemy-core-board").textContent = Math.ceil(enemy.coreHp);
  $("#enemy-core-bar").style.width = `${enemy.coreHp / 360 * 100}%`;
  $("#tap-value").textContent = Math.floor(player.taps);
  $("#tap-bar").style.width = `${player.taps / 40 * 100}%`;
  $("#enemy-tap-bar").style.width = `${enemy.taps / 40 * 100}%`;
  const regen = (state.phase.regen + player.forges * .2 + player.glassReactors * .28 + player.scoutCamps * .12) * state.phase.tapMultiplier;
  $("#regen-value").textContent = `+${regen.toFixed(2)}/s`;
  const enemyHasProject = ["attack", "crew", "magic"].some(category => siphonTarget(enemy, player, category));
  $("#reserve-hint").textContent = player.taps >= 39.8 ? "RESERVE CAPPED - regeneration is being wasted." : enemyHasProject ? "Purple target: tap the rival project 3 times to siphon its progress." : player.taps < 3 ? "Low reserve. Your hand is narrowing." : "Complete a card to rotate the next card into its hand slot.";
  renderWall("own", player);
  renderWall("enemy", enemy);
  renderStructures("own", player);
  renderStructures("enemy", enemy);
  renderProjectCues("own", player);
  renderProjectCues("enemy", enemy, player);
  const bot = enemy.bot;
  $("#enemy-label").textContent = bot?.name || "LIVE RIVAL";
  $("#enemy-plan").textContent = bot?.label || "ONLINE TACTICIAN";
  renderBattleHand();
  renderActionControls();
  animateEvent(state.lastEvent);
}
function commitTap(event) {
  const player = me();
  if (!gameActive || !matchState || targetBlocked(player)) { tone(70, .035, "square", .02); return; }
  const ripple = $(".tap-ripple");
  const rect = $("#commit-button").getBoundingClientRect();
  ripple.style.left = `${(event?.clientX || rect.left + rect.width / 2) - rect.left}px`;
  ripple.style.top = `${(event?.clientY || rect.top + rect.height / 2) - rect.top}px`;
  ripple.classList.remove("go");
  void ripple.offsetWidth;
  ripple.classList.add("go");
  tone(320 + targetProgress(player) * 18, .025, "sine", .018);
  socket.emit("action", { type: "tap", source: selectedTarget.source, key: keyForTarget(player) });
}
function activateCommit(event) {
  if (event.type === "click" && event.detail !== 0) return;
  event.preventDefault();
  commitTap(event);
}
function activateCommitKey(event) {
  if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  commitTap(event);
}
function selectHandCard(event) {
  const button = event.target.closest("[data-hand-slot]");
  if (!button || !event.currentTarget.contains(button)) return;
  if (event.type === "click" && event.detail !== 0) return;
  event.preventDefault();
  button.focus({ preventScroll: true });
  selectTarget("card", Number(button.dataset.handSlot));
}
function selectWeapon(event) {
  if (event.type === "click" && event.detail !== 0) return;
  event.preventDefault();
  event.currentTarget.focus({ preventScroll: true });
  selectTarget("weapon");
}
function siphonTap(event) {
  const element = event.currentTarget;
  if (!gameActive || !element.classList.contains("counterable") || me()?.taps < 1) { tone(70, .035, "square", .02); return; }
  event.preventDefault();
  element.classList.remove("siphon-tap");
  void element.offsetWidth;
  element.classList.add("siphon-tap");
  tone(470, .025, "triangle", .022);
  socket.emit("action", { type: "siphon", source: element.dataset.siphonSource, key: element.dataset.siphonKey });
}

function tacticalRead(player, enemy) {
  if (player.stats.capWaste > 12) return `Your reserve sat full for ${Math.round(player.stats.capWaste)} seconds. Rotate cheap cards sooner so regeneration keeps producing options.`;
  if (player.forges + player.glassReactors >= 3 && player.stats.damage < enemy.stats.damage * .7) return "You over-invested in engines while the rival converted their hand into pressure. Trim one economy card or attack sooner.";
  if (player.stats.cardsPlayed < 4) return "Your deck barely cycled. Cheaper cards or more decisive commitments would expose more of your six-card strategy.";
  if (player.stats.cannons + player.stats.volleys < 2) return "Your permanent weapon was underused. It exists outside the cycle so a difficult hand never removes your basic pressure option.";
  return "Review which cards were stranded in hand. A strong deck needs useful plays at several reserve levels, not only powerful expensive effects.";
}
function endGame({ winner, reason, state }) {
  if (!gameActive || !state) return;
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
  $("#result-kicker").innerHTML = `<span></span> ${reason === "core" ? "CORE DESTROYED" : "RIVAL DISCONNECTED"}`;
  $("#result-title").textContent = draw ? "STALEMATE" : won ? "VICTORY" : "DEFEAT";
  $("#result-title").style.color = draw ? "var(--ink)" : won ? "var(--acid)" : "var(--danger)";
  $("#result-copy").textContent = draw ? "Neither cycle produced a decisive edge." : won ? "Your six-card cycle produced the stronger final sequence." : "The rival converted their hand and weapon more efficiently.";
  $("#result-own-core").textContent = Math.ceil(player.coreHp);
  $("#result-enemy-core").textContent = Math.ceil(enemy.coreHp);
  $("#result-taps").textContent = player.stats.tapsSpent;
  $("#result-damage").textContent = Math.round(player.stats.damage);
  $("#result-waste").textContent = `${Math.round(player.stats.capWaste)}s`;
  $("#result-read").textContent = tacticalRead(player, enemy);
  $("#again-copy").textContent = mode === "cpu" ? "New CPU deck, same fair rules" : "Return to online matchmaking";
  $("#result-modal").classList.remove("hidden");
  tone(won ? 520 : draw ? 240 : 120, .35, won ? "sine" : "triangle", .06);
}
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.add("hidden"), 2100);
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

$("#solo-button").addEventListener("click", startCpu);
$("#online-button").addEventListener("click", toggleOnlineQueue);
$("#open-deck").addEventListener("click", openDeckBuilder);
$("#edit-deck").addEventListener("click", openDeckBuilder);
$("#close-deck").addEventListener("click", () => $("#deck-modal").classList.add("hidden"));
$("#save-deck").addEventListener("click", saveDeckBuilder);
$("#weapon-options").addEventListener("click", event => {
  const button = event.target.closest("[data-weapon]");
  if (!button) return;
  builderWeapon = button.dataset.weapon;
  renderDeckBuilder();
});
$("#battle-hand").addEventListener("pointerdown", selectHandCard);
$("#battle-hand").addEventListener("click", selectHandCard);
$("#weapon-card").addEventListener("pointerdown", selectWeapon);
$("#weapon-card").addEventListener("click", selectWeapon);
$("#commit-button").addEventListener("pointerdown", activateCommit);
$("#commit-button").addEventListener("click", activateCommit);
$("#commit-button").addEventListener("keydown", activateCommitKey);
for (const zone of ["weapon", "crew", "magic"]) $("#enemy-" + zone).addEventListener("pointerdown", siphonTap);
$("#leave-battle").addEventListener("click", () => { socket.emit("leaveMatch"); showLobby(); });
$("#lobby-button").addEventListener("click", () => {
  if (profile.challengeComplete) { profile.challenge = (profile.challenge + 1) % CHALLENGES.length; profile.challengeComplete = false; saveProfile(); }
  showLobby();
});
$("#again-button").addEventListener("click", () => {
  $("#result-modal").classList.add("hidden");
  if (profile.challengeComplete) { profile.challenge = (profile.challenge + 1) % CHALLENGES.length; profile.challengeComplete = false; saveProfile(); }
  if (mode === "cpu") startCpu(); else { searching = false; toggleOnlineQueue(); showLobby(); }
});
$("#sound-toggle").addEventListener("click", event => {
  soundEnabled = !soundEnabled;
  event.currentTarget.textContent = soundEnabled ? "SOUND ON" : "SOUND OFF";
  if (soundEnabled) tone(420, .08);
});

socket.on("queueStatus", ({ searching: value }) => {
  searching = value;
  if (!value) {
    $("#online-button").classList.remove("searching");
    $("#online-button span").textContent = "FIND RIVAL";
    $("#queue-message").textContent = "Real-time online 1v1";
  }
});
socket.on("matchFound", ({ side, state }) => {
  ownSide = side;
  mode = state.mode;
  searching = false;
  selectedTarget = { source: "card", slot: 0 };
  showGame();
  render(state);
});
socket.on("state", state => { if (gameActive) render(state); });
socket.on("gameOver", payload => endGame(payload));
socket.on("disconnect", () => { if (gameActive) toast("CONNECTION LOST - RECONNECTING"); });

renderProfile();
