// Entry point: builds the world, reads the controls and runs the game loop.

import * as THREE from 'three';
import { applyPaint } from './materials.js';
import { buildWaves, waveHeight, sea } from './waves.js';
import { createEnvironment, WEATHERS } from './environment.js';
import { createWindFx } from './windfx.js';
import { createOcean } from './ocean.js';
import { createSky } from './sky.js';
import { createIslands, ISLANDS, FEATURES, nightLights, terrainHeight, coastAt, updateIslands } from './islands.js';
import { createShore } from './shore.js';
import { createWildlife } from './wildlife.js';
import { createPeople, buildPerson } from './people.js';
import { createFinds } from './finds.js';
import { createTreasure } from './treasure.js';
import { createCombat, inArc } from './combat.js';
import { createVessels } from './vessels.js';
import { createLoot } from './loot.js';
import { cargoCount } from './save.js';
import { ZONES, zoneAt, addWanted, coolOff, isWanted, wanted, LORD_AFTER, lordState, lordOf, lordsBeaten } from './factions.js';
import * as jobs from './jobs.js';
import { grant, hasReward } from './rewards.js';
import { createPlaces, ALL_LOOK_VALUES } from './places.js';
import { createChart } from './chart.js';
import { save, persist, wipe } from './save.js';
import { createShip, SHIP_COLORS, SHIP_TYPES, NO_GO } from './ship.js';
import { createAudio, MODE_LABELS } from './audio.js';

const canvas = document.getElementById('sea');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 500, 5000);
const camera = new THREE.PerspectiveCamera(55, 1, 1, 14000);

const sun = new THREE.DirectionalLight(0xffffff, 2);
const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
scene.add(sun, sun.target, hemi);

// ---- Wind and weather -----------------------------------------------------------
const WIND_BASE = 0.29; // radians; the direction the trade wind blows toward
const wind = { dx: 1, dz: 0, speed: 13 };
const env = createEnvironment();
function updateWind(t) {
  const a = WIND_BASE + 0.22 * Math.sin(t * 0.013) + 0.09 * Math.sin(t * 0.031 + 1);
  wind.dx = Math.cos(a);
  wind.dz = Math.sin(a);
  wind.speed = env.windSpeed;
  sea.state = env.sea;
}

// ---- World -----------------------------------------------------------------------
const waves = buildWaves(WIND_BASE);
const islands = createIslands();
const ocean = createOcean(waves, FEATURES);
const sky = createSky();
const ship = createShip(waves);
// Pick up where the last session left off, as long as that spot is still open water.
if (save.ship.x !== undefined && terrainHeight(save.ship.x, save.ship.z) < -3) {
  Object.assign(ship.state, { x: save.ship.x, z: save.ship.z, heading: save.ship.heading, sail: save.ship.sail, anchorDown: save.ship.anchor, anchorDepth: save.ship.anchor ? 1 : 0, speed: 0, hull: save.ship.hull > 0 ? save.ship.hull : 1 });
  env.hour = save.ship.hour;
}
function saveGame() {
  const s = ship.state;
  if (s.sinking) return; // nothing to save while she is going down
  save.fleet = vessels.fleet().filter((v) => !v.sinking).map((v) => ({ type: v.typeId, hull: v.hull }));
  save.ship = { x: s.x, z: s.z, heading: s.heading, sail: s.sail, anchor: s.anchorDown, hour: env.hour, hull: s.hull };
  persist();
}
const windFx = createWindFx();
const shore = createShore();
const wildlife = createWildlife(waves, { foam: foamAt, splash: (distance) => audio.splash(distance) });
scene.add(sky.dome, sky.stars, sky.clouds, islands, ocean.mesh, ship.root, windFx.ribbons, windFx.rain, shore.sailor, shore.dinghy, wildlife.group);
// ---- Fighting: cannon, other ships, damage ----------------------------------------
const fx = {
  foam: foamAt,
  ear: camera.position, // sounds are quieter the further they are from here
  splash: (d) => audio.splash(d),
  boom: (d) => audio.cannon(d),
  crunch: (d) => audio.crunch(d),
  // Somebody has been hit. Firing on honest ships makes you a wanted captain.
  struck: (v, by) => {
    if (by !== me) return;
    if (!v.fleet) { me.lastTarget = v; me.lastTargetFor = 40; } // your fleet will go for whoever you are shooting at
    if (v.faction === 'merchant' && addWanted(0.12, 1)) showToast('You have fired on a merchant. The navy will hunt you.');
    if (v.faction === 'navy' && addWanted(0.2, 2)) showToast('You have fired on the navy. You are a wanted captain.');
  },
  sunk: (v, by) => {
    audio.sink();
    // She leaves her cargo floating. A pirate you sank yourself may have had a map aboard.
    if (v.fleet) { showToast(v.label + ' is lost.'); return; }
    const yours = by === me || by.fleet; // your fleet's kills count as yours
    loot.drop(v, yours && v.faction === 'pirate' && Math.random() < 0.35 && treasure.canHoldMore());
    if (!yours) {
      // Someone else finished a pirate you had been fighting: the navy pays you half for your part.
      if (v.faction === 'pirate' && v.assist > 0) { const half = Math.round(v.bounty / 2); save.bountyDue += half; const more = pirateDown(v); persist(); showToast(`${v.captain} is sunk. ${half} coins for your part in it.` + more, more ? 9 : 3.2); }
      return;
    }
    if (v.faction === 'pirate') { save.piratesSunk++; save.bountyDue += v.bounty; const more = pirateDown(v); persist(); showToast(`${v.captain} is sunk. ${v.bounty} coins bounty to collect at any tavern.` + more, more ? 9 : 3.2); }
    else { addWanted(v.faction === 'navy' ? 2 : 1.5); showToast('You have sunk a ' + v.label.toLowerCase() + '. Every port will hear of it.'); }
  },
  // A beaten ship has hauled down her flag.
  surrendered: (v) => showToast(`${v.captain || 'The ' + v.label.toLowerCase()} has struck her colours. Come alongside to board.`),
  // A ship has left the game for good (one of your fleet, sunk or sold).
  left: () => { refreshTargets(); syncFleet(); },
};
// A pirate has been sunk or taken by you (or finished by others after you had hit her). This settles
// hunting jobs, and counts toward drawing out the lord of those waters. Returns words to add to the
// notice: that the lord is coming, or, if she was the lord, what beating her has earned.
function pirateDown(v) {
  jobs.pirateBeaten(v.zone.name);
  const L = lordState(v.zone);
  if (v.lord) {
    L.beaten = true;
    const won = lordOf(v.zone).rewards.map(grant).filter(Boolean);
    if (lordsBeaten() === ZONES.length) { const last = grant('admiral'); if (last) won.push(last); }
    applyUpgrades();
    return won.length ? ` A pirate lord is beaten! Yours: ${won.join(', ')}.` : '';
  }
  if (L.beaten) return '';
  L.sunk++;
  return L.sunk === LORD_AFTER ? ` Word is that ${lordOf(v.zone).name} will come out for you in ${v.zone.name}.` : '';
}
// The lord of these waters makes sail to meet you.
function summonLord(zone) {
  const v = vessels.addLord(zone, lordOf(zone), me);
  refreshTargets();
  showToast(`A great galleon is standing toward you: ${v.captain}, lord of ${zone.name}.`, 8);
  return v;
}
const combat = createCombat(waves, fx);
const vessels = createVessels(waves, fx, (shooter, side, target) => combat.fire(shooter, side, [target]));
const loot = createLoot(waves);
scene.add(combat.group, vessels.group, loot.group);
// Hook a piece of flotsam aboard. Returns false if it has to be left (no room).
function salvage(item) {
  if (item.kind === 'coins') { save.coins += item.amount; showToast(`Salvaged a sea chest: ${item.amount} coins`); }
  else if (item.kind === 'map') {
    const m = treasure.gainMap();
    if (!m) return false;
    showToast('A bottle among the wreckage, and in it ' + treasure.tierName(m).toLowerCase());
  } else {
    const room = save.hold - cargoCount();
    if (room <= 0) { if (toastTimer <= 0) showToast('Cargo adrift, but your hold is full.'); return false; }
    const n = Math.min(room, item.amount);
    save.cargo[item.good.id] = (save.cargo[item.good.id] || 0) + n;
    showToast(`Salvaged ${n} ${n === 1 ? 'crate' : 'crates'} of ${item.good.name.toLowerCase()}`);
  }
  audio.coin();
  persist();
  return true;
}
// The player's ship as the cannon code sees her: the same shape of thing as any other vessel.
const me = {
  faction: 'player', reload: { port: 0, stbd: 0 }, gone: false, aim: 1,
  get x() { return ship.state.x; }, get z() { return ship.state.z; }, get y() { return ship.state.y; },
  get heading() { return ship.state.heading; },
  get vx() { return Math.sin(ship.state.heading) * ship.state.speed; }, get vz() { return Math.cos(ship.state.heading) * ship.state.speed; },
  get size() { return ship.type.size; }, get top() { return ship.type.top; }, get guns() { return ship.guns; },
  get reloadTime() { return ship.type.reload * (hasReward('quickmatch') ? 0.8 : 1); }, get power() { return hasReward('longguns') ? 1.2 : 1; }, get hull() { return ship.state.hull; }, get sinking() { return ship.state.sinking; },
  hit(damage) {
    const s = ship.state;
    if (s.sinking || shore.state.active) return; // nobody fires on an empty ship at anchor
    s.hull = Math.max(0, s.hull - (damage * (hasReward('ironwood') ? 0.8 : 1)) / ship.type.hullMax);
    if (s.hull <= 0) { s.sinking = 0.001; audio.sink(); showToast('She is going down!'); }
  },
};
const targets = [me, ...vessels.list];
function refreshTargets() {
  targets.length = 0;
  targets.push(me, ...vessels.list);
}
const world = { player: me, eye: camera.position, ashore: false, wanted: false, fleetEnemy: null };

