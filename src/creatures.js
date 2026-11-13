// Sea creatures. Real animals live in their own waters and surface now and then:
// sail close while one is up and it goes in your sea-life log. Two legends can be
// fought: the kraken, which lives in The Deep (marked on the chart), and the sea
// serpent, which only rises in a storm far from home. Both attack the ship and are
// fought with your broadsides, like a pirate lord.

import * as THREE from 'three';
import { paint, applyPaint } from './materials.js';
import { waveHeight } from './waves.js';
import { islandCoast } from './islands.js';
import { waterAt } from './fishing.js';
import { save, persist } from './save.js';
import { hasReward } from './rewards.js';

const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// The Deep: open water west of The Twins, where the kraken lives.
export const DEEP = { name: 'The Deep', x: -1350, z: 1500, r: 340 };

// Every creature for the log. `where` uses the same words as the fish (see fishing.js):
// shore / open, a region or a list of regions, day / night, far from home, storm.
// `range` is how close you must be, in metres, to log it while it is up. `odds` weights the draw.
export const CREATURES = [
  { id: 'humpback', name: 'Humpback whale', where: { shore: false }, range: 280, odds: 3, text: 'Spouts, rolls, and now and then hurls its whole great body clear of the water.' },
  { id: 'sperm', name: 'Sperm whale', where: { shore: false, far: true }, range: 280, odds: 1.5, text: 'A square-headed giant of the far, deep water. It blows once and is gone for a long while.' },
  { id: 'orca', name: 'Orca', where: { region: 'The Ironbound Coast', shore: false }, range: 240, odds: 3, text: 'Black and white hunters that travel in a pod along the cold cliffs.' },
  { id: 'turtle', name: 'Green sea turtle', where: { shore: true, region: ['Home Waters', 'The Stepping Stones', 'The Shallows'] }, range: 110, odds: 3, text: 'Comes up for a breath close in to the islands, then paddles slowly down again.' },
  { id: 'manta', name: 'Manta ray', where: { region: 'The Pearl Rings' }, range: 170, odds: 3, text: 'Glides like a great dark kite around the atolls, and leaps clean out for the joy of it.' },
  { id: 'hammerhead', name: 'Hammerhead shark', where: { region: 'The Shallows' }, range: 150, odds: 3, text: 'Its fin cuts the surface in slow circles over the sandbars.' },
  { id: 'whaleshark', name: 'Whale shark', where: { region: 'Santa Brisa', shore: false, day: true }, range: 220, odds: 2, text: 'The biggest fish in the sea, spotted like a night sky, and gentle as a cow.' },
  { id: 'seal', name: 'Monk seal', where: { region: 'The Ironbound Coast', shore: true }, range: 110, odds: 3, text: 'Whiskered heads bob up among the rocks to see who has come.' },
  { id: 'jelly', name: 'Glowing jellyfish', where: { shore: false, night: true }, range: 120, odds: 2.5, text: 'On dark nights the open sea fills with soft blue lights.' },
  { id: 'dolphin', name: 'Bottlenose dolphin', where: {}, range: 0, odds: 0, text: 'They come to play at the bow of a ship under way in open water.' },
  { id: 'kraken', name: 'The Kraken', legend: true, where: {}, range: 0, odds: 0, text: 'It lives in The Deep, west of The Twins. Few who meet it say much about it afterward.' },
  { id: 'serpent', name: 'The Sea Serpent', legend: true, where: {}, range: 0, odds: 0, text: 'It rises only in a storm, and only far from home.' },
];
export const creatureById = (id) => CREATURES.find((c) => c.id === id);

// Words for where a creature is found, for the log.
export function habitat(c) {
  if (c.id === 'dolphin') return 'in open water, alongside a moving ship';
  if (c.legend) return c.id === 'kraken' ? 'in The Deep' : 'in a storm far from home';
  const w = c.where, bits = [];
  if (w.shore === true) bits.push('close in to land');
  else if (w.shore === false) bits.push('out in open water');
  if (w.region) bits.push('around ' + [].concat(w.region).join(', '));
  if (w.far) bits.push('far from home');
  if (w.night) bits.push('by night');
  if (w.day) bits.push('by day');
  return bits.join(', ') || 'almost anywhere';
}
function livesIn(c, water) {
  const w = c.where;
  if (c.legend || !c.odds) return false;
  if (w.shore === true && !water.shore) return false;
  if (w.shore === false && !water.open) return false;
  if (w.region && ![].concat(w.region).includes(water.region)) return false;
  if (w.far && !water.far) return false;
  if (w.night && !water.night) return false;
  if (w.day && water.night) return false;
  return true;
}

// Log rewards, by the number of kinds seen (out of 12).
export const LOG_REWARDS = { 4: 'spyglass', 8: 'coralsails', 12: 'wavecloth' };
export const LEGEND_REWARDS = { kraken: 'krakenink', serpent: 'serpentjade' };
export const LEGEND_COINS = { kraken: 1200, serpent: 1000 };

