// Entry point: builds the world, reads the controls and runs the game loop.

import * as THREE from 'three';
import { applyPaint } from './materials.js';
import { buildWaves, waveHeight, sea } from './waves.js';
import { createEnvironment, WEATHERS } from './environment.js';
import { createWindFx } from './windfx.js';
import { createOcean } from './ocean.js';
import { createSky } from './sky.js';
import { createIslands, ISLANDS, nightLights, terrainHeight, coastRadius } from './islands.js';
import { createShore } from './shore.js';
import { createWildlife } from './wildlife.js';
import { createPeople, buildPerson } from './people.js';
import { createFinds } from './finds.js';
import { createTreasure } from './treasure.js';
import { createCombat, inArc } from './combat.js';
import { createVessels } from './vessels.js';
import { createPlaces, ALL_LOOK_VALUES } from './places.js';
import { createChart } from './chart.js';
import { save, persist, wipe } from './save.js';
import { createShip, SHIP_COLORS, SHIP_TYPES } from './ship.js';
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
const ocean = createOcean(waves, ISLANDS);
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
  sunk: (v) => { audio.sink(); showToast('She is going down'); },
};
const combat = createCombat(waves, fx);
const vessels = createVessels(waves, fx);
scene.add(combat.group, vessels.group);
// The player's ship as the cannon code sees her: the same shape of thing as any other vessel.
const me = {
  faction: 'player', reload: { port: 0, stbd: 0 }, gone: false, aim: 1,
  get x() { return ship.state.x; }, get z() { return ship.state.z; }, get y() { return ship.state.y; },
  get heading() { return ship.state.heading; },
  get vx() { return Math.sin(ship.state.heading) * ship.state.speed; }, get vz() { return Math.cos(ship.state.heading) * ship.state.speed; },
  get size() { return ship.type.size; }, get top() { return ship.type.top; }, get guns() { return ship.guns; },
  get reloadTime() { return ship.type.reload; }, get hull() { return ship.state.hull; }, get sinking() { return ship.state.sinking; },
  hit(damage) {
    const s = ship.state;
    if (s.sinking) return;
    s.hull = Math.max(0, s.hull - damage / ship.type.hullMax);
    if (s.hull <= 0) { s.sinking = 0.001; audio.sink(); showToast('She is going down!'); }
  },
};
const targets = [me, ...vessels.list];
function fire(side) {
  if (shore.state.active || !help.hidden) return;
  combat.fire(me, side, targets);
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
  if (!wasSloop) save.ships = save.ships.filter((id) => id !== ship.typeId);
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
  try { localStorage.setItem('tradewind-look', JSON.stringify(look)); } catch {}
}
function applyUpgrades() {
  save.hold = ship.type.hold + (save.upgrades.hold ? 10 : 0);
  ship.state.speedBonus = save.upgrades.sails ? 1.1 : 1;
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
document.getElementById('tool-ship').addEventListener('click', tryNextShip);

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
document.getElementById('tool-time').addEventListener('click', skipTime);
document.getElementById('tool-weather').addEventListener('click', cycleWeather);

// ---- Sound ------------------------------------------------------------------------
const audio = createAudio();
const soundBtn = document.getElementById('tool-sound');
soundBtn.textContent = MODE_LABELS[audio.mode];
function cycleSound() {
  audio.start();
  soundBtn.textContent = MODE_LABELS[audio.cycleMode()];
}
soundBtn.addEventListener('click', cycleSound);
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio.start());
document.addEventListener('visibilitychange', () => {
  audio.pause(document.hidden);
  if (document.hidden) saveGame();
});
window.addEventListener('pagehide', saveGame);