// ---- Your fleet: ships that sail in company with you -------------------------------
const MAX_FLEET = 3, WAGES = { sloop: 15, brig: 30, galleon: 60 }; // coins a day for each ship's crew
const shipValue = (id, hull) => Math.round((SHIP_TYPES[id].price || 240) * 0.5 * Math.max(0.3, hull)); // what a shipwright pays for her
// Keep the saved list in step with the ships actually afloat, and the hold with the fleet's size.
function syncFleet() {
  vessels.renumber();
  save.fleet = vessels.fleet().filter((v) => !v.sinking).map((v) => ({ type: v.typeId, hull: v.hull }));
  applyUpgrades();
  // If the fleet has shrunk, cargo that no longer fits is lost with her.
  let over = cargoCount() - save.hold;
  for (const id of Object.keys(save.cargo)) { const cut = Math.min(over, save.cargo[id]); if (cut > 0) { save.cargo[id] -= cut; over -= cut; } }
  persist();
}
function joinFleet(typeId, hull, at) {
  vessels.addFleet(typeId, hull, look, at);
  refreshTargets();
  syncFleet();
}
// Whoever your fleet should be fighting: a ship that is after you or them, or the one you last fired on.
function pickFleetEnemy(dt) {
  me.lastTargetFor = Math.max(0, (me.lastTargetFor || 0) - dt);
  let best = null, bd = 650;
  for (const v of vessels.list) {
    if (v.fleet || v.gone || v.sinking || v.struck) continue;
    const hostile = v.enemy === me || (v.enemy && v.enemy.fleet) || (v === me.lastTarget && me.lastTargetFor > 0);
    const d = Math.hypot(v.x - ship.state.x, v.z - ship.state.z);
    if (hostile && d < bd) { bd = d; best = v; }
  }
  world.fleetEnemy = shore.state.active ? null : best;
}
// Each morning the fleet's crews are paid. If the purse is short, the last ship to join sails away.
function payWages() {
  const fleet = vessels.fleet();
  if (!fleet.length) return;
  const due = fleet.reduce((a, v) => a + WAGES[v.typeId], 0);
  if (save.coins >= due) { save.coins -= due; showToast(`Fleet wages paid: ${due} coins`); }
  else { const v = fleet[fleet.length - 1]; vessels.remove(v); showToast(`You cannot pay the fleet. ${v.label} has left you.`); }
  persist();
}