// ---- Models ---------------------------------------------------------------------
const ball = new THREE.SphereGeometry(1, 14, 10), cone = new THREE.ConeGeometry(1, 1, 8);
function part(geo, color, sx, sy, sz, x = 0, y = 0, z = 0, opts) {
  const m = paint(new THREE.Mesh(geo, undefined), color, opts);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}
// A flat triangle (fins and flukes), from three points.
function tri(color, a, b, c, glow = false) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(...c)]);
  geo.computeVertexNormals();
  return paint(new THREE.Mesh(geo), color, { double: true, glow });
}
function whale(color, belly, len, sperm) {
  const g = new THREE.Group();
  g.add(part(ball, color, len * 0.13, len * 0.11, len * 0.5));
  g.add(part(ball, belly, len * 0.11, len * 0.08, len * 0.42, 0, -len * 0.04, len * 0.05));
  if (sperm) g.add(part(new THREE.BoxGeometry(1, 1, 1), color, len * 0.2, len * 0.2, len * 0.36, 0, 0.1, len * 0.3));
  g.add(part(cone, color, len * 0.07, len * 0.32, len * 0.07, 0, 0, -len * 0.55).rotateX(-Math.PI / 2));
  const fl = len * 0.72;
  g.add(tri(color, [0, 0, -fl + len * 0.06], [len * 0.22, 0, -fl - len * 0.08], [0, 0, -fl - len * 0.02]));
  g.add(tri(color, [0, 0, -fl + len * 0.06], [-len * 0.22, 0, -fl - len * 0.08], [0, 0, -fl - len * 0.02]));
  g.add(tri(color, [0, len * 0.1, -len * 0.25], [0, len * 0.16, -len * 0.33], [0, len * 0.1, -len * 0.38]));
  if (!sperm) for (const s of [1, -1]) g.add(tri(color, [s * len * 0.11, -len * 0.04, len * 0.22], [s * len * 0.42, -len * 0.1, len * 0.02], [s * len * 0.11, -len * 0.05, len * 0.12]));
  return g;
}
function orca() {
  const g = new THREE.Group(), black = 0x15171c, white = 0xf2f2ee;
  g.add(part(ball, black, 0.95, 1.05, 3.6));
  g.add(part(ball, white, 0.8, 0.7, 2.6, 0, -0.35, 0.5));
  g.add(part(ball, white, 0.3, 0.2, 0.5, 0.62, 0.35, 2.1), part(ball, white, 0.3, 0.2, 0.5, -0.62, 0.35, 2.1));
  g.add(tri(black, [0, 0.8, 0.4], [0, 2.7, -0.6], [0, 0.8, -1.1]));
  g.add(tri(black, [0, 0, -3.4], [1.3, 0, -4.4], [0, 0, -4]), tri(black, [0, 0, -3.4], [-1.3, 0, -4.4], [0, 0, -4]));
  return g;
}
function turtle() {
  const g = new THREE.Group(), shell = 0x6b6a38, skin = 0x8a8a5a;
  g.add(part(ball, shell, 0.7, 0.25, 0.9));
  g.add(part(ball, skin, 0.2, 0.17, 0.26, 0, 0.02, 1.0));
  for (const [s, z, k] of [[1, 0.4, 1], [-1, 0.4, 1], [1, -0.6, 0.6], [-1, -0.6, 0.6]]) g.add(tri(skin, [s * 0.55, 0, z + 0.15], [s * (0.55 + 0.6 * k), -0.02, z - 0.2], [s * 0.55, 0, z - 0.2]));
  return g;
}
function manta() {
  const g = new THREE.Group(), top = 0x2a3038, under = 0xdcdcd6;
  g.add(tri(top, [0, 0.12, 1.4], [2.6, 0, -0.3], [0, 0.12, -1.0]), tri(top, [0, 0.12, 1.4], [-2.6, 0, -0.3], [0, 0.12, -1.0]));
  g.add(tri(under, [0, -0.02, 1.3], [2.5, -0.06, -0.3], [0, -0.02, -0.9]), tri(under, [0, -0.02, 1.3], [-2.5, -0.06, -0.3], [0, -0.02, -0.9]));
  g.add(part(ball, top, 0.5, 0.25, 1.0, 0, 0.05, 0.2));
  g.add(part(cone, top, 0.05, 2.2, 0.05, 0, 0, -2.0).rotateX(-Math.PI / 2));
  return g;
}
function hammerhead() {
  const g = new THREE.Group(), grey = 0x7d8a92;
  g.add(part(ball, grey, 0.45, 0.5, 1.9));
  g.add(part(new THREE.BoxGeometry(1, 1, 1), grey, 2.0, 0.18, 0.45, 0, 0, 1.9));
  g.add(tri(grey, [0, 0.4, 0.5], [0, 1.6, -0.3], [0, 0.4, -0.5]));
  g.add(tri(grey, [0, 0, -1.7], [0, 1.0, -2.6], [0, -0.5, -2.4]));
  return g;
}
let spots = null;
function whaleShark() {
  if (!spots) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#c9d4dc';
    for (let i = 0; i < 40; i++) { x.beginPath(); x.arc(Math.random() * 64, Math.random() * 64, 1.6, 0, 7); x.fill(); }
    spots = new THREE.CanvasTexture(c);
    spots.wrapS = spots.wrapT = THREE.RepeatWrapping;
    spots.repeat.set(3, 3);
    spots.colorSpace = THREE.SRGBColorSpace;
  }
  const g = new THREE.Group(), col = 0x3d5266;
  g.add(part(ball, col, 1.6, 1.2, 6, 0, 0, 0, { map: spots }));
  g.add(tri(col, [0, 1.0, -0.5], [0, 2.4, -1.8], [0, 1.0, -2.3]));
  g.add(tri(col, [0, 0, -5.5], [0, 2.6, -8], [0, -1.6, -7.4]));
  for (const s of [1, -1]) g.add(tri(col, [s * 1.4, -0.4, 1.5], [s * 3.2, -0.8, -0.4], [s * 1.4, -0.4, 0]));
  return g;
}
function seal() {
  const g = new THREE.Group(), col = 0x5d5650;
  g.add(part(ball, col, 0.42, 0.42, 1.0));
  g.add(part(ball, col, 0.3, 0.3, 0.34, 0, 0.5, 0.7));
  g.add(part(ball, 0x1a1a1a, 0.05, 0.05, 0.05, 0.12, 0.6, 0.98), part(ball, 0x1a1a1a, 0.05, 0.05, 0.05, -0.12, 0.6, 0.98));
  return g;
}
const jellyMat = new THREE.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
function jellies() {
  const g = new THREE.Group(), dome = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(dome, jellyMat);
    const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * 22;
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    m.scale.setScalar(rand(0.35, 0.8));
    m.userData.bob = rand(0, 6);
    g.add(m);
  }
  return g;
}

