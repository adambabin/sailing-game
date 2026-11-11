// Entry point: builds the world, reads the controls and runs the game loop.

import * as THREE from 'three';
import { STYLES, STYLE_ORDER } from './styles.js';
import { applyStyle } from './materials.js';
import { buildWaves, waveHeight } from './waves.js';
import { createOcean } from './ocean.js';
import { createSky } from './sky.js';
import { createIslands, ISLANDS } from './islands.js';
import { createShip } from './ship.js';

const canvas = document.getElementById('sea');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 500, 5000);
const camera = new THREE.PerspectiveCamera(55, 1, 1, 14000);

const sun = new THREE.DirectionalLight(0xffffff, 2);
const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
scene.add(sun, sun.target, hemi);

// ---- Wind: a steady trade wind that wanders a little ---------------------------
const WIND_BASE = 0.29; // radians; the direction the wind blows toward
const wind = { dx: 1, dz: 0, speed: 13 };
function updateWind(t) {
  const a = WIND_BASE + 0.22 * Math.sin(t * 0.013) + 0.09 * Math.sin(t * 0.031 + 1);
  wind.dx = Math.cos(a);
  wind.dz = Math.sin(a);
  wind.speed = 13 + 2.5 * Math.sin(t * 0.021) + 1 * Math.sin(t * 0.07);
}

// ---- World -----------------------------------------------------------------------
const waves = buildWaves(WIND_BASE);
const islands = createIslands();
const ocean = createOcean(waves, ISLANDS);
const sky = createSky();
const ship = createShip(waves);
scene.add(sky.dome, sky.clouds, islands, ocean.mesh, ship.root);

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

// ---- Art styles ------------------------------------------------------------------
let style = STYLES.lowpoly;
function setStyle(id) {
  style = STYLES[id] || STYLES.lowpoly;
  sky.setStyle(style);
  ocean.setStyle(style);
  applyStyle(scene, style);
  sun.color.set(style.sunColor);
  sun.intensity = style.sunIntensity;
  hemi.color.set(style.hemiSky);
  hemi.groundColor.set(style.hemiGround);
  hemi.intensity = style.hemiIntensity;
  scene.fog.color.set(style.sky.horizon);
  scene.fog.near = style.fog.near;
  scene.fog.far = style.fog.far;
  wake.material.color.set(style.water.foam);
  document.querySelectorAll('#styles button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === style.id)));
  try { localStorage.setItem('tradewind-style', style.id); } catch {}
}
document.querySelectorAll('#styles button').forEach((b) => b.addEventListener('click', () => setStyle(b.dataset.style)));
let saved = null;
try { saved = localStorage.getItem('tradewind-style'); } catch {}
setStyle(saved || 'lowpoly');

// ---- Controls --------------------------------------------------------------------
const held = { left: false, right: false, up: false, down: false };
const KEYS = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };
const anchorBtn = document.getElementById('btn-anchor');
function toggleAnchor() {
  ship.state.anchorDown = !ship.state.anchorDown;
  anchorBtn.setAttribute('aria-pressed', String(ship.state.anchorDown));
  showToast(ship.state.anchorDown ? 'Anchor away' : 'Anchor aweigh');
}
window.addEventListener('keydown', (e) => {
  if (KEYS[e.code]) { held[KEYS[e.code]] = true; e.preventDefault(); }
  else if (e.code === 'Space' && !e.repeat) { toggleAnchor(); e.preventDefault(); }
  else if (e.code.startsWith('Digit')) { const id = STYLE_ORDER[+e.code.slice(5) - 1]; if (id) setStyle(id); }
  else if (e.code === 'Enter' || e.code === 'Escape') closeHelp();
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

const help = document.getElementById('help');
function closeHelp() { help.hidden = true; }
document.getElementById('help-go').addEventListener('click', closeHelp);
document.getElementById('helpbtn').addEventListener('click', () => { help.hidden = !help.hidden; });

// ---- Camera: follows behind the ship; drag to look around, scroll or pinch to zoom
const cam = { yaw: 0.5, pitch: 0.24, dist: 34, follow: Math.PI, target: new THREE.Vector3(), lastDrag: -10 };
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
    if (pinch) cam.dist = THREE.MathUtils.clamp(cam.dist * (pinch / d), 14, 140);
    pinch = d;
  }
});
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, (e) => { pointers.delete(e.pointerId); pinch = 0; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 14, 140); }, { passive: false });

function updateCamera(dt, time, snap) {
  const s = ship.state;
  // Ease the camera round to stay behind the ship as she turns.
  let diff = s.heading - cam.follow;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  cam.follow += diff * (snap ? 1 : Math.min(1, dt * 1.2));
  vPos.set(s.x, 4 + s.y * 0.4, s.z);
  cam.target.lerp(vPos, snap ? 1 : Math.min(1, dt * 6));
  const yaw = cam.follow + Math.PI + cam.yaw;
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.target.x + Math.sin(yaw) * cp * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(yaw) * cp * cam.dist);
  const floor = waveHeight(waves, camera.position.x, camera.position.z, time) + 1.2;
  if (camera.position.y < floor) camera.position.y = floor;
  camera.lookAt(cam.target);
}

// ---- On-screen display -----------------------------------------------------------
const el = (id) => document.getElementById(id);
const gSpeed = el('g-speed'), gHeading = el('g-heading'), gSail = el('g-sail'), gWind = el('g-wind');
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
  dialWind.setAttribute('transform', `rotate(${THREE.MathUtils.radToDeg(s.relWind).toFixed(1)})`);

  let text = '', warn = false;
  if (s.aground) { text = 'Shallow water. Steer back out to sea.'; warn = true; }
  else if (s.anchorDepth > 0.9) text = s.sail > 0.15 ? 'At anchor. Weigh anchor to get under way.' : 'Riding at anchor.';
  else if (s.inIrons) { text = 'Pointing into the wind. Turn away until the sails fill.'; warn = true; }
  else if (s.sail < 0.05 && s.speed < 0.6) text = 'Raise the sails to get under way.';
  hint.textContent = text || hint.textContent;
  hint.classList.toggle('show', !!text);
  hint.classList.toggle('warn', warn);

  if (toastTimer > 0 && (toastTimer -= dt) <= 0) toast.classList.remove('show');
  let found = null;
  for (const isl of ISLANDS) {
    const d = Math.hypot(s.x - isl.x, s.z - isl.z);
    if (d < isl.R * 1.5 + 90) found = isl.name;
  }
  if (found && found !== nearName) showToast(found);
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
let time = 0, first = true;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  updateWind(time);
  const input = { steer: (held.right ? 1 : 0) - (held.left ? 1 : 0), sail: (held.up ? 1 : 0) - (held.down ? 1 : 0) };
  ship.update(dt, time, input, wind);
  updateCamera(dt, time, first);
  first = false;
  updateWake(dt, time);
  ocean.update(time, camera);
  sky.update(camera, dt);
  sun.position.copy(ship.root.position).addScaledVector(sun.target.position.set(...style.sunDir).normalize(), 200);
  sun.target.position.copy(ship.root.position);
  updateHud(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Handy for testing from the browser console.
window.game = {
  ship, wind, cam, setStyle,
  // Fast-forward the sailing simulation by a number of seconds.
  step(seconds, input = { steer: 0, sail: 0 }) {
    for (let i = 0; i < seconds * 60; i++) { time += 1 / 60; updateWind(time); ship.update(1 / 60, time, input, wind); }
  },
};
