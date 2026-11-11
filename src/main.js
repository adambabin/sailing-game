// Entry point: builds the world, reads the controls and runs the game loop.

import * as THREE from 'three';
import { applyPaint } from './materials.js';
import { buildWaves, waveHeight, sea } from './waves.js';
import { createEnvironment, WEATHERS } from './environment.js';
import { createWindFx } from './windfx.js';
import { createOcean } from './ocean.js';
import { createSky } from './sky.js';
import { createIslands, ISLANDS, nightLights, terrainHeight } from './islands.js';
import { createShore } from './shore.js';
import { createWildlife } from './wildlife.js';
import { createPlaces, ALL_LOOK_VALUES } from './places.js';
import { createChart } from './chart.js';
import { save, persist, wipe } from './save.js';
import { createShip, SHIP_COLORS } from './ship.js';
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
  Object.assign(ship.state, { x: save.ship.x, z: save.ship.z, heading: save.ship.heading, sail: save.ship.sail, anchorDown: save.ship.anchor, anchorDepth: save.ship.anchor ? 1 : 0, speed: 0 });
  env.hour = save.ship.hour;
}
function saveGame() {
  const s = ship.state;
  save.ship = { x: s.x, z: s.z, heading: s.heading, sail: s.sail, anchor: s.anchorDown, hour: env.hour };
  persist();
}
const windFx = createWindFx();
const shore = createShore();
const wildlife = createWildlife(waves, { foam: foamAt, splash: (distance) => audio.splash(distance) });
scene.add(sky.dome, sky.stars, sky.clouds, islands, ocean.mesh, ship.root, windFx.ribbons, windFx.rain, shore.sailor, shore.dinghy, wildlife.group);
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
    const along = atBow ? 4.5 + Math.random() * 1.5 : -6.3;
    const off = atBow ? side * (0.9 + Math.random() * 0.5) : (Math.random() - 0.5) * 1.6;
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
  save.hold = save.upgrades.hold ? 30 : 20;
  ship.state.speedBonus = save.upgrades.sails ? 1.1 : 1;
}
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
const places = createPlaces({ look, applyLook, applyUpgrades, audio, toast: (t) => showToast(t) });
const chart = createChart();
const chartBtn = document.getElementById('tool-chart');
function toggleChart() {
  chartBtn.setAttribute('aria-expanded', String(chart.toggle(ship.state, wind)));
}
chartBtn.addEventListener('click', toggleChart);
document.getElementById('chart-close').addEventListener('click', toggleChart);

function goAshore(isl) {
  shore.land(isl);
  document.body.classList.add('ashore');
  setPadLabels('Walk');
  cam.sailDist = cam.dist;
  cam.dist = 11;
  cam.yaw = 0;
  cam.pitch = 0.3;
  if (!save.visited.includes(isl.name)) { save.visited.push(isl.name); persist(); }
  showToast('Ashore at ' + isl.name);
}
function backToShip() {
  places.close();
  shore.leave();
  document.body.classList.remove('ashore');
  setPadLabels('Sails');
  cam.dist = cam.sailDist || 34;
  cam.yaw = 0.5;
  cam.pitch = 0.24;
  showToast('Back aboard');
}

// The one thing you can do right now, shown on the big button (and the E key).
const walkLabels = document.querySelectorAll('#pad-right .stack small');
const setPadLabels = (text) => walkLabels.forEach((e) => (e.textContent = text));
const actionBtn = document.getElementById('action');
let action = null, portNearby = null;
function findAction() {
  const s = ship.state;
  if (places.isOpen) return null;
  if (shore.state.active) {
    const w = shore.state;
    for (const p of w.island.portInfo.places) {
      if (Math.hypot(w.x - p.doorX, w.z - p.doorZ) < 4.5) return { label: 'Visit the ' + p.label.toLowerCase(), run: () => places.open(w.island, p.kind) };
    }
    return shore.atDinghy() ? { label: 'Row back to the ship', run: backToShip } : null;
  }
  portNearby = ISLANDS.find((isl) => isl.portInfo && Math.hypot(s.x - isl.dock.x, s.z - isl.dock.z) < 110) || null;
  if (portNearby && s.anchorDepth > 0.9 && Math.abs(s.speed) < 1) return { label: 'Go ashore at ' + portNearby.name, run: () => goAshore(portNearby) };
  return null;
}
function doAction() {
  if (action) action.run();
}
actionBtn.addEventListener('click', doAction);