// How each kind moves. up / down: seconds at the surface and below. surf: how high the body sits when up.
// speed in metres a second. Some stay at the surface (always), some blow, breach or leap.
const MOVES = {
  humpback: { build: () => whale(0x34414e, 0x8e9aa4, 15), up: [7, 11], down: [12, 20], surf: -0.9, speed: 2.2, blow: true, breach: 0.3 },
  sperm: { build: () => whale(0x494c52, 0x6d7076, 16, true), up: [8, 12], down: [18, 28], surf: -0.9, speed: 1.8, blow: true },
  orca: { build: orca, up: [2.6, 3.6], down: [4, 7], surf: -0.4, speed: 4.2, pod: 3 },
  turtle: { build: turtle, up: [6, 9], down: [8, 14], surf: -0.1, speed: 0.7, shore: true },
  manta: { build: manta, up: [6, 9], down: [6, 10], surf: -0.15, speed: 1.6, leap: 0.45 },
  hammerhead: { build: hammerhead, always: true, surf: -0.55, speed: 1.9, circle: true },
  whaleshark: { build: whaleShark, always: true, surf: -0.75, speed: 1.1 },
  seal: { build: seal, up: [4, 6], down: [5, 9], surf: -0.35, speed: 0.6, shore: true, pod: 2 },
  jelly: { build: jellies, always: true, surf: 0.04, speed: 0.25, glow: true },
};

// ---- The legends' bodies --------------------------------------------------------
// A tentacle is a chain of tapering segments, each fixed to the end of the one before,
// so bending each a little curls the whole arm.
function tentacle(color, segs = 10, len = 1.3) {
  const root = new THREE.Group(), joints = [];
  let parent = root;
  for (let i = 0; i < segs; i++) {
    const j = new THREE.Group();
    j.position.y = i ? len : 0;
    const r0 = 0.95 * (1 - i / segs) + 0.12, r1 = 0.95 * (1 - (i + 1) / segs) + 0.1;
    const m = paint(new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 8)), color);
    m.position.y = len / 2;
    j.add(m);
    parent.add(j);
    joints.push(j);
    parent = j;
  }
  return { root, joints };
}
function krakenBody() {
  const g = new THREE.Group(), red = 0x7a2a3a;
  g.add(part(ball, red, 6, 4.5, 8, 0, 0, 0));
  g.add(part(ball, 0x8f3a4a, 5.2, 3, 6.5, 0, 1.5, -3.5));
  for (const s of [1, -1]) {
    g.add(part(ball, 0xf2c94c, 1.3, 1.3, 1.3, s * 4.3, 1.0, 4.6));
    g.add(part(ball, 0x111111, 0.35, 1.0, 0.6, s * 4.95, 1.0, 5.4));
  }
  return g;
}
function serpentHead() {
  const g = new THREE.Group(), green = 0x4fae94, red = 0xe0452f;
  g.scale.setScalar(1.6);
  g.add(part(ball, green, 1.5, 1.3, 3.2));
  g.add(part(cone, green, 1.2, 2.6, 0.9, 0, -0.5, 2.6).rotateX(Math.PI / 2));
  for (const s of [1, -1]) {
    g.add(part(ball, 0xffd84a, 0.35, 0.35, 0.35, s * 1.05, 0.55, 1.6, { glow: true })); // its eyes glow in the dark
    g.add(tri(red, [s * 0.8, 0.6, -0.6], [s * 3.0, 2.4, -2.4], [s * 0.8, 0.4, -2.2]));
  }
  g.add(tri(red, [0, 1.1, 0.8], [0, 3.4, -1.2], [0, 1.1, -2.6]));
  return g;
}