// ---- Prizes: boarding a ship that has struck her colours ---------------------------
const mk = (tag, props, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
function prizeNearby() {
  const s = ship.state;
  if (Math.abs(s.speed) > 4.5) return null;
  return vessels.list.find((v) => v.struck && !v.gone && Math.hypot(v.x - s.x, v.z - s.z) < 60 + v.size.bow) || null;
}
function boardPrize(v) {
  const who = v.captain ? `${v.captain}’s ${v.type.name.toLowerCase()}` : 'the ' + v.label.toLowerCase();
  const sale = shipValue(ship.typeId, ship.state.hull), fits = cargoCount() <= v.type.hold + (save.upgrades.hold ? 10 : 0) + vessels.fleet().reduce((a, f) => a + f.type.hold, 0);
  // Taking her counts as beating her: bounty for a pirate, a darker name for an honest ship.
  const claim = () => {
    save.prizes++;
    if (v.faction === 'pirate') { save.piratesSunk++; save.bountyDue += v.bounty; const more = pirateDown(v); if (more) setTimeout(() => showToast(more.trim(), 9), 3500); } else addWanted(1, 1);
    v.struck = 0; v.gone = true; v.away = 90 + Math.random() * 60;
  };
  const row = (id, title, detail, button, enabled, run) => mk('div', { className: 'trade-row' },
    mk('div', { className: 'ship-info' }, mk('b', {}, title), mk('div', { className: 'muted' }, detail)),
    mk('button', { id, disabled: !enabled, onclick: () => { run(); audio.coin(); persist(); places.close(); } }, button));
  places.card('Boarding ' + who,
    mk('p', { className: 'muted' }, `Her crew stand with their hands open. She is a ${v.type.name.toLowerCase()}, hull at ${Math.round(v.hull * 100)}%, holding ${v.type.hold} crates.` + (v.faction === 'pirate' ? ` There is ${v.bounty} coins on her captain.` : ' Taking an honest ship will make you a wanted captain.')),
    row('prize-take', 'Take her as your ship', !fits ? 'Your cargo will not fit in her.' : ship.typeId === 'sloop' ? 'Your sloop is sent home to wait for you at the shipwright.' : `Your ${ship.type.name.toLowerCase()} is sent in and sold for ${sale} coins.`, 'Take her', fits, () => {
      const old = ship.typeId, at = { hull: Math.max(0.08, v.hull) };
      claim();
      if (old !== 'sloop') save.coins += sale;
      if (old !== v.typeId && old !== 'sloop') save.ships = save.ships.filter((id) => id !== old);
      setShip(v.typeId);
      ship.state.hull = at.hull;
      showToast(`You shift your flag to the ${v.type.name.toLowerCase()}.`);
    }),
    row('prize-fleet', 'Add her to your fleet', vessels.fleet().length >= MAX_FLEET ? `You already have ${MAX_FLEET} ships in company.` : v.hull < 0.1 ? 'She is too far gone to sail in company.' : `She follows you and fights at your side. Her crew want ${WAGES[v.typeId]} coins a day.`, 'Take her on', vessels.fleet().length < MAX_FLEET && v.hull >= 0.1, () => {
      claim();
      joinFleet(v.typeId, v.hull, { x: v.x, z: v.z, heading: v.heading });
      showToast(`The ${v.type.name.toLowerCase()} joins your fleet.`);
    }),
    row('prize-strip', 'Strip her and sink her', 'Take what she carries and send her to the bottom.', 'Strip her', true, () => { v.struck = 0; v.hit(99999, me); }),
    row('prize-free', 'Let her go', 'She makes what sail she can and leaves.', 'Let her go', true, () => { v.struck = 0; v.hull = Math.min(1, v.hull + 0.2); v.attacker = me; v.alarm = 120; v.provoked = 0; }));
}

// Word of a battle: when the navy and pirates are at each other within earshot, say where.
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
let battleQuiet = 20;
function listenForBattle(dt) {
  if ((battleQuiet -= dt) > 0 || shore.state.active) return;
  battleQuiet = 3;
  const s = ship.state;
  for (const v of vessels.list) {
    const e = v.enemy;
    if (v.faction !== 'navy' || v.gone || !e || e.faction !== 'pirate' || Math.hypot(v.x - e.x, v.z - e.z) > 260) continue;
    const d = Math.hypot(v.x - s.x, v.z - s.z);
    if (d < 150 || d > 1300) continue;
    const deg = ((Math.atan2(v.x - s.x, -(v.z - s.z)) * 180) / Math.PI + 360) % 360;
    showToast(`Gunfire to the ${COMPASS[Math.round(deg / 45) % 8]}: the navy is fighting pirates.`);
    battleQuiet = 150; // one notice per battle
    return;
  }
}

// Warnings: entering pirate waters, becoming wanted, and a tag over the nearest ship.
const fleetChip = document.getElementById('fleet-chip');
const wantedChip = document.getElementById('wanted'), vesselTag = document.getElementById('vessel-tag');
let inZone = null;
function updateDangers() {
  const s = ship.state, zone = zoneAt(s.x, s.z);
  // Once you have thinned out a lord's ships, they come out to meet you whenever you are in their waters.
  if (zone && !shore.state.active && !s.sinking) {
    const L = lordState(zone);
    if (!L.beaten && L.sunk >= LORD_AFTER && !vessels.list.some((v) => v.lord && v.zone === zone)) { inZone = zone; summonLord(zone); }
  }
  if (zone !== inZone) {
    if (zone) showToast('Pirate waters: ' + zone.name);
    else if (inZone) showToast('Clear of ' + inZone.name);
    inZone = zone;
  }
  const fleet = vessels.fleet();
  fleetChip.hidden = !fleet.length;
  if (fleet.length) { const t = 'Fleet: ' + fleet.map((v) => `${v.type.name.toLowerCase()} ${Math.round(v.hull * 100)}%`).join(' · '); if (fleetChip.textContent !== t) fleetChip.textContent = t; }
  wantedChip.hidden = !isWanted();
  if (isWanted()) wantedChip.textContent = 'Wanted ' + '★'.repeat(Math.floor(wanted()));
  // Name the nearest ship, and show how she is faring.
  let near = null, nd = 380;
  if (!shore.state.active) for (const v of vessels.list) { if (v.gone) continue; const d = Math.hypot(v.x - s.x, v.z - s.z); if (d < nd) { nd = d; near = v; } }
  if (near) {
    vPos.set(near.x, near.y + near.top + 6, near.z).project(camera);
    vesselTag.hidden = vPos.z > 1 || Math.abs(vPos.x) > 1.05 || Math.abs(vPos.y) > 1.05;
    const who = near.captain ? `${near.captain} · ${near.label.toLowerCase()}` : near.label;
    const text = near.struck ? who + ' · colours struck' : near.sinking ? who + ' · sinking' : who + (near.hull < 0.995 ? ` · hull ${Math.round(near.hull * 100)}%` : '');
    if (vesselTag.textContent !== text) vesselTag.textContent = text;
    vesselTag.classList.toggle('foe', near.enemy === me);
    vesselTag.style.transform = `translate(-50%, -100%) translate(${((vPos.x + 1) / 2) * window.innerWidth}px, ${((1 - vPos.y) / 2) * window.innerHeight}px)`;
  } else vesselTag.hidden = true;
}
function fire(side) {
  if (shore.state.active || !help.hidden) return;
  combat.fire(me, side, targets.filter((t) => !t.fleet)); // the gun crews never lay on your own ships
}
const firePort = document.getElementById('btn-fire-port'), fireStbd = document.getElementById('btn-fire-stbd');
firePort.addEventListener('click', () => fire(1));
fireStbd.addEventListener('click', () => fire(-1));
const hullFill = document.getElementById('hull-fill');
const HOME = { x: 150, z: -385 }; // the anchorage off Port Marigold, where a sunk captain washes up

// The ship has gone down: cargo and ship are lost, and you start again from port in a sloop.
function lostAtSea() {
  const s = ship.state, lost = ship.type.name.toLowerCase(), wasSloop = ship.typeId === 'sloop';
  const crates = Object.values(save.cargo).reduce((a, n) => a + n, 0);
  save.cargo = {};
  jobs.loseFreight(); // freight you were carrying for a tavern went down with her
  if (!wasSloop) save.ships = save.ships.filter((id) => id !== ship.typeId);
  const next = vessels.fleet().find((v) => !v.sinking);
  if (next) {
    // With a fleet, you are picked up by your next ship and carry on from where she lies.
    const at = { x: next.x, z: next.z, heading: next.heading, hull: next.hull };
    vessels.remove(next);
    setShip(next.typeId);
    Object.assign(s, { ...at, speed: 0, sail: 0.3, anchorDown: false, anchorDepth: 0, sinking: 0, roll: 0, pitch: 0 });
    anchorBtn.setAttribute('aria-pressed', 'false');
    first = true;
    saveGame();
    places.show('Your flagship is lost', [`Your ${lost} is gone` + (crates ? `, and ${crates} crates of cargo with her.` : '.'), `A boat from your ${next.type.name.toLowerCase()} pulls you from the water. She is your flagship now.`]);
    return;
  }
  setShip('sloop');
  Object.assign(s, { x: HOME.x, z: HOME.z, heading: Math.PI, speed: 0, sail: 0, anchorDown: true, anchorDepth: 1, hull: 1, sinking: 0, roll: 0, pitch: 0 });
  anchorBtn.setAttribute('aria-pressed', 'true');
  cam.deck = false;
  viewBtn.setAttribute('aria-expanded', 'false');
  first = true;
  saveGame();
  places.show('Lost at sea', [
    `Your ${lost} is gone` + (crates ? `, and ${crates} crates of cargo with her.` : '.'),
    'Fishermen pulled you from the water and brought you in to Port Marigold.',
    wasSloop ? 'The shipwright has found you another sloop. Your purse is untouched.' : `There is a sloop waiting for you. Your purse${save.ships.length > 1 ? ' and your other ships are' : ' is'} untouched.`,
  ]);
}

// Deckhands, standing by the guns. Purely for show.
const crew = Array.from({ length: 5 }, (_, i) => {
  const c = buildPerson({ shirt: [0xd98a5a, 0x7fb5c9, 0xe8c648, 0xc9605a, 0x8fbf7a][i], trousers: 0x5a4a3a, skin: [0xb5774f, 0xd9a47a, 0x8a5a3c, 0xe8c09a, 0xb5774f][i], hair: 0x2a1d14, hat: i % 2 ? 'scarf' : 'none', scarf: 0xd9453c, scale: 1 });
  ship.root.add(c.group);
  return c;
});
function placeCrew(time) {
  const spots = ship.crewSpots;
  crew.forEach((c, i) => {
    c.group.visible = i < spots.length;
    if (!c.group.visible) return;
    c.group.position.copy(spots[i]);
    c.group.rotation.y = (i % 2 ? -1 : 1) * Math.PI / 2 + Math.sin(time * 0.3 + i * 2) * 0.5; // looking out over the rail
    c.arms[0].rotation.x = c.arms[1].rotation.x = Math.sin(time * 0.9 + i) * 0.12;
  });
}

const captain = buildPerson({ shirt: 0xf3efe2, trousers: 0x2c3f63, skin: 0xd9a47a, hat: 'straw', sash: 0xd9453c, scale: 1.1 });
ship.root.add(captain.group);
applyPaint(ship.root);
const people = createPeople();
const finds = createFinds();
const treasure = createTreasure();
scene.add(people.group, finds.group, treasure.group);
applyPaint(scene);

// Foam wake: small white patches that lie on the water, spread out and fade.
const WAKE_N = 160;
const wake = new THREE.InstancedMesh(
  new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
  WAKE_N
);
wake.frustumCulled = false;
scene.add(wake);
const puffs = Array.from({ length: WAKE_N }, () => ({ x: 0, z: 0, vx: 0, vz: 0, age: 99, life: 1, size: 1 }));
let puffNext = 0, puffTimer = 0;
// Drop a patch of foam on the water (used by dolphins and fish as well as the wake).
function foamAt(x, z, size) {
  Object.assign(puffs[puffNext++ % WAKE_N], { x, z, vx: 0, vz: 0, age: 0, life: 2.2, size });
}
const mtx = new THREE.Matrix4(), qTilt = new THREE.Quaternion(), vPos = new THREE.Vector3(), vScl = new THREE.Vector3();
const vUp = new THREE.Vector3(0, 1, 0), vNrm = new THREE.Vector3();
function updateWake(dt, time) {
  const s = ship.state;
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  puffTimer -= dt;
  while (s.speed > 0.8 && puffTimer <= 0) {
    puffTimer += 0.32 / (s.speed + 1);
    const atBow = Math.random() < 0.4;
    const side = Math.random() < 0.5 ? -1 : 1;
    const along = atBow ? s.bow * 0.75 + Math.random() * 1.5 : s.stern - 1.3;
    const off = atBow ? side * (s.halfBeam * 0.5 + Math.random() * 0.5) : (Math.random() - 0.5) * s.halfBeam;
    const p = puffs[puffNext++ % WAKE_N];
    p.x = s.x + fx * along + fz * off;
    p.z = s.z + fz * along - fx * off;
    // Bow foam peels away to each side; stern foam is left behind.
    const push = atBow ? side * 0.22 * s.speed : (Math.random() - 0.5) * 0.3;
    p.vx = fz * push;
    p.vz = -fx * push;
    p.age = 0;
    p.life = 2.5 + Math.random() * 2.5;
    p.size = (0.3 + Math.random() * 0.35) * Math.min(1.3, 0.5 + s.speed / 7);
  }
  puffs.forEach((p, i) => {
    p.age += dt;
    const k = p.age / p.life;
    if (k >= 1) {
      wake.setMatrixAt(i, mtx.makeScale(0, 0, 0));
      return;
    }
    const slow = Math.exp(-p.age * 1.2);
    p.x += p.vx * slow * dt;
    p.z += p.vz * slow * dt;
    const scale = p.size * (0.7 + 2.4 * k) * (k > 0.5 ? (1 - k) / 0.5 : 1);
    const h = waveHeight(waves, p.x, p.z, time);
    vNrm.set(h - waveHeight(waves, p.x + 1, p.z, time), 1, h - waveHeight(waves, p.x, p.z + 1, time)).normalize();
    qTilt.setFromUnitVectors(vUp, vNrm);
    wake.setMatrixAt(i, mtx.compose(vPos.set(p.x, h + 0.07, p.z), qTilt, vScl.set(scale, 1, scale)));
  });
  wake.instanceMatrix.needsUpdate = true;
}

// ---- Light, sky and sea colours follow the clock and the weather ----------------
function applyEnvironment(dt) {
  sun.color.copy(env.light);
  sun.intensity = env.lightIntensity;
  hemi.color.copy(env.hemiSky);
  hemi.groundColor.copy(env.hemiGround);
  hemi.intensity = env.hemi * (1 - 0.25 * env.overcast);
  scene.fog.color.copy(env.horizon);
  scene.fog.near = env.fogNear;
  scene.fog.far = env.fogFar;
  wake.material.color.copy(env.foam);
  ship.lanternLight.intensity = env.night * 10;
  const lit = env.night > 0.35;
  for (const l of nightLights) {
    if (l.isLight) l.intensity = env.night * 900;
    else l.visible = lit;
  }
  sun.position.copy(ship.root.position).addScaledVector(env.lightDir, 200);
  sun.target.position.copy(ship.root.position);
}

// ---- Ship look and upgrades (changed at a shipwright) ----------------------------
const look = { hull: SHIP_COLORS.hull, trim: SHIP_COLORS.trim, sail: SHIP_COLORS.sail, flag: SHIP_COLORS.flag, pattern: 'plain' };
try {
  const stored = JSON.parse(localStorage.getItem('tradewind-look') || '{}');
  for (const k in look) if (ALL_LOOK_VALUES[k].includes(stored[k])) look[k] = stored[k];
} catch {}
function applyLook() {
  ship.setLook(look);
  vessels.repaintFleet(look);
  try { localStorage.setItem('tradewind-look', JSON.stringify(look)); } catch {}
}
function applyUpgrades() {
  save.hold = ship.type.hold + (save.upgrades.hold ? 10 : 0) + vessels.fleet().reduce((a, v) => a + (v.sinking ? 0 : v.type.hold), 0); // the fleet's holds count too
  ship.state.speedBonus = (save.upgrades.sails ? 1.1 : 1) * (hasReward('stormrig') ? 1.06 : 1);
  ship.state.turnBonus = hasReward('copper') ? 1.15 : 1; // earned fittings: see rewards.js
}
// Change to another kind of ship you own (done at a shipwright).
function setShip(id) {
  ship.setType(id);
  save.shipType = ship.typeId;
  if (!save.ships.includes(ship.typeId)) save.ships.push(ship.typeId);
  applyUpgrades();
  cam.sailDist = ship.type.cam.dist;
  if (!shore.state.active) cam.dist = ship.type.cam.dist;
  persist();
}
ship.setType(save.ships.includes(save.shipType) ? save.shipType : 'sloop');
// Bring back the fleet you had, lying just astern.
save.fleet.slice(0, MAX_FLEET).forEach((f, i) => { if (SHIP_TYPES[f.type]) vessels.addFleet(f.type, f.hull > 0 ? f.hull : 1, look, { x: ship.state.x + 40 * (i % 2 ? -1 : 1), z: ship.state.z + 50 + 30 * i, heading: ship.state.heading }); });
refreshTargets();
applyLook();
applyUpgrades();

// ---- Time and weather buttons (for previewing; both also change on their own) ---
function skipTime() {
  env.skip += 3;
  showToast('Three hours pass');
}
function cycleWeather() {
  env.forced = env.forced + 1 >= WEATHERS.length ? -1 : env.forced + 1;
  if (env.forced < 0) env.hold = 0;
  showToast(env.forced < 0 ? 'Weather: changing on its own' : 'Weather: ' + WEATHERS[env.forced].name);
}
// Temporary, for trying things out: step through the three ships without buying them.
// It does not change what you own; reloading the page puts you back in your own ship.
function tryNextShip() {
  const ids = Object.keys(SHIP_TYPES);
  ship.setType(ids[(ids.indexOf(ship.typeId) + 1) % ids.length]);
  applyUpgrades();
  cam.sailDist = ship.type.cam.dist;
  if (!shore.state.active) cam.dist = ship.type.cam.dist;
  showToast('Trying the ' + ship.type.name.toLowerCase());
}

// Swap between the view from astern and the view from the wheel.
const viewBtn = document.getElementById('tool-view');
function toggleView() {
  cam.deck = !cam.deck;
  cam.lookYaw = 0;
  cam.lookPitch = 0;
  viewBtn.setAttribute('aria-expanded', String(cam.deck));
  showToast(cam.deck ? 'At the wheel' : 'View from astern');
}
viewBtn.addEventListener('click', toggleView);

// ---- Sound ------------------------------------------------------------------------
const audio = createAudio();
function cycleSound() {
  audio.start();
  showToast('Sound: ' + MODE_LABELS[audio.cycleMode()]);
}
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio.start());
document.addEventListener('visibilitychange', () => {
  audio.pause(document.hidden || paused);
  if (document.hidden) saveGame();
});
window.addEventListener('pagehide', saveGame);