// ---- Ports: going ashore, visiting places, the chart ------------------------------
const places = createPlaces({ look, applyLook, applyUpgrades, audio, toast: (t) => showToast(t), ship, setShip, treasure });
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
  chartBtn.setAttribute('aria-expanded', String(chart.toggle(ship.state, wind)));
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
  portNearby = ISLANDS.find((isl) => isl.portInfo && Math.hypot(s.x - isl.dock.x, s.z - isl.dock.z) < 110) || null;
  // Any island's beach will do if there is no dock nearby.
  beachNearby = portNearby ? null : ISLANDS.find((isl) => {
    const dx = s.x - isl.x, dz = s.z - isl.z;
    return Math.hypot(dx, dz) - coastRadius(isl, Math.atan2(dz, dx)) < 110;
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
  if (KEYS[e.code]) { held[KEYS[e.code]] = true; e.preventDefault(); }
  else if (e.code === 'Space' && !e.repeat) { toggleAnchor(); e.preventDefault(); }
  else if (e.code === 'KeyT') skipTime();
  else if (e.code === 'KeyR') cycleWeather();
  else if (e.code === 'KeyM') cycleSound();
  else if (e.code === 'KeyC') toggleChart();
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
function closeHelp() { help.hidden = true; }
document.getElementById('help-go').addEventListener('click', closeHelp);
if (save.distance > 100) document.getElementById('help-go').textContent = 'Continue your voyage';

// Starting over wipes saved progress; the button asks twice because browsers' own pop-ups are not available here.
const resetBtn = document.getElementById('new-voyage');
resetBtn.addEventListener('click', () => {
  if (resetBtn.dataset.sure) {
    wipe();
    location.reload();
  } else {
    resetBtn.dataset.sure = '1';
    resetBtn.textContent = 'Really start over? Coins, cargo and chart will be lost';
    setTimeout(() => { delete resetBtn.dataset.sure; resetBtn.textContent = 'Start a new voyage'; }, 5000);
  }
});
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
function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  toastTimer = 3.2;
}
let nearName = null;
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
  dialWind.setAttribute('transform', `rotate(${THREE.MathUtils.radToDeg(s.relWind).toFixed(1)})`);

  let text = '', warn = false;
  if (shore.state.active) text = !action && !places.isOpen && shore.state.onWood && shore.state.island.portInfo ? 'Walk up into the village to find the tavern, shipwright and market.' : '';
  else if (s.sinking) { text = 'She is lost. Abandon ship!'; warn = true; }
  else if (s.aground) { text = 'Shallow water. Steer back out to sea.'; warn = true; }
  else if (s.anchorDepth > 0.9) text = action ? '' : s.sail > 0.15 ? 'At anchor. Weigh anchor to get under way.' : 'Riding at anchor.';
  else if ((portNearby || beachNearby) && s.speed < 6) text = 'Drop anchor here to go ashore at ' + (portNearby || beachNearby).name + '.';
  else if (s.inIrons) { text = 'Pointing into the wind. Turn away until the sails fill.'; warn = true; }
  else if (s.sail < 0.05 && s.speed < 0.6) text = 'Raise the sails to get under way.';
  else if (wind.speed > 25 && s.sail > 0.75) text = 'Blowing hard. Lower some sail for a steadier ride.';
  hint.textContent = text || hint.textContent;
  hint.classList.toggle('show', !!text);
  hint.classList.toggle('warn', warn);

  if (toastTimer > 0 && (toastTimer -= dt) <= 0) toast.classList.remove('show');
  let found = null;
  for (const isl of ISLANDS) {
    const d = Math.hypot(s.x - isl.x, s.z - isl.z);
    if (d < isl.R * 1.5 + 90) found = isl.name;
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
  if (ship.state.anchorDepth > 0.9 && ship.state.hull < 0.6 && !sunk) ship.state.hull = Math.min(0.6, ship.state.hull + dt * 0.008);
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
  if (env.hour < lastHour) save.days++;
  lastHour = env.hour;
  if ((saveTimer -= dt) <= 0) { saveTimer = 10; saveGame(); }
  updateCamera(dt, time, first);
  first = false;
  wildlife.update(dt, time, ship.state, env, camera);
  vessels.update(dt, time, ship.state);
  combat.update(dt, time, targets);
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
  chart.update(dt, ship.state, wind);
  const st = ship.state;
  audio.update(dt, { wind: wind.speed, sea: sea.state, speed: st.speed, rain: env.rain, night: env.night, roll: st.roll, luffing: st.inIrons, nearLand: !!nearName });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Handy for testing from the browser console.
window.game = {
  ship, wind, cam, env, audio, shore, places, save, wildlife, people, finds, treasure, camera, stick, captain, combat, vessels, me, fire,
  // Jump the camera straight to its subject on the next frame (after teleporting things in tests).
  snapCamera() { first = true; },
  // Fast-forward the sailing simulation by a number of seconds.
  step(seconds, input = { steer: 0, sail: 0 }) {
    for (let i = 0; i < seconds * 60; i++) { time += 1 / 60; env.update(1 / 60, time); updateWind(time); ship.update(1 / 60, time, input, wind); vessels.update(1 / 60, time, ship.state); combat.update(1 / 60, time, targets); }
  },
};