// ---- Spray: puffs of white for spouts, breaches and blows ---------------------------
function sprayPool(n) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), mat, n);
  mesh.frustumCulled = false;
  const ps = Array.from({ length: n }, () => ({ age: 9, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1 }));
  let next = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  return {
    mesh,
    puff(x, y, z, vx, vy, vz, s, life) { Object.assign(ps[next++ % n], { age: 0, life, x, y, z, vx, vy, vz, s }); },
    update(dt, color) {
      mat.color.copy(color);
      ps.forEach((p, i) => {
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) { mesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); return; }
        p.vy -= 4 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const s = p.s * (0.6 + 1.4 * k) * (1 - k * k);
        mesh.setMatrixAt(i, m4.compose(v.set(p.x, p.y, p.z), q, sc.set(s, s, s)));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// `fx` supplies foam(x, z, size), splash(distance), crunch(distance), roar(distance), hitShip(damage, by),
// notice(kind, data) for things worth telling the player, and logged(creature, count, reward).
export function createCreatures(waves, fx) {
  const group = new THREE.Group();
  const spray = sprayPool(90);
  group.add(spray.mesh);
  const active = []; // animals out at the moment (at most a couple of groups)
  let wait = rand(40, 80);
  let legend = null; // the kraken or the serpent, while one is out
  let deepTimer = 0, inDeep = false;
  const sprayColor = new THREE.Color();
  const tmp = new THREE.Vector3();

  // Make a note in the log the first time a kind is seen (and count later sightings).
  function log(id, data) {
    const first = !save.creatures[id];
    save.creatures[id] = (save.creatures[id] || 0) + 1;
    persist();
    if (first) fx.logged(creatureById(id), Object.keys(save.creatures).filter((k) => creatureById(k)).length, data);
    return first;
  }

  function spawn(id, near, at) {
    const kind = MOVES[id], members = [];
    const n = kind.pod || 1, c = { id, kind, x: at.x, z: at.z, home: { ...at }, heading: rand(0, 6.28), cycle: rand(0, 4), life: rand(170, 260), members, logged: false, announced: false, seed: rand(0, 99) };
    c.upFor = kind.always ? 1 : rand(...kind.up);
    c.downFor = kind.always ? 0 : rand(...kind.down);
    for (let i = 0; i < n; i++) {
      const model = kind.build();
      applyPaint(model);
      group.add(model);
      members.push({ model, ox: i ? rand(-7, 7) : 0, oz: i ? -i * rand(6, 9) : 0, delay: i * rand(0.4, 0.9), depth: -12, jump: 0, jumpFor: 0, blown: false, x: at.x, z: at.z });
    }
    active.push(c);
    return c;
  }
  function despawn(c) {
    for (const m of c.members) group.remove(m.model);
    active.splice(active.indexOf(c), 1);
  }

  // Pick an animal that lives in the waters near `ship` and put it out ahead of her somewhere.
  function trySpawn(ship, env) {
    const fwd = ship.heading;
    for (let tries = 0; tries < 14; tries++) {
      const a = fwd + rand(-1.3, 1.3), d = rand(300, 560);
      const at = { x: ship.x + Math.sin(a) * d, z: ship.z + Math.cos(a) * d };
      if (islandCoast(at.x, at.z) > -0.45) continue;
      const water = waterAt(at.x, at.z, env);
      if (Math.hypot(at.x - DEEP.x, at.z - DEEP.z) < DEEP.r + 200) continue; // nothing else lives in The Deep
      const here = CREATURES.filter((c) => livesIn(c, water) && MOVES[c.id]);
      if (!here.length) continue;
      // Favour kinds you have not logged yet a little.
      const weight = (c) => c.odds * (save.creatures[c.id] ? 1 : 1.6);
      let r = Math.random() * here.reduce((s, c) => s + weight(c), 0);
      const pick = here.find((c) => (r -= weight(c)) <= 0) || here[0];
      return spawn(pick.id, ship, at);
    }
    return null;
  }

  function updateAnimal(c, dt, time, ship, env, logRange) {
    const k = c.kind;
    c.life -= dt;
    c.cycle += dt;
    // Wander, keeping clear of land (or, for shore kinds, close to where they were found).
    c.heading += Math.sin(time * 0.15 + c.seed) * 0.12 * dt;
    if (k.circle) c.heading += 0.12 * dt;
    const ax = c.x + Math.sin(c.heading) * 40, az = c.z + Math.cos(c.heading) * 40;
    if (islandCoast(ax, az) > (k.shore ? -0.3 : -0.8)) c.heading += 0.8 * dt;
    if (k.shore && Math.hypot(c.x - c.home.x, c.z - c.home.z) > 140) c.heading += angleTo(c.heading, Math.atan2(c.home.x - c.x, c.home.z - c.z)) * dt * 0.5;
    c.x += Math.sin(c.heading) * k.speed * dt;
    c.z += Math.cos(c.heading) * k.speed * dt;
    const ch = Math.cos(c.heading), sh = Math.sin(c.heading), period = c.upFor + c.downFor;
    let anyUp = false;
    for (const m of c.members) {
      m.x = c.x + ch * m.ox + sh * m.oz;
      m.z = c.z - sh * m.ox + ch * m.oz;
      const u = k.always ? 0 : (((c.cycle - m.delay) % period) + period) % period;
      const up = u < c.upFor;
      const want = up ? k.surf : -12;
      const before = m.depth;
      m.depth += (want - m.depth) * Math.min(1, dt * (up ? 0.9 : 0.55));
      const rising = m.depth > before + 0.002, sinking = m.depth < before - 0.002;
      const visible = m.depth > k.surf - 1.2;
      if (visible) anyUp = true;
      // A whale blows when it first comes up.
      if (k.blow && up && !m.blown && m.depth > k.surf - 0.6) {
        m.blown = true;
        const w = waveHeight(waves, m.x, m.z, time);
        for (let i = 0; i < 9; i++) spray.puff(m.x + Math.sin(c.heading) * 4, w + 1 + i * 0.5, m.z + Math.cos(c.heading) * 4, rand(-0.6, 0.6), rand(5, 8), rand(-0.6, 0.6), rand(0.5, 0.9), rand(1.4, 2.2));
        fx.splash(Math.hypot(m.x - ship.x, m.z - ship.z) * 1.5);
      }
      if (!up) m.blown = false;
      // Now and then a humpback breaches, or a manta leaps.
      if (!m.jumpFor && up && (k.breach || k.leap) && m.depth > k.surf - 0.2 && Math.random() < dt * (k.breach || k.leap) * 0.25) { m.jumpFor = k.breach ? 2.6 : 1.4; m.jump = 0; }
      let lift = 0, pitch = sinking ? 0.35 : rising ? -0.15 : 0, roll = 0;
      if (m.jumpFor) {
        m.jump += dt;
        const t = m.jump / m.jumpFor;
        lift = Math.sin(Math.PI * t) * (k.breach ? 9 : 3);
        pitch = k.breach ? -1.1 + 1.6 * t : -0.3 + 0.6 * t;
        roll = k.breach ? t * 1.6 : Math.sin(t * 6) * 0.4;
        if (t >= 1) {
          m.jumpFor = 0;
          for (let i = 0; i < 14; i++) spray.puff(m.x + rand(-3, 3), waveHeight(waves, m.x, m.z, time) + 0.5, m.z + rand(-3, 3), rand(-3, 3), rand(3, 7), rand(-3, 3), rand(0.8, 1.6), rand(1, 1.8));
          for (let i = 0; i < 6; i++) fx.foam(m.x + rand(-5, 5), m.z + rand(-5, 5), rand(1.2, 2.2));
          fx.splash(Math.hypot(m.x - ship.x, m.z - ship.z) * 0.6);
        }
      }
      if (k.glow) {
        jellyMat.opacity = 0.2 + 0.6 * env.night;
        m.model.children.forEach((j) => { j.position.y = Math.sin(time * 1.3 + j.userData.bob) * 0.08; });
      }
      m.model.visible = m.depth > -10;
      m.model.position.set(m.x, waveHeight(waves, m.x, m.z, time) + m.depth + lift, m.z);
      m.model.rotation.set(pitch, c.heading, roll, 'YXZ');
      if (up && visible && Math.random() < dt * 1.5) fx.foam(m.x + rand(-2, 2), m.z + rand(-2, 2), rand(0.5, 1));
    }
    const d = Math.hypot(c.x - ship.x, c.z - ship.z);
    // Something seen in the distance: point the player toward it once.
    if (anyUp && !c.announced && !c.logged && !save.creatures[c.id] && d < 900 && d > logRange(c)) {
      c.announced = true;
      fx.notice('spotted', { creature: creatureById(c.id), at: c, blow: !!k.blow });
    }
    if (anyUp && !c.logged && d < logRange(c)) { c.logged = true; log(c.id); }
    return c.life <= 0 || d > 1700;
  }

  // ---- The legends --------------------------------------------------------------------
  // A legend is also a "target" for the cannon (see combat.js), with a hull that runs from 1 down to 0.
  function makeLegend(id, ship) {
    const L = {
      id, name: creatureById(id).name, faction: 'monster', legendId: id, label: creatureById(id).name,
      x: ship.x, z: ship.z, y: 0, heading: ship.heading, vx: 0, vz: 0, hull: 1, sinking: 0, gone: true,
      size: id === 'kraken' ? { half: 6.5, bow: 8, stern: -8 } : { half: 2.8, bow: 4.5, stern: -12 },
      top: 7, guns: [], reload: { port: 0, stbd: 0 }, reloadTime: 99, power: 1,
      hullMax: id === 'kraken' ? 460 : 360, phase: 'rising', t: 0, side: Math.random() < 0.5 ? 1 : -1, attackWait: 5, shiftWait: rand(22, 28), depth: -16,
      hit(damage, by) {
        if (L.sinking || L.gone) return;
        L.hull = Math.max(0, L.hull - damage / L.hullMax);
        if (by && by.faction === 'player') L.byPlayer = true;
        if (L.hull <= 0) { L.sinking = 0.001; L.phase = 'dying'; L.t = 0; fx.roar(Math.hypot(L.x - fx.ear.x, L.z - fx.ear.z), true); }
      },
    };
    const g = new THREE.Group();
    if (id === 'kraken') {
      L.body = krakenBody();
      L.arms = Array.from({ length: 6 }, (_, i) => {
        const t = tentacle(0x8a3346);
        g.add(t.root);
        return { ...t, slot: i, curl: rand(0, 6), lift: 0, strike: 0 };
      });
      g.add(L.body);
    } else {
      L.body = serpentHead();
      L.segs = Array.from({ length: 18 }, (_, i) => {
        const r = 2.3 * (1 - i / 24);
        const s = paint(new THREE.Mesh(ball), i % 2 ? 0x4fae94 : 0x3f9a84); // pale jade, so it shows against a stormy sea
        s.scale.set(r, r, r * 1.5);
        g.add(s);
        if (i % 3 === 0) { const fin = tri(0xc23a2a, [0, r * 0.8, r], [0, r * 2.2, -r * 0.4], [0, r * 0.8, -r * 1.2], true); s.add(fin); fin.scale.set(1 / r, 1 / r, 1 / (r * 1.5)); } // glowing fins, to see it by in a storm
        return s;
      });
      L.trail = [];
      L.ring = 58; L.angle = Math.atan2(ship.x - ship.x + 1, 1); L.dir = Math.random() < 0.5 ? 1 : -1;
      g.add(L.body);
    }
    applyPaint(g);
    group.add(g);
    L.group = g;
    return L;
  }

  // Where the kraken's arms rise around the ship (in the ship's own frame): along each side.
  const ARM_SPOTS = [[1, 0.65], [1, 0.05], [1, -0.55], [-1, 0.65], [-1, 0.05], [-1, -0.55]];

  function updateKraken(L, dt, time, ship, s) {
    L.t += dt;
    const ch = Math.cos(s.heading), sh = Math.sin(s.heading);
    const abeam = s.halfBeam + 26;
    const tx = s.x + ch * L.side * abeam, tz = s.z - sh * L.side * abeam;
    const follow = L.phase === 'fight' || L.phase === 'rising' ? 1 : 0;
    L.x += (tx - L.x) * Math.min(1, dt * 1.2) * follow;
    L.z += (tz - L.z) * Math.min(1, dt * 1.2) * follow;
    L.vx = s.speed * sh; L.vz = s.speed * ch;
    L.heading = s.heading;
    let want = -16, armLift = 0;
    if (L.phase === 'rising') { want = -1.5; armLift = smooth(1, 4, L.t); if (L.t > 4) { L.phase = 'fight'; L.gone = false; L.t = 0; } }
    else if (L.phase === 'fight') {
      want = -1.5; armLift = 1;
      // Every so often it lets go, sinks, and comes up on the other side.
      if ((L.shiftWait -= dt) <= 0) { L.phase = 'shift'; L.t = 0; L.gone = true; }
      if ((L.attackWait -= dt) <= 0) {
        L.attackWait = rand(4.5, 6.5);
        const arm = L.arms.filter((a) => !a.strike)[Math.floor(rand(0, 5.99))] || L.arms[0];
        arm.strike = 0.001;
      }
    } else if (L.phase === 'shift') {
      want = -16; armLift = 1 - smooth(0, 2.5, L.t);
      if (L.t > 3.5) { L.side *= -1; L.x = tx - ch * L.side * abeam * 2; L.z = tz + sh * L.side * abeam * 2; L.phase = 'rising'; L.t = 0; L.shiftWait = rand(22, 28); }
    } else if (L.phase === 'leaving' || L.phase === 'dying') {
      want = -18; armLift = 1 - smooth(0, 3, L.t); L.gone = true;
      if (L.phase === 'dying' && Math.random() < dt * 8) fx.foam(L.x + rand(-8, 8), L.z + rand(-8, 8), rand(1, 2.4));
      if (L.t > 6) return true;
    }
    L.depth += (want - L.depth) * Math.min(1, dt * 0.8);
    const w = waveHeight(waves, L.x, L.z, time);
    L.y = w + L.depth + 2;
    L.body.position.set(L.x, w + L.depth, L.z);
    L.body.rotation.set(-0.25 + Math.sin(time * 0.7) * 0.05, s.heading + (L.side > 0 ? -Math.PI / 2 : Math.PI / 2), 0, 'YXZ');
    // The arms: rising out of the sea around the ship, writhing, and now and then one slams down on her.
    for (const a of L.arms) {
      const [side, along] = ARM_SPOTS[a.slot];
      const lz = along > 0 ? s.bow * along : -s.stern * along;
      const ax = s.x + ch * side * (s.halfBeam + 1.6) + sh * lz, az = s.z - sh * side * (s.halfBeam + 1.6) + ch * lz;
      a.root.position.set(ax, waveHeight(waves, ax, az, time) - 1.5 - (1 - armLift) * 14, az);
      a.root.rotation.set(0, s.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
      let lean = 0.15, curl = 0.12;
      if (a.strike) {
        a.strike += dt;
        if (a.strike < 0.9) { lean = -0.25 * (a.strike / 0.9); curl = 0.05; } // rears up and back
        else if (a.strike < 1.25) {
          lean = 0.5 + 1.2 * ((a.strike - 0.9) / 0.35); curl = 0.2; // whips over onto the deck
          if (!a.landed) {
            a.landed = true;
            fx.hitShip(8, L);
            fx.crunch(10);
            for (let i = 0; i < 6; i++) spray.puff(ax, waveHeight(waves, ax, az, time) + 1, az, rand(-2, 2), rand(3, 6), rand(-2, 2), rand(0.6, 1.2), 1.2);
          }
        } else if (a.strike < 2.6) { lean = 1.7 - 1.55 * ((a.strike - 1.25) / 1.35); curl = 0.2 - 0.08 * ((a.strike - 1.25) / 1.35); }
        else { a.strike = 0; a.landed = false; }
      }
      a.joints.forEach((j, i) => { j.rotation.x = (i === 0 ? lean : 0) + curl + Math.sin(time * 1.8 + a.curl + i * 0.55) * 0.09; });
    }
    if (L.phase === 'fight' && Math.random() < dt * 2) fx.foam(L.x + rand(-6, 6), L.z + rand(-6, 6), rand(1, 1.8));
    return false;
  }

  function updateSerpent(L, dt, time, ship, s) {
    L.t += dt;
    let want = -2.5;
    if (L.phase === 'rising') { if (L.t > 2.5) { L.phase = 'fight'; L.gone = false; L.t = 0; } }
    else if (L.phase === 'fight') {
      // It circles the ship at a distance, and every few seconds lunges in to strike her side.
      if ((L.attackWait -= dt) <= 0 && !L.lunge) { L.lunge = 0.001; L.attackWait = rand(7, 9.5); }
      if (L.lunge) {
        L.lunge += dt;
        L.ring = L.lunge < 1.4 ? 58 - (58 - s.halfBeam - 5) * smooth(0, 1.4, L.lunge) : s.halfBeam + 5 + (58 - s.halfBeam - 5) * smooth(1.8, 3.6, L.lunge);
        if (L.lunge > 1.4 && !L.struckShip) { L.struckShip = true; fx.hitShip(8, L); fx.crunch(8); fx.roar(20); }
        if (L.lunge > 3.6) { L.lunge = 0; L.struckShip = false; L.ring = 58; }
      }
    } else if (L.phase === 'leaving' || L.phase === 'dying') {
      want = -16; L.gone = true;
      if (L.phase === 'dying' && Math.random() < dt * 8) fx.foam(L.x + rand(-6, 6), L.z + rand(-6, 6), rand(1, 2));
      if (L.t > 6) return true;
    }
    L.angle += L.dir * (L.lunge ? 0.05 : 0.32) * dt;
    const tx = s.x + Math.cos(L.angle) * L.ring, tz = s.z + Math.sin(L.angle) * L.ring;
    const dx = tx - L.x, dz = tz - L.z, dist = Math.hypot(dx, dz), step = Math.min(dist, (L.lunge ? 22 : 13) * dt);
    if (dist > 0.01) { L.x += (dx / dist) * step; L.z += (dz / dist) * step; L.heading = Math.atan2(dx, dz); }
    L.vx = dist > 0.01 ? (dx / dist) * step / dt : 0; L.vz = dist > 0.01 ? (dz / dist) * step / dt : 0;
    L.depth += (want - L.depth) * Math.min(1, dt * 0.8);
    const w = waveHeight(waves, L.x, L.z, time);
    L.y = w + L.depth + 3;
    L.body.position.set(L.x, w + L.depth + 6, L.z);
    L.body.rotation.set(-0.2, L.heading, 0, 'YXZ');
    // The body follows the path the head has taken, rising and falling in great coils.
    const last = L.trail[0];
    if (!last || Math.hypot(last.x - L.x, last.z - L.z) > 0.8) { L.trail.unshift({ x: L.x, z: L.z }); if (L.trail.length > 120) L.trail.pop(); }
    L.segs.forEach((seg, i) => {
      const p = L.trail[Math.min(L.trail.length - 1, 2 + i * 3)] || { x: L.x, z: L.z };
      const q = L.trail[Math.min(L.trail.length - 1, 4 + i * 3)] || p;
      seg.position.set(p.x, waveHeight(waves, p.x, p.z, time) + L.depth + 2.4 + 3 * Math.sin(i * 0.75 - time * 2.4), p.z);
      seg.rotation.y = Math.atan2(p.x - q.x, p.z - q.z);
    });
    if (Math.random() < dt * 4) fx.foam(L.x + rand(-2, 2), L.z + rand(-2, 2), rand(0.8, 1.5));
    return false;
  }

  function endLegend() {
    group.remove(legend.group);
    const L = legend;
    legend = null;
    return L;
  }

  return {
    group, active,
    get legend() { return legend; },
    log,
    // Put an animal out by name, `d` metres ahead of `ship` (for testing).
    spawnAhead(id, ship, d = 200) {
      return spawn(id, ship, { x: ship.x + Math.sin(ship.heading) * d, z: ship.z + Math.cos(ship.heading) * d });
    },
    // Call up a legend beside the ship at once (for testing).
    summon(id, ship) {
      if (legend) endLegend();
      legend = makeLegend(id, ship);
      if (id === 'serpent') { legend.x = ship.x + 70; legend.z = ship.z; }
      fx.notice('legend', { legend });
      return legend;
    },
    // Each frame. `world`: { ship (state), atSea, env, storm (0 to 1), stormId }. Returns 'legendGone' when a legend
    // has left or died (so the cannon targets can be rebuilt), or null.
    update(dt, time, s, world) {
      const env = world.env;
      const logRange = (c) => creatureById(c.id).range * (hasReward('spyglass') ? 1.6 : 1);
      // Animals.
      if (world.atSea && !legend && (wait -= dt) <= 0) {
        wait = rand(45, 90);
        if (active.length < 2) trySpawn(s, env);
      }
      for (let i = active.length - 1; i >= 0; i--) if (updateAnimal(active[i], dt, time, s, env, logRange)) despawn(active[i]);
      sprayColor.copy(env.foam);
      spray.update(dt, sprayColor);

      // The kraken: sail into The Deep and, after a little while, it rises.
      const nowInDeep = Math.hypot(s.x - DEEP.x, s.z - DEEP.z) < DEEP.r;
      if (nowInDeep !== inDeep) { inDeep = nowInDeep; deepTimer = rand(6, 10); if (inDeep) fx.notice('deep', {}); }
      if (inDeep && world.atSea && !legend && !save.legends.kraken && (deepTimer -= dt) <= 0) {
        legend = makeLegend('kraken', s);
        legend.x = s.x + Math.cos(s.heading) * legend.side * 60; legend.z = s.z - Math.sin(s.heading) * legend.side * 60;
        fx.roar(40);
        fx.notice('legend', { legend });
      }
      // The serpent: in a storm far from home, once a storm, it may come.
      if (world.atSea && !legend && !save.legends.serpent && world.storm > 0.5 && world.stormId && !world.stormId.serpentRolled) {
        world.stormId.serpentRolled = true;
        const far = Math.hypot(s.x - 250, s.z - 60) > 2000;
        if (far && Math.random() < 0.6) {
          legend = makeLegend('serpent', s);
          legend.angle = rand(0, 6.28);
          legend.x = s.x + Math.cos(legend.angle) * 160; legend.z = s.z + Math.sin(legend.angle) * 160;
          fx.roar(80);
          fx.notice('legend', { legend });
        }
      }
      if (!legend) return null;
      const L = legend;
      // It gives up if you get well away from it, go ashore, or sink; the serpent also goes when the storm does.
      const d = Math.hypot(L.x - s.x, L.z - s.z);
      if ((L.phase === 'fight' || L.phase === 'rising') && (!world.atSea || s.sinking || d > 700 || (L.id === 'serpent' && world.storm < 0.12))) { L.phase = 'leaving'; L.t = 0; fx.notice('legendLeft', { legend: L }); }
      if (L.phase === 'fight' && !L.logged) { L.logged = true; log(L.id); }
      const done = L.id === 'kraken' ? updateKraken(L, dt, time, null, s) : updateSerpent(L, dt, time, null, s);
      if (L.phase === 'dying' && !L.paid) {
        L.paid = true;
        save.legends[L.id] = true;
        persist();
        fx.notice('legendBeaten', { legend: L });
      }
      if (done) { endLegend(); return 'legendGone'; }
      return null;
    },
  };
}
