/* Taptics client: local CPU simulation and Socket.IO random-match client. */
const socket = io();
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const cards = { scout: { cost: 4, name: "Scout", hp: 70, speed: 8.2, damage: 9, color: "#5eead4" }, ram: { cost: 7, name: "Ram", hp: 235, speed: 3.6, damage: 20, color: "#fb923c" }, swarm: { cost: 5, name: "Spark Swarm", hp: 42, speed: 10.8, damage: 6, color: "#c4b5fd", count: 3 } };
let mode = null;
let tapMode = "mine";
let solo = null;
let onlineState = null;
let ownSide = 1;
let soloTimer = null;
let gameActive = false;
let searching = false;

function freshPlayer() { return { coreHp: 1000, energy: 6, heat: 0, towerHp: 0, shield: 0, taps: 0 }; }
function startSolo() {
  mode = "solo"; gameActive = true; onlineState = null;
  solo = { players: { 1: freshPlayer(), 2: freshPlayer() }, units: [], startedAt: Date.now(), nextId: 1, lastTick: Date.now(), cpuCooldown: 0 };
  showGame();
  clearInterval(soloTimer); soloTimer = setInterval(tickSolo, 150);
  render(solo);
}
function showGame() { $("#lobby").classList.add("hidden"); $("#game").classList.remove("hidden"); $("#result-modal").classList.add("hidden"); $("#mode-label").textContent = mode === "solo" ? "SOLO BATTLE" : "ONLINE DUEL"; $("#enemy-label").textContent = mode === "solo" ? "CPU COMMANDER" : "RIVAL CORE"; }
function player(state, side) { return state.players[side]; }
function other(side) { return side === 1 ? 2 : 1; }
function makeUnit(state, side, key, index = 0) { const card = cards[key]; state.units.push({ id: state.nextId++, side, type: card.name, hp: card.hp, maxHp: card.hp, speed: card.speed, damage: card.damage, color: card.color, position: side === 1 ? 8 - index * 2 : 92 + index * 2 }); }
function playLocal(side, key) {
  const p = player(solo, side);
  if (cards[key] && p.energy >= cards[key].cost) { p.energy -= cards[key].cost; for (let i = 0; i < (cards[key].count || 1); i++) makeUnit(solo, side, key, i); }
  if (key === "tower" && p.energy >= 8 && !p.towerHp) { p.energy -= 8; p.towerHp = 300; }
  if (key === "shield" && p.energy >= 5) { p.energy -= 5; p.shield = 8; }
}
function tapLocal(side, action) {
  const p = player(solo, side); p.heat = Math.min(100, p.heat + 7); p.taps++;
  if (action === "mine") p.energy = Math.min(10, p.energy + (p.heat > 75 ? .32 : .8));
  if (action === "build") { if (p.towerHp) p.towerHp = Math.min(300, p.towerHp + 12); else p.shield = Math.min(8, p.shield + .9); }
  if (action === "pulse") { const target = solo.units.filter(u => u.side === other(side)).sort((a,b) => side === 1 ? a.position - b.position : b.position - a.position)[0]; if (target) target.hp -= 28; else player(solo, other(side)).coreHp = Math.max(0, player(solo, other(side)).coreHp - 5); }
}
function tickSolo() {
  if (!gameActive || !solo) return;
  const now = Date.now(), delta = Math.min(.35, (now - solo.lastTick) / 1000); solo.lastTick = now;
  const elapsed = (now - solo.startedAt) / 1000;
  for (const side of [1,2]) { const p = player(solo,side); p.energy = Math.min(10,p.energy + delta*.13); p.heat = Math.max(0,p.heat-delta*10); p.shield = Math.max(0,p.shield-delta); }
  const defeated = new Set();
  for (const unit of solo.units) { const defenderSide = other(unit.side); const collision = solo.units.filter(x => x.side===defenderSide && !defeated.has(x.id)).find(x => Math.abs(x.position-unit.position)<5); if(collision){ collision.hp -= unit.damage*delta*1.75; if(collision.hp<=0)defeated.add(collision.id); continue; } const defender=player(solo,defenderSide); const inHalf=unit.side===1?unit.position>52:unit.position<48; if(defender.towerHp&&inHalf){unit.hp-=20*delta;if(unit.hp<=0)defeated.add(unit.id)} unit.position+=(unit.side===1?1:-1)*unit.speed*delta; if(unit.side===1?unit.position>=100:unit.position<=0){defender.coreHp=Math.max(0,defender.coreHp-unit.damage*5*(defender.shield? .55:1));defeated.add(unit.id)} }
  solo.units=solo.units.filter(x=>!defeated.has(x.id)&&x.hp>0);
  solo.cpuCooldown -= delta;
  if(solo.cpuCooldown<=0){ const cpu=player(solo,2); const options=[]; if(cpu.energy>=4)options.push("scout"); if(cpu.energy>=5)options.push("swarm","shield"); if(cpu.energy>=7)options.push("ram"); if(cpu.energy>=8&&!cpu.towerHp)options.push("tower"); if(options.length)playLocal(2,options[Math.floor(Math.random()*options.length)]); solo.cpuCooldown=1.5+Math.random()*1.8; }
  if(Math.random()<.11)tapLocal(2, solo.units.some(unit => unit.side === 1) ? "pulse" : "mine");
  if(elapsed>=180 || solo.players[1].coreHp<=0 || solo.players[2].coreHp<=0) endGame(solo.players[1].coreHp===solo.players[2].coreHp?0:solo.players[1].coreHp>solo.players[2].coreHp?1:2, elapsed>=180?"time":"core");
  render(solo);
}
function render(state) {
  const me=player(state,ownSide), enemy=player(state,other(ownSide));
  $("#own-hp").textContent=Math.ceil(me.coreHp); $("#enemy-hp").textContent=Math.ceil(enemy.coreHp); $("#energy-value").textContent=me.energy.toFixed(1); $("#heat-value").textContent=Math.round(me.heat); $("#energy-bar").style.width=`${me.energy*10}%`; $("#heat-bar").style.width=`${me.heat}%`;
  const seconds=mode==="solo"?Math.max(0,180-Math.floor((Date.now()-solo.startedAt)/1000)):state.timeLeft; $("#timer").textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;
  $("#own-tower").classList.toggle("hidden",!me.towerHp); $("#enemy-tower").classList.toggle("hidden",!enemy.towerHp); $("#own-core").style.opacity=String(.45+.55*me.coreHp/1000); $("#enemy-core").style.opacity=String(.45+.55*enemy.coreHp/1000);
  $("#units").innerHTML=state.units.map(unit=>{ const own=unit.side===ownSide; const x=own?unit.position:100-unit.position; return `<div class="unit" data-side="${own?1:2}" style="left:${x}%;color:${unit.color};background:${unit.color}33"><div class="tiny-hp"><i style="width:${Math.max(0,unit.hp/unit.maxHp*100)}%"></i></div>${unit.type[0]}</div>`; }).join("");
  $$(".card").forEach(button=>button.disabled=!gameActive||me.energy<Number(button.querySelector(".cost").textContent));
}
function endGame(winner, reason) { if(!gameActive)return; gameActive=false;clearInterval(soloTimer); $("#result-modal").classList.remove("hidden"); const victory=winner===ownSide; $("#result-title").textContent=winner===0?"DRAW!":victory?"VICTORY!":"DEFEAT"; $("#result-title").style.color=victory?"#7bf0d8":"#ff9b8e"; $("#result-copy").textContent=winner===0?"Both Cores survived with equal strength.":victory?"You cracked their Core. A crate has been added to your haul!":reason==="disconnect"?"Your rival disconnected. You take the win.":"Your Core fell. Rebuild and try a new strategy."; $("#crate").classList.toggle("hidden",!victory); }
function action(type, card) { if(!gameActive)return; if(mode==="solo"){ if(type==="tap")tapLocal(1,card); else playLocal(1,card); render(solo); }else socket.emit("action",{type,card}); }