// Name tags that float over the places you can visit.
const labelBox = document.getElementById('labels');
const labelEls = ['Tavern', 'Shipwright', 'Market'].map((t) => labelBox.appendChild(Object.assign(document.createElement('div'), { className: 'place-label', textContent: t, hidden: true })));
function updateLabels() {
  const w = shore.state;
  labelEls.forEach((elm, i) => {
    const p = w.active && !places.isOpen ? w.island.portInfo.places.find((x) => x.label === elm.textContent) : null;
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
  else if (e.code === 'KeyE' && !e.repeat) doAction();
  else if (e.code === 'Enter' || e.code === 'Escape') {
    if (!help.hidden) closeHelp();
    else if (places.isOpen) places.close();
    else if (chart.isOpen) toggleChart();
    else if (e.code === 'Enter') doAction();
  }
});
window.addEventListener('keyup', (e) => { if (KEYS[e.code]) held[KEYS[e.code]] = false; });
window.addEventListener('blur', () => { for (const k in held) held[k] = false; });
document.querySelectorAll('[data-hold]').forEach((b) => {
  const set = (on) => (e) => { e.preventDefault(); held[b.dataset.hold] = on; b.classList.toggle('held', on); };
  b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); set(true)(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, set(false));
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});
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
const cam = { yaw: 0.5, pitch: 0.24, dist: 34, follow: Math.PI, target: new THREE.Vector3(), lastDrag: -10 };
const clampZoom = (d) => (shore.state.active ? THREE.MathUtils.clamp(d, 4, 45) : THREE.MathUtils.clamp(d, 14, 140));
const pointers = new Map();
let pinch = 0;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 1) {
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

function updateCamera(dt, time, snap) {
  const s = ship.state, w = shore.state;
  // Ease the camera round to stay behind the ship (or the sailor) as they turn.
  const heading = w.active ? w.heading : s.heading;
  let diff = heading - cam.follow;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  cam.follow += diff * (snap ? 1 : Math.min(1, dt * (w.active ? 2.5 : 1.2)));
  if (w.active) vPos.set(w.x, w.y + 1.9, w.z);
  else vPos.set(s.x, 4 + s.y * 0.4, s.z);
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
  if (shore.state.active) text = !action && !places.isOpen && shore.state.onWood ? 'Walk up into the village to find the tavern, shipwright and market.' : '';
  else if (s.aground) { text = 'Shallow water. Steer back out to sea.'; warn = true; }
  else if (s.anchorDepth > 0.9) text = action ? '' : s.sail > 0.15 ? 'At anchor. Weigh anchor to get under way.' : 'Riding at anchor.';
  else if (portNearby && s.speed < 6) text = 'Drop anchor here to go ashore at ' + portNearby.name + '.';
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
  const input = ashore ? { steer: 0, sail: 0 } : { steer: (held.right ? 1 : 0) - (held.left ? 1 : 0), sail: (held.up ? 1 : 0) - (held.down ? 1 : 0) };
  ship.update(dt, time, input, wind);
  if (ashore && shore.update(dt, held, places.isOpen)) audio.footstep(shore.state.onWood);
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
  ship, wind, cam, env, audio, shore, places, save, wildlife, camera,
  // Fast-forward the sailing simulation by a number of seconds.
  step(seconds, input = { steer: 0, sail: 0 }) {
    for (let i = 0; i < seconds * 60; i++) { time += 1 / 60; env.update(1 / 60, time); updateWind(time); ship.update(1 / 60, time, input, wind); }
  },
};