// ---- Ports: going ashore, visiting places, the chart ------------------------------
const places = createPlaces({ look, applyLook, applyUpgrades, audio, toast: (t, secs) => showToast(t, secs), ship, setShip, treasure, vessels, shipValue, syncFleet, wages: WAGES });
const chart = createChart();
const chartBtn = document.getElementById('tool-chart');
// Treasure maps are kept with the chart. Each opens as a card you can study.
const mapList = document.getElementById('chart-maps');
function listMaps() {
  mapList.replaceChildren(...save.maps.map((m, i) => {
    const b = Object.assign(document.createElement('button'), { className: 'close', id: 'map-' + i, textContent: treasure.tierName(m) });
    b.addEventListener('click', () => { if (chart.isOpen) toggleChart(); openMap(m); });
    return b;
  }));
}
function openMap(m) {
  const canvas = Object.assign(document.createElement('canvas'), { className: 'treasure-map' });
  canvas.setAttribute('aria-label', 'A hand-drawn map of an unnamed island with an X marked on it');
  const here = shore.state.active && shore.state.island.name === m.island;
  treasure.draw(canvas, m, here ? shore.state : null);
  const note = Object.assign(document.createElement('p'), { className: 'muted', textContent: here ? 'You know this shore. The dark dot is where you stand; dig at the X.' : 'No name, only a shape. Find the island that matches, go ashore, and dig at the X.' });
  places.card(treasure.tierName(m), canvas, note);
}
// Dig where you stand.
function dig() {
  const result = treasure.dig(shore.state);
  audio.dig();
  if (result.found) {
    audio.coin();
    setTimeout(() => audio.coin(), 180);
    places.show('Buried treasure', ['Your spade strikes wood.', `An iron-bound chest, and inside it ${result.found.coins} coins. Your purse now holds ${save.coins}.`]);
  } else showToast(result.warm ? 'Nothing here, but the map says you are close.' : 'Nothing but sand.');
}
function toggleChart() {
  listMaps();
  chartBtn.setAttribute('aria-expanded', String(chart.toggle(ship.state, wind, vessels.list)));
}
chartBtn.addEventListener('click', toggleChart);
document.getElementById('chart-close').addEventListener('click', toggleChart);