$("#solo-button").addEventListener("click",startSolo);
$("#online-button").addEventListener("click",()=>{
  if (searching) {
    socket.emit("cancelSearch");
    searching = false;
    $("#queue-message").textContent = "";
    $("#online-button").textContent = "◉ Find Random Rival";
    return;
  }
  socket.emit("findMatch");
  searching = true;
  $("#queue-message").textContent = "Searching for a rival…";
  $("#online-button").textContent = "Cancel search";
});
$$(".tap-button").forEach(button=>button.addEventListener("click",()=>{tapMode=button.dataset.tap;$$(".tap-button").forEach(x=>x.classList.toggle("active",x===button));const labels={mine:["⛏","TAP TO MINE","Gain energy for your deck"],pulse:["✦","TAP TO PULSE","Hit the nearest enemy"],build:["⌂","TAP TO BUILD","Repair tower or charge shield"]};[$("#tap-icon").textContent,$("#tap-title").textContent,$("#tap-copy").textContent]=labels[tapMode];}));
$("#tap-action").addEventListener("pointerdown",event=>{event.preventDefault();action("tap",tapMode);$("#tap-action").classList.add("flash");setTimeout(()=>$("#tap-action").classList.remove("flash"),180);});
$$(".card").forEach(button=>button.addEventListener("click",()=>action("play",button.dataset.card)));
$("#again-button").addEventListener("click",()=>{ if(mode==="online")socket.emit("findMatch");else startSolo(); $("#result-modal").classList.add("hidden"); });
$("#lobby-button").addEventListener("click",()=>{gameActive=false;clearInterval(soloTimer);$("#game").classList.add("hidden");$("#lobby").classList.remove("hidden");$("#result-modal").classList.add("hidden");});
socket.on("queueStatus",({searching: isSearching})=>{if(!isSearching){searching=false;$("#queue-message").textContent="";$("#online-button").textContent="◉ Find Random Rival";}});
socket.on("matchFound",({side,state})=>{mode="online";ownSide=side;onlineState=state;gameActive=true;searching=false;$("#online-button").textContent="◉ Find Random Rival";$("#queue-message").textContent="";showGame();render(state);});
socket.on("state",state=>{onlineState=state;if(mode==="online"&&gameActive)render(state);});
socket.on("gameOver",({winner,reason})=>endGame(winner,reason));
