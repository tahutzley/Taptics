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
let inspectedElement = null;

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
function currentRating() { return Math.max(0, 1000 + profile.wins * 30 - (profile.duels - profile.wins) * 20); }

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
  $("#loadout-deck").innerHTML = profile.deck.map(key => {
    const card = DATA.cards[key];
    return `<div class="loadout-card category-${card.category}" style="--card-color:${card.color};--category-color:${DATA.categories[card.category].color}"><b>${card.short}</b><small>${DATA.categories[card.category].short} · ${card.cost}T</small></div>`;
  }).join("");
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
function showLobby() {
  gameActive = false;
  matchState = null;
  hideCardInspector();
  $("#game").classList.add("hidden");
  $("#deck-screen").classList.add("hidden");
  $("#lobby").classList.remove("hidden");
  $("#main-menu-tabs").classList.remove("hidden");
  document.body.classList.add("menu-active");
  $("#result-modal").classList.add("hidden");
  $(".lobby-scroll").scrollTop = 0;
  setMenuTab("battle");
  window.scrollTo({ top: 0, behavior: "auto" });
  renderProfile();
}
function showGame() {
  gameActive = true;
  lastEventId = 0;
  lastPhase = null;
  lastDoubleTaps = false;
  $("#lobby").classList.add("hidden");
  $("#deck-screen").classList.add("hidden");
  $("#main-menu-tabs").classList.add("hidden");
  document.body.classList.remove("menu-active");
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
  $("#lobby").classList.add("hidden");
  $("#deck-screen").classList.remove("hidden");
  $("#main-menu-tabs").classList.remove("hidden");
  document.body.classList.add("menu-active");
  $("#deck-screen").scrollTop = 0;
  setMenuTab("deck");
  $("#open-deck").focus({ preventScroll: true });
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
  renderProfile();
  toast("LOADOUT SAVED");
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
  return `<button class="action-card battle-card category-${card.category}" data-hand-slot="${slot}" data-card-key="${key}" data-busy-label="${category.name.toUpperCase()} IS BUSY" aria-label="Place ${card.name} in the ${category.name} zone" style="--card-color:${card.color};--category-color:${category.color}"><span class="action-key" style="border-color:${card.color}">${card.short}</span><b class="action-name">${card.name}</b><em>${card.cost}<small>T</small></em></button>`;
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
    button.classList.toggle("disabled", blocked);
    button.disabled = blocked;
    button.setAttribute("aria-disabled", String(blocked));
    button.dataset.busyLabel = `${DATA.categories[card.category].name.toUpperCase()} IS BUSY`;
  });
  const next = DATA.cards[player.nextCard];
  $("#next-card-label").textContent = next ? `NEXT: ${next.name.toUpperCase()}` : "NEXT: --";
  const weapon = DATA.weapons[player.weapon];
  $("#weapon-short").textContent = weapon.short;
  $("#weapon-name").textContent = weapon.name.toUpperCase();
  $("#weapon-cost").textContent = weapon.cost;
  const weaponButton = $("#weapon-card");
  weaponButton.style.setProperty("--card-color", weapon.color);
  weaponButton.classList.toggle("pending", player.pending.some(job => job.source === "weapon"));
  const weaponBlocked = laneBlocked(player, "weapon", player.weapon);
  weaponButton.classList.toggle("disabled", weaponBlocked);
  weaponButton.disabled = weaponBlocked;
  weaponButton.querySelector(".action-progress").style.width = `${player.weaponProgress / weapon.cost * 100}%`;
  weaponButton.setAttribute("aria-label", `${weaponBlocked ? "Attack is busy. " : "Tap to load "}${weapon.name}. ${player.weaponProgress} of ${weapon.cost} taps committed.`);
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
function renderQueuedAction(prefix, player, category) {
  const element = $(`#${prefix}-action-${category}`);
  const entry = player.placed?.[category];
  const pendingJob = player.pending.find(job => job.source === "card" && DATA.cards[job.key]?.category === category);
  const key = entry?.key || pendingJob?.key;
  if (!key) {
    if (inspectedElement === element) hideCardInspector();
    element.classList.add("hidden");
    delete element.dataset.actionKey;
    return;
  }
  const card = DATA.cards[key];
  const progress = pendingJob ? card.cost : player.cardProgress[key] || 0;
  const laneConflict = laneBlocked(player, "card", key);
  const blocked = Boolean(pendingJob || player.taps < 1 || laneConflict);
  element.classList.remove("hidden");
  element.classList.toggle("locked", blocked);
  element.classList.toggle("pending", Boolean(pendingJob));
  element.style.setProperty("--action-color", card.color);
  element.style.setProperty("--action-progress", progress / card.cost);
  element.dataset.actionKey = key;
  element.querySelector(".commit-icon").textContent = card.short;
  const categoryName = DATA.categories[category].name.toUpperCase();
  element.querySelector(".commit-copy small").textContent = pendingJob ? "WINDING UP" : prefix === "enemy" ? `${categoryName} ${progress > 0 ? "ACTIVE" : "STAGED"}` : laneConflict ? `${categoryName} BUSY` : player.taps < 1 ? "WAIT FOR TAPS" : `TAP ${categoryName}`;
  element.querySelector(".commit-copy strong").textContent = card.name.toUpperCase();
  element.querySelector(":scope > em").textContent = `${progress}/${card.cost}`;
  const label = `${prefix === "enemy" ? "Rival" : "Your"} ${card.name}. ${progress} of ${card.cost} taps committed${pendingJob ? ", winding up" : ""}.`;
  element.setAttribute("aria-label", label);
  if (prefix === "own") element.disabled = blocked;
}
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
    const target = prefix === "enemy" ? siphonTarget(player, attacker, category) : null;
    applyCue(element, state.progress, state.pending, true);
    setSiphonCue(element, target, attacker);
    renderQueuedAction(prefix, player, category);
    if (prefix === "enemy") setSiphonCue($(`#enemy-action-${category}`), target, attacker);
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
    if (event.type === "wallBreak") toast(event.targetSide === ownSide ? "YOUR WALL IS DOWN" : "RIVAL WALL IS DOWN");
  }
  if (event.type === "place") {
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
  const regen = (state.phase.regen + player.forges * .2 + player.glassReactors * .28 + player.scoutCamps * .12 + (player.guilds || 0) * .1) * state.phase.tapMultiplier;
  $("#regen-value").textContent = `+${regen.toFixed(2)}/s`;
  const enemyHasProject = ["attack", "crew", "magic"].some(category => siphonTarget(enemy, player, category));
  $("#reserve-hint").textContent = player.taps >= 39.8 ? "RESERVE CAPPED - regeneration is being wasted." : enemyHasProject ? "Purple target: tap the rival project 3 times to siphon its progress." : player.taps < 3 ? "Low reserve. Your hand is narrowing." : "Place cards into category zones, then tap each queued card directly.";
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
  animateEvent(state.lastEvent);
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
  $("#inspector-icon").textContent = definition.short;
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
  if (!gameActive || !key || player.placed?.[category]?.key !== key || element.disabled || player.taps < 1) { tone(70, .035, "square", .02); return; }
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
  if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  commitQueuedAction(event);
}
function flyCard(source, destination, returning = false) {
  if (!source || !destination) return;
  const start = source.getBoundingClientRect();
  const end = destination.getBoundingClientRect();
  if (!start.width || !end.width) return;
  const clone = source.cloneNode(true);
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  clone.className = `card-flight ${returning ? "returning" : "deploying"}`;
  Object.assign(clone.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px` });
  document.body.appendChild(clone);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const moveX = end.left + end.width / 2 - (start.left + start.width / 2);
  const moveY = end.top + end.height / 2 - (start.top + start.height / 2);
  const scale = Math.min(1.25, end.width / start.width);
  const animation = clone.animate([
    { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 },
    { transform: `translate(${moveX * .55}px,${moveY * .55 - 28}px) scale(1.08) rotate(${returning ? -3 : 3}deg)`, opacity: 1, offset: .58 },
    { transform: `translate(${moveX}px,${moveY}px) scale(${scale}) rotate(0deg)`, opacity: .15 }
  ], { duration: reduceMotion ? 1 : 340, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
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
  if (!gameActive || !card || button.disabled || button.dataset.placing) { tone(70, .035, "square", .02); return; }
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
  if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  placeHandCard(event);
}
function commitWeapon(event, element = event.currentTarget) {
  if (event.type === "pointerdown" && event.button !== 0) return;
  if (event.type === "click" && event.detail !== 0) return;
  event.preventDefault();
  const player = me();
  if (!gameActive || !player || element.disabled || player.taps < 1) { tone(70, .035, "square", .02); return; }
  pulseTap(element, event);
  tone(360 + player.weaponProgress * 18, .025, "sine", .018);
  socket.emit("action", { type: "tap", source: "weapon", key: player.weapon });
}
function commitWeaponKey(event) {
  if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  commitWeapon(event);
}
function siphonTap(event, element = event.currentTarget) {
  if (event.type === "pointerdown" && event.button !== 0) return;
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
$("#challenge-play").addEventListener("click", startCpu);
$("#online-button").addEventListener("click", toggleOnlineQueue);
$("#battle-tab").addEventListener("click", showLobby);
$("#open-deck").addEventListener("click", openDeckBuilder);
$("#edit-deck").addEventListener("click", openDeckBuilder);
$("#save-deck").addEventListener("click", saveDeckBuilder);
$("#weapon-options").addEventListener("click", event => {
  const button = event.target.closest("[data-weapon]");
  if (!button) return;
  builderWeapon = button.dataset.weapon;
  renderDeckBuilder();
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
for (const zone of ["weapon", "crew", "magic"]) $("#enemy-" + zone).addEventListener("pointerdown", siphonTap);
for (const category of ["attack", "crew", "magic"]) {
  const action = $(`#enemy-action-${category}`);
  action.addEventListener("pointerdown", siphonTap);
  action.addEventListener("contextmenu", event => {
    inspectCardContext(event, action, "card", action.dataset.actionKey);
  });
}
document.addEventListener("pointerdown", event => { if (event.button === 0) hideCardInspector(); }, true);
document.addEventListener("keydown", event => { if (event.key === "Escape") hideCardInspector(); });
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
  showGame();
  render(state);
});
socket.on("state", state => { if (gameActive) render(state); });
socket.on("gameOver", payload => endGame(payload));
socket.on("disconnect", () => { if (gameActive) toast("CONNECTION LOST - RECONNECTING"); });

renderProfile();