function goAshore(isl, useDock) {
  shore.land(isl, ship.state, useDock);
  document.body.classList.add('ashore');
  setPadLabels('Walk');
  cam.sailDist = cam.dist;
  cam.dist = 11;
  cam.follow = shore.state.heading;
  cam.yaw = 0;
  cam.pitch = 0.3;
  if (useDock && !save.visited.includes(isl.name)) { save.visited.push(isl.name); persist(); }
  showToast('Ashore at ' + isl.name);
}
function backToShip() {
  places.close();
  shore.leave();
  document.body.classList.remove('ashore');
  setPadLabels('Steer · Sails');
  cam.dist = cam.sailDist || ship.type.cam.dist;
  cam.yaw = 0.5;
  cam.pitch = 0.24;
  showToast('Back aboard');
}

// The one thing you can do right now, shown on the big button (and the E key).
const stickHint = document.getElementById('stick-hint');
const setPadLabels = (text) => (stickHint.textContent = text);
const KEEPER_ACTIONS = { tavern: 'Have a drink with ', market: 'Trade with ', shipwright: 'Talk ships with ' };
const actionBtn = document.getElementById('action');
let action = null, portNearby = null, beachNearby = null;

// Look at a curiosity: the first time, it goes in the logbook.
function lookAt(f) {
  const isNew = finds.discover(f);
  if (f.kind.ring) audio.bell();
  if (isNew && f.kind.coins) audio.coin();
  places.show(f.kind.name, isNew ? [...f.kind.text, `Noted in your logbook: ${save.finds.length} of ${finds.total} curiosities found.`] : f.kind.text.slice(0, 1));
}
function findAction() {
  const s = ship.state;
  if (places.isOpen) return null;
  if (shore.state.active) {
    const w = shore.state;
    for (const p of w.island.portInfo ? w.island.portInfo.places : []) {
      if (Math.hypot(w.x - p.doorX, w.z - p.doorZ) < 4.5 || Math.hypot(w.x - p.keeperX, w.z - p.keeperZ) < 3.6) return { label: KEEPER_ACTIONS[p.kind] + p.keeperName, run: () => places.open(w.island, p.kind) };
    }
    const someone = people.nearby(w);
    if (someone) return { label: someone.kind === 'fisher' ? 'Ask about the fishing' : 'Say hello', run: () => showToast('“' + people.greet(someone, env) + '”') };
    const f = finds.on(w.island);
    if (Math.hypot(w.x - f.x, w.z - f.z) < 4.2) return { label: f.kind.verb, run: () => lookAt(f) };
    if (shore.atDinghy()) return { label: 'Row back to the ship', run: backToShip };
    return save.maps.length ? { label: 'Dig here', run: dig } : null;
  }
  const prize = prizeNearby();
  if (prize) return { label: 'Board the ' + prize.label.toLowerCase(), run: () => boardPrize(prize) };
  portNearby = ISLANDS.find((isl) => isl.portInfo && Math.hypot(s.x - isl.dock.x, s.z - isl.dock.z) < 110) || null;
  // Any island's beach will do if there is no dock nearby.
  beachNearby = portNearby ? null : ISLANDS.find((isl) => {
    return coastAt(isl, s.x, s.z) > Math.max(-0.99, -110 / isl.R); // close in to her shore (or inside her lagoon)
  }) || null;
  const ready = s.anchorDepth > 0.9 && Math.abs(s.speed) < 1;
  if (portNearby && ready) return { label: 'Go ashore at ' + portNearby.name, run: () => goAshore(portNearby, true) };
  if (beachNearby && ready) return { label: 'Row to the beach at ' + beachNearby.name, run: () => goAshore(beachNearby, false) };
  return null;
}
function doAction() {
  if (action) action.run();
}
actionBtn.addEventListener('click', doAction);

// Name tags that float over the places you can visit.
const labelBox = document.getElementById('labels');
const findLabel = labelBox.appendChild(Object.assign(document.createElement('div'), { className: 'place-label', hidden: true }));
const labelEls = ['Tavern', 'Shipwright', 'Market'].map((t) => labelBox.appendChild(Object.assign(document.createElement('div'), { className: 'place-label', textContent: t, hidden: true })));
function updateLabels() {
  const w = shore.state;
  // A tag over the island's curiosity once you are fairly near it: a question mark until you have looked.
  const f = w.active && !places.isOpen ? finds.on(w.island) : null;
  if (f && Math.hypot(w.x - f.x, w.z - f.z) < 90) {
    vPos.set(f.x, f.y, f.z).project(camera);
    findLabel.hidden = vPos.z > 1 || Math.abs(vPos.x) > 1.1 || Math.abs(vPos.y) > 1.1;
    findLabel.textContent = finds.isFound(f) ? f.kind.name : '?';
    findLabel.style.transform = `translate(-50%, -100%) translate(${((vPos.x + 1) / 2) * window.innerWidth}px, ${((1 - vPos.y) / 2) * window.innerHeight}px)`;
  } else findLabel.hidden = true;
  labelEls.forEach((elm, i) => {
    const p = w.active && !places.isOpen && w.island.portInfo ? w.island.portInfo.places.find((x) => x.label === elm.textContent) : null;
    if (!p) { elm.hidden = true; return; }
    vPos.set(p.x, p.y, p.z).project(camera);
    elm.hidden = vPos.z > 1 || Math.abs(vPos.x) > 1.1 || Math.abs(vPos.y) > 1.1;
    elm.style.transform = `translate(-50%, -100%) translate(${((vPos.x + 1) / 2) * window.innerWidth}px, ${((1 - vPos.y) / 2) * window.innerHeight}px)`;
  });
}

// ---- The compass: a strip across the top that slides as you turn --------------------
const compassEl = document.getElementById('compass'), compassBand = document.getElementById('compass-band'), compassBtn = document.getElementById('tool-compass');
const DEG = 2.4; // pixels per degree on the strip
// Three turns of the card laid side by side, so it can slide without ever running out.
for (let d = -360; d < 720; d += 15) {
  const at = ((d % 360) + 360) % 360;
  const tick = document.createElement('i');
  tick.style.left = d * DEG + 'px';
  compassBand.append(tick);
  if (at % 45 === 0) compassBand.append(Object.assign(document.createElement('span'), { textContent: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][at / 45], className: at === 0 ? 'north' : at % 90 ? 'minor' : '', style: `left:${d * DEG}px` }));
}
let compassOn = false;
try { compassOn = localStorage.getItem('tradewind-compass') === '1'; } catch {}
function showCompass() {
  compassEl.hidden = !compassOn;
  compassBtn.setAttribute('aria-expanded', String(compassOn));
  document.body.classList.toggle('compass-on', compassOn);
}
function toggleCompass() {
  compassOn = !compassOn;
  try { localStorage.setItem('tradewind-compass', compassOn ? '1' : '0'); } catch {}
  showCompass();
}
compassBtn.addEventListener('click', toggleCompass);
showCompass();
// The compass reads the way you are looking: the ship's head at sea, your own gaze ashore or at the wheel.
function updateCompass() {
  if (!compassOn) return;
  const w = shore.state;
  const facing = w.active ? cam.follow + cam.yaw : cam.deck ? ship.state.heading - cam.lookYaw : ship.state.heading;
  const deg = ((Math.atan2(Math.sin(facing), -Math.cos(facing)) * 180) / Math.PI + 360) % 360;
  compassBand.style.transform = `translateX(${(-deg * DEG).toFixed(1)}px)`;
}

// ---- Controls --------------------------------------------------------------------
const held = { left: false, right: false, up: false, down: false };
const KEYS = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };
const anchorBtn = document.getElementById('btn-anchor');
function toggleAnchor() {
  if (shore.state.active) return;
  ship.state.anchorDown = !ship.state.anchorDown;
  audio.anchor(ship.state.anchorDown);
  anchorBtn.setAttribute('aria-pressed', String(ship.state.anchorDown));
  showToast(ship.state.anchorDown ? 'Anchor away' : 'Anchor aweigh');
}
window.addEventListener('keydown', (e) => {
  if (paused && help.hidden) { // while paused, only Escape or Enter do anything: they resume
    if (e.code === 'Escape' || e.code === 'Enter') setPaused(false);
    e.preventDefault();
    return;
  }
  if (KEYS[e.code]) { held[KEYS[e.code]] = true; e.preventDefault(); }
  else if (e.code === 'Space' && !e.repeat) { toggleAnchor(); e.preventDefault(); }
  else if (e.code === 'KeyT') skipTime();
  else if (e.code === 'KeyR') cycleWeather();
  else if (e.code === 'KeyN') cycleSound();
  else if (e.code === 'KeyM') toggleChart();
  else if (e.code === 'KeyC') toggleCompass();
  else if (e.code === 'KeyV') toggleView();
  else if (e.code === 'Digit1' && !e.repeat) fire(1);
  else if (e.code === 'Digit2' && !e.repeat) fire(-1);
  else if (e.code === 'KeyB') tryNextShip();
  else if (e.code === 'KeyE' && !e.repeat) doAction();
  else if (e.code === 'Enter' || e.code === 'Escape') {
    if (!help.hidden) closeHelp();
    else if (places.isOpen) places.close();
    else if (chart.isOpen) toggleChart();
    else if (e.code === 'Enter') doAction();
    else setPaused(true); // Escape with nothing open: the pause menu
  }
});
window.addEventListener('keyup', (e) => { if (KEYS[e.code]) held[KEYS[e.code]] = false; });
window.addEventListener('blur', () => { for (const k in held) held[k] = false; dropStick(); });
// The joystick. Its position is a push from -1 to 1 each way; the keys count as a full push.
const stick = { x: 0, y: 0 };
const stickEl = document.getElementById('stick'), knob = document.getElementById('stick-knob');
function moveStick(e) {
  const r = stickEl.getBoundingClientRect(), reach = r.width * 0.36;
  let dx = (e.clientX - (r.left + r.width / 2)) / reach, dy = (e.clientY - (r.top + r.height / 2)) / reach;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  knob.style.transform = `translate(${dx * reach}px, ${dy * reach}px)`;
  const dead = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84); // a small dead spot in the middle
  stick.x = dead(dx);
  stick.y = dead(-dy);
}
function dropStick() {
  stick.x = stick.y = 0;
  knob.style.transform = '';
}
stickEl.addEventListener('pointerdown', (e) => { e.preventDefault(); stickEl.setPointerCapture(e.pointerId); moveStick(e); });
stickEl.addEventListener('pointermove', (e) => { if (stickEl.hasPointerCapture(e.pointerId)) moveStick(e); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) stickEl.addEventListener(ev, dropStick);
stickEl.addEventListener('contextmenu', (e) => e.preventDefault());
// Stick and keys together: x is right (+) or left (-), y is up (+) or down (-).
const push = { x: 0, y: 0 };
function readPush() {
  push.x = THREE.MathUtils.clamp(stick.x + (held.right ? 1 : 0) - (held.left ? 1 : 0), -1, 1);
  push.y = THREE.MathUtils.clamp(stick.y + (held.up ? 1 : 0) - (held.down ? 1 : 0), -1, 1);
}
const walkMove = { x: 0, z: 0 };
anchorBtn.addEventListener('click', toggleAnchor);
anchorBtn.setAttribute('aria-pressed', String(ship.state.anchorDown));

const help = document.getElementById('help');
function closeHelp() { help.hidden = true; pauseEl.hidden = !paused; } // if opened from the pause menu, go back to it

// ---- Pause: Escape (or the II button) stops the game until you resume ---------------
const pauseEl = document.getElementById('pause'), pauseSound = document.getElementById('pause-sound');
let paused = false;
function setPaused(on) {
  paused = on;
  pauseEl.hidden = !on;
  audio.pause(on);
  if (on) {
    for (const k in held) held[k] = false;
    dropStick();
    saveGame();
    pauseSound.textContent = 'Sound: ' + MODE_LABELS[audio.mode];
    pauseNote.textContent = '';
  }
}
document.getElementById('pausebtn').addEventListener('click', () => setPaused(true));
document.getElementById('pause-resume').addEventListener('click', () => setPaused(false));
document.getElementById('pause-map').addEventListener('click', () => { setPaused(false); if (!chart.isOpen) toggleChart(); });
document.getElementById('pause-help').addEventListener('click', () => { pauseEl.hidden = true; help.hidden = false; });
pauseSound.addEventListener('click', () => { cycleSound(); audio.pause(true); pauseSound.textContent = 'Sound: ' + MODE_LABELS[audio.mode]; });
// The testing tools live here too. Each says what it did on the line underneath.
const pauseNote = document.getElementById('pause-note');
for (const [id, run] of [['pause-ship', tryNextShip], ['pause-time', skipTime], ['pause-weather', cycleWeather]]) {
  document.getElementById(id).addEventListener('click', () => { run(); pauseNote.textContent = toast.textContent + (id === 'pause-time' ? ' when you resume' : ''); });
}
document.getElementById('help-go').addEventListener('click', closeHelp);
if (save.distance > 100) document.getElementById('help-go').textContent = 'Continue your voyage';

// Starting over wipes saved progress; the button asks twice because browsers' own pop-ups are not available here.
// There are two such buttons: Reset in the top bar, and "Start a new voyage" in the logbook.
function resetButton(btn, sureText) {
  const idle = btn.textContent;
  btn.addEventListener('click', () => {
    if (btn.dataset.sure) {
      wipe();
      location.reload();
    } else {
      btn.dataset.sure = '1';
      btn.textContent = sureText;
      setTimeout(() => { delete btn.dataset.sure; btn.textContent = idle; }, 5000);
    }
  });
}
resetButton(document.getElementById('new-voyage'), 'Really start over? Coins, cargo and chart will be lost');
resetButton(document.getElementById('tool-reset'), 'Erase everything?');
document.getElementById('helpbtn').addEventListener('click', () => { help.hidden = !help.hidden; });

// ---- Camera: follows behind the ship; drag to look around, scroll or pinch to zoom
const cam = { yaw: 0.5, pitch: 0.24, dist: ship.type.cam.dist, follow: Math.PI, target: new THREE.Vector3(), lastDrag: -10, deck: false, lookYaw: 0, lookPitch: 0 };
const clampZoom = (d) => (shore.state.active ? THREE.MathUtils.clamp(d, 4, 45) : THREE.MathUtils.clamp(d, ship.type.cam.min, 160));
const pointers = new Map();
let pinch = 0;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 1 && cam.deck && !shore.state.active) { // at the wheel, dragging turns your head
    cam.lookYaw = THREE.MathUtils.clamp(cam.lookYaw + (e.clientX - p.x) * 0.005, -2.6, 2.6);
    cam.lookPitch = THREE.MathUtils.clamp(cam.lookPitch + (e.clientY - p.y) * 0.004, -0.7, 0.9);
  } else if (pointers.size === 1) {
    cam.yaw -= (e.clientX - p.x) * 0.006;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - p.y) * 0.004, 0.04, 1.3);
  }
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) cam.dist = clampZoom(cam.dist * (pinch / d));
    pinch = d;
  }
});
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, (e) => { pointers.delete(e.pointerId); pinch = 0; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = clampZoom(cam.dist * Math.exp(e.deltaY * 0.0012)); }, { passive: false });

const eye = new THREE.Vector3(), shipUp = new THREE.Vector3(), worldUp = new THREE.Vector3(0, 1, 0);
function updateCamera(dt, time, snap) {
  const s = ship.state, w = shore.state;
  if (cam.deck && !w.active) {
    // Standing at the wheel: the camera rides with the ship, softened a little so the horizon does not lurch.
    ship.root.updateMatrixWorld();
    eye.copy(ship.helm).applyMatrix4(ship.root.matrixWorld);
    shipUp.set(0, 1, 0).transformDirection(ship.root.matrixWorld);
    camera.up.copy(worldUp).lerp(shipUp, 0.55).normalize();
    const yaw = s.heading - cam.lookYaw, cp = Math.cos(cam.lookPitch);
    camera.position.copy(eye);
    camera.lookAt(eye.x + Math.sin(yaw) * cp, eye.y - Math.sin(cam.lookPitch), eye.z + Math.cos(yaw) * cp);
    cam.follow = s.heading;
    cam.target.set(s.x, ship.type.cam.height, s.z);
    if (camera.near !== 0.35) { camera.near = 0.35; camera.updateProjectionMatrix(); }
    return;
  }
  camera.up.copy(worldUp);
  if (camera.near !== 1) { camera.near = 1; camera.updateProjectionMatrix(); }
  if (w.active) {
    // Ashore the view swings round as you push left or right, so one stick both walks and turns.
    if (!places.isOpen) cam.follow -= push.x * 1.5 * dt;
  } else {
    // At sea, ease the camera round to stay behind the ship as she turns.
    let diff = s.heading - cam.follow;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    cam.follow += diff * (snap ? 1 : Math.min(1, dt * 1.2));
  }
  if (w.active) vPos.set(w.x, w.y + 1.9, w.z);
  else vPos.set(s.x, ship.type.cam.height + s.y * 0.4, s.z);
  cam.target.lerp(vPos, snap ? 1 : Math.min(1, dt * 6));
  const yaw = cam.follow + Math.PI + cam.yaw;
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.target.x + Math.sin(yaw) * cp * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(yaw) * cp * cam.dist);
  // Keep the camera above both the waves and the land.
  const floor = Math.max(waveHeight(waves, camera.position.x, camera.position.z, time) + 1.2, terrainHeight(camera.position.x, camera.position.z) + 1.2);
  if (camera.position.y < floor) camera.position.y = floor;
  camera.lookAt(cam.target);
}

// ---- On-screen display -----------------------------------------------------------
const el = (id) => document.getElementById(id);
const gSpeed = el('g-speed'), gHeading = el('g-heading'), gSail = el('g-sail'), gWind = el('g-wind'), gWindName = el('g-windname'), gTime = el('g-time');
const dialWind = el('dial-wind'), toast = el('toast'), hint = el('hint');
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
let toastTimer = 0;
function showToast(text, seconds = 3.2) {
  toast.textContent = text;
  toast.classList.add('show');
  toastTimer = seconds;
}
let nearName = null, wedgeFor = null;
const dialWedge = document.getElementById('dial-wedge');
function updateHud(dt) {
  const s = ship.state;
  gSpeed.textContent = Math.max(0, ship.knots).toFixed(1);
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  const deg = (THREE.MathUtils.radToDeg(Math.atan2(fx, -fz)) + 360) % 360;
  gHeading.textContent = POINTS[Math.round(deg / 45) % 8] + ' ' + String(Math.round(deg) % 360).padStart(3, '0') + '°';
  gSail.textContent = Math.round(s.sail * 100);
  gWind.textContent = Math.round(wind.speed);
  gTime.textContent = env.clock();
  const name = env.windName();
  if (name !== gWindName.textContent) {
    if (gWindName.textContent !== 'Wind') showToast(name === 'Gale' ? 'A gale is blowing in' : name === 'Light air' ? 'The wind is dying away' : name);
    gWindName.textContent = name;
  }
  // The red wedge on the dial is as wide as this ship's dead zone (square-riggers need more room).
  if (wedgeFor !== ship.typeId) {
    wedgeFor = ship.typeId;
    const a = ((NO_GO + ship.type.pointing) * Math.PI) / 180, x = (44 * Math.sin(a)).toFixed(1), y = (-44 * Math.cos(a)).toFixed(1);
    dialWedge.setAttribute('d', `M0 0 L-${x} ${y} A44 44 0 0 1 ${x} ${y} Z`);
  }
  dialWind.setAttribute('transform', `rotate(${THREE.MathUtils.radToDeg(s.relWind).toFixed(1)})`);

  let text = '', warn = false;
  if (shore.state.active) text = !action && !places.isOpen && shore.state.onWood && shore.state.island.portInfo ? 'Walk up into the village to find the tavern, shipwright and market.' : '';
  else if (s.sinking) { text = 'She is lost. Abandon ship!'; warn = true; }
  else if (s.aground) { text = 'Shallow water. Steer back out to sea.'; warn = true; }
  else if (s.anchorDepth > 0.9) text = action ? '' : s.sail > 0.15 ? 'At anchor. Weigh anchor to get under way.' : 'Riding at anchor.';
  else if ((portNearby || beachNearby) && s.speed < 6) text = 'Drop anchor here to go ashore at ' + (portNearby || beachNearby).name + '.';
  else if (s.inIrons) { text = 'Pointing into the wind. Turn away until the sails fill.'; warn = true; }
  else if (s.eff < 0.6 && s.sail > 0.25 && s.anchorDepth < 0.1) text = 'Close to the wind, so slow. Steer a little further off it, and zig-zag toward where you are going.';
  else if (s.sail < 0.05 && s.speed < 0.6) text = 'Raise the sails to get under way.';
  else if (wind.speed > 25 && s.sail > 0.75) text = 'Blowing hard. Lower some sail for a steadier ride.';
  hint.textContent = text || hint.textContent;
  hint.classList.toggle('show', !!text);
  hint.classList.toggle('warn', warn);

  if (toastTimer > 0 && (toastTimer -= dt) <= 0) toast.classList.remove('show');
  let found = null;
  for (const isl of ISLANDS) {
    const d = Math.hypot(s.x - isl.x, s.z - isl.z);
    if (d < isl.span * 1.5 + 90) found = isl.name;
  }
  if (found && found !== nearName && !shore.state.active) showToast(found);
  if (found && !save.discovered.includes(found)) {
    save.discovered.push(found);
    save.rumoured = save.rumoured.filter((n) => n !== found);
    persist();
  }
  nearName = found;
}

// ---- Game loop -------------------------------------------------------------------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 68 : 55; // wider view when held upright on a phone
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let time = 0, first = true, lastHour = env.hour, saveTimer = 15;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  // Paused: nothing moves. The picture is still drawn so the screen does not go blank.
  if (paused) { renderer.render(scene, camera); requestAnimationFrame(frame); return; }
  time += dt;
  env.update(dt, time);
  updateWind(time);
  const ashore = shore.state.active;
  // On foot the same keys walk the sailor, and the ship rides quietly at anchor.
  readPush();
  const sunk = ship.state.sinking > 0;
  const input = ashore || sunk ? { steer: 0, sail: 0 } : { steer: push.x, sail: push.y };
  if (sunk && (ship.state.sinking += dt) > 7) lostAtSea();
  // Riding at anchor, the crew patch what they can. Proper repairs need a shipwright.
  const patchTo = hasReward('crew') ? 0.8 : 0.6; // a seasoned crew (earned from tavern work) do better
  if (ship.state.anchorDepth > 0.9 && ship.state.hull < patchTo && !sunk) ship.state.hull = Math.min(patchTo, ship.state.hull + dt * (hasReward('crew') ? 0.014 : 0.008));
  ship.update(dt, time, input, wind);
  if (ashore) {
    // Turn the push into a direction on the ground, measured from where the camera is looking.
    const look = cam.follow + cam.yaw, fx = Math.sin(look), fz = Math.cos(look);
    walkMove.x = fx * push.y - fz * push.x;
    walkMove.z = fz * push.y + fx * push.x;
    if (shore.update(dt, walkMove, places.isOpen)) audio.footstep(shore.state.onWood);
  }
  // Your captain stands at the wheel, except when ashore or when you are looking through their eyes.
  captain.group.visible = !ashore && !cam.deck;
  captain.group.position.set(0, ship.helm.y - 1.82, ship.helm.z + 0.55);
  captain.arms[0].rotation.x = -1.2 - ship.state.rudder * 0.35;
  captain.arms[1].rotation.x = -1.2 + ship.state.rudder * 0.35;
  if (ashore) {
    const got = treasure.collectBottle(shore.state);
    if (got === 'full') { if (toastTimer <= 0) showToast('A bottle with a map inside, but you are carrying three already.'); }
    else if (got) { audio.coin(); showToast('A bottle on the sand, and in it ' + treasure.tierName(got).toLowerCase() + '. It is with your chart.'); }
    const n = finds.collect(shore.state);
    if (n) { audio.coin(); showToast(`A shell for your collection: ${n} of ${finds.shellTotal}`); }
  }
  action = findAction();
  actionBtn.hidden = !action;
  if (action && actionBtn.textContent !== action.label) actionBtn.textContent = action.label;
  // Logbook: distance sailed and days at sea.
  save.distance += Math.abs(ship.state.speed) * dt;
  if (env.hour < lastHour) { save.days++; coolOff(); payWages(); }
  lastHour = env.hour;
  if ((saveTimer -= dt) <= 0) { saveTimer = 10; saveGame(); }
  updateCamera(dt, time, first);
  first = false;
  wildlife.update(dt, time, ship.state, env, camera);
  updateIslands(time, wind);
  world.ashore = ashore;
  world.wanted = isWanted();
  pickFleetEnemy(dt);
  vessels.update(dt, time, world);
  combat.update(dt, time, targets);
  loot.update(dt, time, ashore || ship.state.sinking ? null : ship.state, wind, salvage);
  updateDangers();
  listenForBattle(dt);
  placeCrew(time);
  // Fire buttons: show the reload, and light up when someone is in the guns' arc.
  for (const [btn, side, key] of [[firePort, 1, 'port'], [fireStbd, -1, 'stbd']]) {
    btn.style.setProperty('--load', (me.reload[key] / me.reloadTime).toFixed(3));
    btn.classList.toggle('aim', me.reload[key] <= 0 && vessels.list.some((v) => !v.sinking && !v.gone && inArc(me, side, v)));
  }
  hullFill.style.width = Math.round(ship.state.hull * 100) + '%';
  hullFill.className = ship.state.hull < 0.3 ? 'grave' : ship.state.hull < 0.6 ? 'hurt' : '';
  treasure.update();
  people.update(dt, time, env, ashore ? shore.state : ship.state, ashore ? shore.state : null);
  updateWake(dt, time);
  applyEnvironment(dt);
  ocean.update(time, camera, env);
  sky.update(camera, dt, env, wind);
  windFx.update(dt, camera, ship.state, wind, env);
  updateHud(dt);
  updateLabels();
  updateCompass();
  chart.update(dt, ship.state, wind, vessels.list);
  const st = ship.state;
  audio.update(dt, { wind: wind.speed, sea: sea.state, speed: st.speed, rain: env.rain, night: env.night, roll: st.roll, luffing: st.inIrons, nearLand: !!nearName });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Handy for testing from the browser console.
window.game = {
  ship, wind, cam, env, audio, shore, places, save, wildlife, people, finds, treasure, camera, stick, captain, combat, vessels, me, fire, world, loot, joinFleet, boardPrize, payWages, jobs, summonLord, pirateDown,
  // Jump the camera straight to its subject on the next frame (after teleporting things in tests).
  snapCamera() { first = true; },
  get paused() { return paused; }, setPaused,
  // Fast-forward the sailing simulation by a number of seconds.
  step(seconds, input = { steer: 0, sail: 0 }) {
    for (let i = 0; i < seconds * 60; i++) { time += 1 / 60; env.update(1 / 60, time); updateWind(time); ship.update(1 / 60, time, input, wind); world.ashore = shore.state.active; world.wanted = isWanted(); vessels.update(1 / 60, time, world); combat.update(1 / 60, time, targets); loot.update(1 / 60, time, shore.state.active ? null : ship.state, wind, salvage); listenForBattle(1 / 60); }
  },
};
