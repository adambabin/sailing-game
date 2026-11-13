// Islands, palms, ports and lighthouses. Everything is generated from the
// short list below, so adding an island is a one-line change.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from './materials.js';

export const MAX_ISLANDS = 60; // most pieces of land (islands, stacks, cays, reefs) the sea can hold

// The edges of the sea, in metres.
export const WORLD = { x0: -3500, x1: 3600, z0: -3900, z1: 3500 };

// Lamps and windows that are switched on after dark.
export const nightLights = [];

// Solid things a sailor on foot cannot walk through: { x, z, r }.
export const obstacles = [];
const keepClear = []; // spots where no tree should grow, such as doorways

export const DOCK_TOP = 1.43; // height of the dock planks above sea level

// x, z: position in metres (north is -z). R: radius. H: height of the hills.
// find: the curiosity hidden here (see finds.js): which one, and where, as a direction and a
// fraction of the way from the island's centre (0) to its shore (1).
// port: direction the dock points out to sea, in radians (0 = east, PI/2 = south).
// Shape, all optional:
//   type: 'volcano' (tall, dark, a crater on top), 'cliff' (steep grey rock), 'dark' (black sand), 'sand' (a bare bar)
//   inner, gap, gapHalf: makes a ring or crescent. Land lies between `inner` (a fraction of the radius) and the
//     shore, with a lagoon inside and an opening `gapHalf` radians either side of direction `gap`.
//   stretch, rot: stretches the island `stretch` times longer along the direction `rot`.
// The first eleven are the home waters and must stay in this order (their shapes depend on it).
export const ISLANDS = [
  { name: 'Port Marigold', x: 150, z: -560, R: 120, H: 38, port: Math.PI / 2, find: { kind: 'cannon', angle: 1.2, dist: 0.5 } },
  { name: 'Turtle Cay', x: -300, z: -330, R: 42, H: 6, find: { kind: 'turtle', angle: 4.0, dist: 0.9 } },
  { name: 'Gull Rock', x: 430, z: -190, R: 30, H: 15, lighthouse: true, find: { kind: 'nest', angle: 2.2, dist: 0.6 } },
  { name: 'Isla Hibiscus', x: -650, z: -950, R: 165, H: 72, port: 0.97, find: { kind: 'ruin', angle: 0, dist: 0 } },
  { name: 'Mango Key', x: 720, z: -1000, R: 70, H: 14, port: 2.2, find: { kind: 'swing', angle: 5.2, dist: 0.45 } },
  { name: 'Saint Avelle', x: -900, z: 320, R: 130, H: 46, port: 0, find: { kind: 'bell', angle: 0.3, dist: 0.35 } },
  { name: 'Coral Spit', x: 360, z: 620, R: 50, H: 6, find: { kind: 'wreck', angle: 3.6, dist: 0.9 } },
  { name: 'Lantern Isle', x: 1120, z: 220, R: 90, H: 30, lighthouse: true, port: 3.33, find: { kind: 'telescope', angle: 0.4, dist: 0.09 } },
  { name: 'The Twins', x: -210, z: 1100, R: 62, H: 20, find: { kind: 'chest', angle: 2.0, dist: 0.25 } },
  { name: 'Little Twin', x: -70, z: 1195, R: 40, H: 12, find: { kind: 'bottle', angle: 1.0, dist: 0.93 } },
  { name: 'Windward Hat', x: 1500, z: -1700, R: 185, H: 95, find: { kind: 'cairn', angle: 0, dist: 0 } },

  // The Cinder Isles, to the north: black sand and fire.
  { name: 'Mount Cinder', x: 150, z: -3100, R: 230, H: 150, type: 'volcano', find: { kind: 'crater', angle: 0.6, dist: 0.2 } },
  { name: 'Cinder Harbour', x: -430, z: -2640, R: 120, H: 40, type: 'dark', port: 1.25, find: { kind: 'hotspring', angle: 4.2, dist: 0.5 } },
  { name: 'Ash Cay', x: 650, z: -2700, R: 55, H: 9, type: 'dark', find: { kind: 'idol', angle: 2.0, dist: 0.5 } },
  { name: 'The Kettle', x: -1700, z: -2500, R: 110, H: 75, type: 'volcano', find: { kind: 'geyser', angle: 1.0, dist: 0.55 } },

  // The Pearl Rings, to the east: atolls and lagoons.
  { name: 'Great Ring', x: 2650, z: -500, R: 230, H: 6, inner: 0.62, gap: Math.PI, gapHalf: 0.3, find: { kind: 'clam', angle: 0.8, dist: 0.82 } },
  { name: 'Little Ring', x: 3050, z: 150, R: 125, H: 5, inner: 0.56, gap: 2.4, gapHalf: 0.34, find: { kind: 'turtle', angle: 5.4, dist: 0.8 } },
  { name: 'Ringtown', x: 2250, z: 250, R: 105, H: 28, port: Math.PI, find: { kind: 'divers', angle: 0.7, dist: 0.6 } },
  { name: 'Crescent Cay', x: 2950, z: -1150, R: 140, H: 70, inner: 0.38, gap: 2.5, gapHalf: 1.0, find: { kind: 'figurehead', angle: 5.6, dist: 0.7 } },

  // The Shallows, to the south-east: sandbars, cays and reefs.
  { name: 'Long Bar', x: 1900, z: 1900, R: 62, H: 2.5, type: 'sand', stretch: 4, rot: 0.5, find: { kind: 'whale', angle: 0.2, dist: 0.5 } },
  { name: 'Driftwood Landing', x: 2650, z: 2650, R: 100, H: 22, port: 3.9, find: { kind: 'hermit', angle: 0.9, dist: 0.55 } },
  { name: 'Heron Bar', x: 2500, z: 1600, R: 55, H: 2.5, type: 'sand', stretch: 3.2, rot: 2.2, find: { kind: 'nest', angle: 3.3, dist: 0.5 } },

  // The Stepping Stones, to the south: four islands close together.
  { name: 'First Stone', x: 150, z: 2500, R: 75, H: 22, find: { kind: 'grave', angle: 1.5, dist: 0.5 } },
  { name: 'Second Stone', x: 440, z: 2650, R: 92, H: 34, find: { kind: 'watchtower', angle: 0, dist: 0 } },
  { name: 'Third Stone', x: 250, z: 2900, R: 66, H: 16, find: { kind: 'sundial', angle: 4.4, dist: 0.45 } },
  { name: 'Last Stone', x: 640, z: 2970, R: 80, H: 26, find: { kind: 'well', angle: 2.6, dist: 0.4 } },

  // The Ironbound Coast, to the south-west: cliffs and sea stacks.
  { name: 'Ironbound', x: -2500, z: 2350, R: 220, H: 115, type: 'cliff', find: { kind: 'eyrie', angle: 0, dist: 0 } },
  { name: 'Anchor Hold', x: -1950, z: 2780, R: 115, H: 36, port: -0.9, find: { kind: 'anchor', angle: 2.4, dist: 0.5 } },
  { name: 'The Anvil', x: -2950, z: 2950, R: 85, H: 60, type: 'cliff', find: { kind: 'cave', angle: 5.0, dist: 0.6 } },

  // Santa Brisa, to the west: one great green island and her neighbours.
  { name: 'Santa Brisa', x: -2750, z: -550, R: 270, H: 85, port: 0.25, find: { kind: 'fort', angle: 1.4, dist: 0.45 } },
  { name: 'Parrot Cay', x: -2250, z: -1150, R: 70, H: 18, find: { kind: 'parrots', angle: 3.0, dist: 0.5 } },
  { name: 'Monkey Key', x: -2330, z: 60, R: 60, H: 14, find: { kind: 'hammock', angle: 1.0, dist: 0.6 } },

  // Far to the north-west, alone.
  { name: 'Farewell Atoll', x: -2750, z: -2950, R: 165, H: 5, inner: 0.6, gap: 0.7, gapHalf: 0.32, find: { kind: 'cross', angle: 3.6, dist: 0.82 } },
];

// Regions of the sea, named on the chart.
export const REGIONS = [
  { name: 'Home Waters', x: 250, z: 60 },
  { name: 'The Cinder Isles', x: 0, z: -2780 },
  { name: 'The Pearl Rings', x: 2780, z: -150 },
  { name: 'The Shallows', x: 2300, z: 2150 },
  { name: 'The Stepping Stones', x: 400, z: 2760 },
  { name: 'The Ironbound Coast', x: -2450, z: 2700 },
  { name: 'Santa Brisa', x: -2600, z: -180 },
];

// Smaller pieces of land with no name of their own: sea stacks, sandy cays, and reefs just under
// the surface (a sloop floats over a reef; a brig or galleon must go round). `near` is the island
// whose discovery puts them on your chart.
const MINOR = [
  // Stacks off Mount Cinder and the Kettle.
  { kind: 'stack', x: 470, z: -3290, R: 13, H: 30, near: 'Mount Cinder' }, { kind: 'stack', x: 520, z: -3200, R: 9, H: 20, near: 'Mount Cinder' },
  { kind: 'stack', x: -160, z: -3340, R: 15, H: 34, near: 'Mount Cinder' }, { kind: 'stack', x: -1540, z: -2440, R: 11, H: 24, near: 'The Kettle' },
  // Stacks along the Ironbound Coast.
  { kind: 'stack', x: -2230, z: 2180, R: 14, H: 36, near: 'Ironbound' }, { kind: 'stack', x: -2190, z: 2250, R: 10, H: 26, near: 'Ironbound' },
  { kind: 'stack', x: -2760, z: 2090, R: 16, H: 40, near: 'Ironbound' }, { kind: 'stack', x: -2840, z: 2800, R: 12, H: 30, near: 'The Anvil' },
  { kind: 'stack', x: -3080, z: 3070, R: 9, H: 22, near: 'The Anvil' },
  // Cays strung between the Pearl Rings.
  { kind: 'cay', x: 2380, z: -120, R: 20, H: 2.4, near: 'Ringtown' }, { kind: 'cay', x: 2520, z: 20, R: 15, H: 2.2, near: 'Ringtown' },
  { kind: 'cay', x: 2790, z: -820, R: 18, H: 2.4, near: 'Crescent Cay' }, { kind: 'cay', x: 3230, z: -260, R: 16, H: 2.2, near: 'Little Ring' },
  // Cays and reefs of the Shallows.
  { kind: 'cay', x: 2180, z: 2280, R: 18, H: 2.3, near: 'Long Bar' }, { kind: 'cay', x: 2290, z: 2400, R: 14, H: 2.2, near: 'Long Bar' },
  { kind: 'cay', x: 2890, z: 2080, R: 20, H: 2.4, near: 'Heron Bar' },
  { kind: 'reef', x: 2150, z: 1550, R: 60, stretch: 2.2, rot: 1.0, near: 'Heron Bar' }, { kind: 'reef', x: 2450, z: 2080, R: 70, stretch: 1.8, rot: 2.6, near: 'Long Bar' },
  { kind: 'reef', x: 1750, z: 2350, R: 55, stretch: 2.5, rot: 0.2, near: 'Long Bar' }, { kind: 'reef', x: 2960, z: 2380, R: 50, stretch: 2, rot: 1.6, near: 'Driftwood Landing' },
  { kind: 'reef', x: 2250, z: 2850, R: 65, stretch: 1.6, rot: 0.9, near: 'Driftwood Landing' },
  // A reef off Crescent Cay and one guarding Santa Brisa's southern shore.
  { kind: 'reef', x: 3200, z: -820, R: 55, stretch: 2, rot: 2.0, near: 'Crescent Cay' }, { kind: 'reef', x: -2500, z: -120, R: 60, stretch: 2.4, rot: 0.3, near: 'Santa Brisa' },
];

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// Every piece of land, named or not. This is what the sea, the waves and the ships' keels know about.
export const FEATURES = [...ISLANDS, ...MINOR];
FEATURES.forEach((f, i) => {
  const r = rng(i * 977 + 13);
  f.p1 = r() * 6.28;
  f.p2 = r() * 6.28;
  f.seed = r() * 100;
  f.stretch = f.stretch || 1;
  f.rot = f.rot || 0;
  f.cr = Math.cos(f.rot);
  f.sr = Math.sin(f.rot);
  f.inner = f.inner || 0;
  f.gapK = f.gapHalf > 0.6 ? 1.0 : 1.25; // how sharply the opening in a ring deepens
  f.reef = f.kind === 'reef';
  if (f.kind === 'stack') f.type = 'cliff';
  if (f.kind === 'cay') f.type = 'sand';
  f.span = f.R * f.stretch; // roughly how far the land reaches from its centre
});
export const MINOR_FEATURES = MINOR;

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Coastline radius of an island in a given direction (islands are wobbly, not round).
// For a stretched island this is measured before the stretch; use islandPoint() to get a place on the map.
export function coastRadius(isl, th) {
  return isl.R * (1 + 0.18 * Math.sin(3 * th + isl.p1) + 0.1 * Math.sin(5 * th + isl.p2));
}

// The place in the world that lies in direction `th` from an island's centre, `r` along (in the
// island's own unstretched measure). Use this, not plain cos and sin, so stretched islands work.
export function islandPoint(isl, th, r) {
  const lx = Math.cos(th) * r * isl.stretch, lz = Math.sin(th) * r;
  return { x: isl.x + lx * isl.cr - lz * isl.sr, z: isl.z + lx * isl.sr + lz * isl.cr };
}
// The direction of a place as seen from an island's centre, in the island's own measure.
export function islandAngle(isl, x, z) {
  const dx = x - isl.x, dz = z - isl.z;
  return Math.atan2(-dx * isl.sr + dz * isl.cr, (dx * isl.cr + dz * isl.sr) / isl.stretch);
}

// "Coast coordinate": positive on land, 0 on the shoreline, negative out at sea (and in a lagoon).
// The water shader in ocean.js computes exactly the same thing; change both together.
function rawCoast(f, x, z) {
  const dx = x - f.x, dz = z - f.z;
  if (Math.hypot(dx, dz) > f.R * 2.6 * f.stretch) return -1;
  const lx = (dx * f.cr + dz * f.sr) / f.stretch, lz = -dx * f.sr + dz * f.cr;
  const th = Math.atan2(lz, lx), u = Math.hypot(lx, lz) / coastRadius(f, th);
  let c = 1 - u;
  if (f.inner) {
    c = Math.min(c, u - f.inner); // the lagoon inside the ring
    const da = Math.atan2(Math.sin(th - f.gap), Math.cos(th - f.gap));
    c = Math.min(c, (Math.abs(da) - f.gapHalf) * f.gapK); // the opening into it
  }
  return c;
}
// A reef never breaks the surface, so as far as the shoreline goes it is always "just offshore".
const coastOf = (f, x, z) => (f.reef ? Math.min(rawCoast(f, x, z), -0.08) : rawCoast(f, x, z));
export const coastAt = coastOf;

export function islandCoast(x, z) {
  let best = -1;
  for (const f of FEATURES) best = Math.max(best, coastOf(f, x, z));
  return best;
}

function heightOf(isl, x, z) {
  const t = rawCoast(isl, x, z);
  if (isl.reef) return Math.max(-6, Math.min(-1.6, t * 14 - 1.6)); // a shelf 1.6 m down
  if (t <= 0) return Math.max(-6, t * 14); // sea bed sloping away from the beach
  const bumps = 0.7 + 0.6 * noise(x * 0.025 + isl.seed, z * 0.025);
  if (isl.type === 'cliff') return 1.0 * smooth(0, 0.04, t) + isl.H * Math.pow(smooth(0.02, 0.55, t), 0.7) * (0.8 + 0.3 * bumps); // straight up out of the sea
  if (isl.type === 'volcano') return 1.6 * smooth(0, 0.1, t) + isl.H * (Math.pow(smooth(0.06, 0.9, t), 1.25) * (0.85 + 0.25 * bumps) - 0.24 * smooth(0.84, 1, t)); // a cone with a crater
  const beach = 1.6 * smooth(0, 0.12, t);
  return beach + isl.H * Math.pow(smooth(0.1, 0.95, t), 1.4) * bumps;
}
export const islandHeight = heightOf;

// Ground height at any point in the world (negative = under water).
export function terrainHeight(x, z) {
  let best = -6;
  for (const f of FEATURES) best = Math.max(best, heightOf(f, x, z));
  return best;
}

// The piece of land whose shore is closest to (x, z).
export function nearestIsland(x, z) {
  let best = FEATURES[0], bt = -Infinity;
  for (const f of FEATURES) {
    const t = rawCoast(f, x, z);
    if (t > bt) { bt = t; best = f; }
  }
  return best;
}

// A coarse picture of one island: an n-by-n grid of 0 (water), 1 (shallows), 2 (beach), 3 (land) or 4 (high ground).
// Used to draw the island on the chart and on treasure maps. Worked out once and remembered.
export function islandGrid(isl, n = 56) {
  if (isl.grid && isl.grid.n === n) return isl.grid;
  const half = isl.span * 1.25, cell = (half * 2) / n, cells = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const h = heightOf(isl, isl.x - half + (i + 0.5) * cell, isl.z - half + (j + 0.5) * cell);
      cells[j * n + i] = h > Math.max(12, isl.H * 0.5) ? 4 : h > 2 ? 3 : h > 0.15 ? 2 : h > -2.4 ? 1 : 0;
    }
  }
  return (isl.grid = { n, half, cell, cells });
}

const SAND = new THREE.Color(0xf4e3b1), WET = new THREE.Color(0xd8c48e);
const GRASS_A = new THREE.Color(0x77c35c), GRASS_B = new THREE.Color(0x3d9450), ROCK = new THREE.Color(0x9d988b);
const BLACK_SAND = new THREE.Color(0x6b6259), BASALT = new THREE.Color(0x4a4541), EMBER = new THREE.Color(0xd9602a), SCRUB = new THREE.Color(0x4f7a48);
const CLIFF = new THREE.Color(0x8d8a82), CLIFF_DARK = new THREE.Color(0x6f6c66);

// The colour of the ground at a given height on a given kind of island.
function groundColor(isl, x, z, h, t, c) {
  const n = noise(x * 0.06, z * 0.06 + 9);
  if (isl.type === 'volcano') {
    if (h < 2.2) return c.copy(BLACK_SAND);
    if (t > 0.9) return c.copy(BASALT).lerp(EMBER, smooth(0.9, 1, t)); // the glow in the crater
    return h < isl.H * 0.3 ? c.copy(SCRUB).lerp(BASALT, n * 0.6) : c.copy(BASALT).lerp(BLACK_SAND, n * 0.4);
  }
  if (isl.type === 'cliff') {
    if (h < 0.8) return c.copy(WET);
    return h > isl.H * 0.78 && isl.R > 40 ? c.copy(GRASS_B).lerp(GRASS_A, n) : c.copy(CLIFF).lerp(CLIFF_DARK, n); // grass only on the top
  }
  if (isl.type === 'dark') {
    if (h < 2.0) return c.copy(BLACK_SAND);
    return isl.H > 28 && h > isl.H * 0.74 ? c.copy(BASALT) : c.copy(SCRUB).lerp(GRASS_B, n);
  }
  if (h < 0.35) return c.copy(WET);
  if (h < 2.0 || isl.type === 'sand') return c.copy(SAND);
  if (isl.H > 28 && h > isl.H * 0.74) return c.copy(ROCK);
  return c.copy(GRASS_A).lerp(GRASS_B, n);
}

function buildTerrain(isl) {
  const RINGS = isl.R > 150 ? 34 : isl.R < 25 ? 10 : 24, SEGS = isl.R < 25 ? 20 : 64;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= RINGS; i++) {
    const s = Math.pow(i / RINGS, 0.9) * 1.4;
    for (let j = 0; j <= SEGS; j++) {
      const th = (j / SEGS) * Math.PI * 2;
      const { x, z } = islandPoint(isl, th, coastRadius(isl, th) * s);
      const h = heightOf(isl, x, z);
      pos.push(x, h, z);
      groundColor(isl, x, z, h, rawCoast(isl, x, z), c);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEGS; j++) {
      const a = i * (SEGS + 1) + j, b = a + 1, d = a + SEGS + 1, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return paint(new THREE.Mesh(geo), 0xffffff, { vertexColors: true });
}

function palmCrownGeometry() {
  const leaves = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.ConeGeometry(0.6, 3.6, 4);
    g.translate(0, 1.8, 0);
    g.scale(1, 1, 0.22);
    g.rotateZ(-Math.PI / 2 - 0.38 - (i % 2) * 0.2);
    g.rotateY((i / 7) * Math.PI * 2);
    leaves.push(g);
  }
  return mergeGeometries(leaves);
}

function house(group, x, z, rot, r) {
  const walls = [0xfff4dc, 0xffe0a6, 0xf9c3ab, 0xc9e8e2, 0xfdf0c4];
  const y = terrainHeight(x, z);
  const w = 4.5 + r() * 2, d = 5 + r() * 2.5, h = 3.2 + r() * 1.2;
  const body = paint(new THREE.Mesh(new THREE.BoxGeometry(w, h + 2, d)), walls[Math.floor(r() * walls.length)]);
  body.position.set(x, y + h / 2 - 1, z);
  body.rotation.y = rot;
  const roof = paint(new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.4, 4)), 0xc8583a);
  roof.position.set(x, y + h + 1.2, z);
  roof.rotation.y = rot + Math.PI / 4;
  const win = paint(new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 1.0, 1.1)), 0xffd98a, { glow: true });
  win.position.set(x, y + h * 0.55, z);
  win.rotation.y = rot;
  nightLights.push(win);
  obstacles.push({ x, z, r: Math.max(w, d) * 0.62 });
  group.add(body, roof, win);
}

// A group placed on the ground at (x, z) and turned to face out to sea.
function plot(group, isl, th, angleOff, distFrac) {
  const a = th + angleOff;
  const d = coastRadius(isl, a) * distFrac;
  const g = new THREE.Group();
  const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
  g.position.set(x, terrainHeight(x, z), z);
  g.rotation.y = Math.atan2(Math.cos(th), Math.sin(th)); // local +z looks down the dock
  group.add(g);
  return g;
}
const box = (g, w, h, d, color, x, y, z, opts) => {
  const m = paint(new THREE.Mesh(new THREE.BoxGeometry(w, h, d)), color, opts);
  m.position.set(x, y, z);
  g.add(m);
  return m;
};
const cyl = (g, r, h, color, x, y, z, sides = 8) => {
  const m = paint(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides)), color);
  m.position.set(x, y, z);
  g.add(m);
  return m;
};

function buildTavern(g) {
  box(g, 9, 6, 7, 0xf2c58a, 0, 2, 0);
  const roof = paint(new THREE.Mesh(new THREE.ConeGeometry(7.2, 3.4, 4)), 0x8f3f2f);
  roof.position.y = 6.7;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.82);
  g.add(roof);
  box(g, 1.5, 2.6, 0.2, 0x5a3a22, 0, 1.3, 3.55); // door
  for (const x of [-2.9, 2.9]) nightLights.push(box(g, 1.3, 1.2, 0.2, 0xffd98a, x, 2.4, 3.55, { glow: true }));
  cyl(g, 0.09, 3.6, 0x5a3a22, 2.2, 1.8, 4.6); // sign post
  box(g, 1.5, 0.9, 0.12, 0xf0c05a, 1.4, 3.1, 4.6); // hanging sign
  cyl(g, 0.45, 1.0, 0x7a5233, -3.2, 0.5, 4.3);
  cyl(g, 0.45, 1.0, 0x7a5233, -2.2, 0.5, 4.5);
  return { r: 5.6, door: 6.2, top: 9.5 };
}

function buildShipwright(g) {
  for (const [x, z] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) cyl(g, 0.2, 4.4, 0x6e4a2c, x, 2.2, z, 6);
  const roof = box(g, 9.4, 0.3, 7.4, 0x9a6b42, 0, 4.5, 0);
  roof.rotation.x = -0.12;
  // A half-built boat on the stocks.
  const hull = paint(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), 0x2f6f8f, { double: true });
  hull.scale.set(1.1, 1.2, 3);
  hull.position.set(-0.6, 1.9, 0);
  g.add(hull);
  box(g, 2.6, 0.5, 0.3, 0x6e4a2c, -0.6, 0.5, -1.4);
  box(g, 2.6, 0.5, 0.3, 0x6e4a2c, -0.6, 0.5, 1.4);
  box(g, 1.2, 1.0, 2.6, 0xa9794d, 2.8, 0.5, 0); // workbench
  box(g, 0.25, 0.25, 2.4, 0xc9a06c, 2.8, 1.15, 0); // plank
  return { r: 5.2, door: 6, top: 6.4 };
}

function buildMarket(g) {
  for (const [x, color] of [[-2.6, 0xd9453c], [2.6, 0x2f8f9a]]) {
    box(g, 3.6, 0.9, 1.8, 0xa9794d, x, 0.45, 0);
    for (const [px, pz] of [[-1.7, -0.9], [1.7, -0.9], [-1.7, 0.9], [1.7, 0.9]]) cyl(g, 0.07, 3, 0x6e4a2c, x + px, 1.5, pz, 5);
    const awning = box(g, 4.2, 0.14, 2.8, color, x, 3.05, 0.2);
    awning.rotation.x = 0.16;
  }
  const fruit = new THREE.SphereGeometry(0.2, 7, 5);
  for (let i = 0; i < 9; i++) {
    const m = paint(new THREE.Mesh(fruit), i % 3 ? 0xf2a03a : 0xe8c648);
    m.position.set(-3.6 + (i % 5) * 0.45, 1.05 + (i > 4 ? 0.25 : 0), -0.2 + (i > 4 ? 0.1 : 0) + (i % 2) * 0.3);
    g.add(m);
  }
  box(g, 0.9, 0.5, 0.6, 0x7a5233, 2.1, 1.15, 0);
  box(g, 0.7, 0.7, 0.7, 0x8a6a45, 3.2, 1.25, 0.1);
  box(g, 1.1, 1.1, 1.1, 0x8a6a45, 0, 0.55, -1.6);
  return { r: 4.6, door: 4.2, top: 5 };
}

const PLACES = [
  // keeper: where the person minding the place stands, measured across and forward from its centre.
  { kind: 'tavern', label: 'Tavern', build: buildTavern, angle: 0, dist: 0.76, keeper: [-1.3, 4.5] },
  { kind: 'shipwright', label: 'Shipwright', build: buildShipwright, angle: -0.3, dist: 0.86, keeper: [1.5, 1.6] },
  { kind: 'market', label: 'Market', build: buildMarket, angle: 0.3, dist: 0.86, keeper: [0, 0.1] },
];

function buildPort(group, isl, r) {
  const th = isl.port;
  const ux = Math.cos(th), uz = Math.sin(th);
  const shore = coastRadius(isl, th);
  const LEN = 34, start = shore * 0.96;
  const mid = start + LEN / 2;
  const dock = paint(new THREE.Mesh(new THREE.BoxGeometry(LEN, 0.35, 3.6)), 0xa9794d);
  dock.position.set(isl.x + ux * mid, DOCK_TOP - 0.175, isl.z + uz * mid);
  dock.rotation.y = -th;
  group.add(dock);
  const postGeo = new THREE.CylinderGeometry(0.22, 0.22, 5, 6);
  for (let i = 0; i < 6; i++) {
    for (const side of [-1, 1]) {
      const along = start + 3 + i * 6;
      const post = paint(new THREE.Mesh(postGeo), 0x6e4a2c);
      post.position.set(isl.x + ux * along - uz * side * 1.7, -0.6, isl.z + uz * along + ux * side * 1.7);
      group.add(post);
    }
  }
  // Ordinary houses sit to either side, leaving the middle of the village for the places you can visit.
  const nHouses = Math.min(7, Math.round(isl.R / 18));
  for (let i = 0; i < nHouses; i++) {
    const a = th + (i % 2 ? 1 : -1) * (0.55 + r() * 0.45);
    const d = coastRadius(isl, a) * (0.72 + r() * 0.14);
    house(group, isl.x + Math.cos(a) * d, isl.z + Math.sin(a) * d, r() * 6.28, r);
  }
  const places = PLACES.map((p) => {
    const g = plot(group, isl, th, p.angle * Math.min(1, 110 / isl.R), p.dist);
    const size = p.build(g);
    obstacles.push({ x: g.position.x, z: g.position.z, r: size.r - 1.2 });
    keepClear.push({ x: g.position.x + ux * size.door, z: g.position.z + uz * size.door, r: 7 });
    return {
      kind: p.kind, label: p.label,
      x: g.position.x, y: g.position.y + size.top, z: g.position.z,
      doorX: g.position.x + ux * size.door, doorZ: g.position.z + uz * size.door,
      keeperX: g.position.x + uz * p.keeper[0] + ux * p.keeper[1], keeperZ: g.position.z - ux * p.keeper[0] + uz * p.keeper[1],
    };
  });
  keepClear.push({ x: isl.x + ux * (start - 5), z: isl.z + uz * (start - 5), r: 8 }); // the head of the dock
  isl.dock = { x: isl.x + ux * (start + LEN), z: isl.z + uz * (start + LEN) };
  isl.portInfo = { ux, uz, start, end: start + LEN, places };
}

// Is (x, z) on the planks of an island's dock?
export function onDock(isl, x, z) {
  const p = isl.portInfo;
  if (!p) return false;
  const dx = x - isl.x, dz = z - isl.z;
  const along = dx * p.ux + dz * p.uz, across = Math.abs(-dx * p.uz + dz * p.ux);
  return along > p.start - 1 && along < p.end && across < 1.7;
}

function buildLighthouse(group, isl) {
  const y = terrainHeight(isl.x, isl.z);
  const tower = paint(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.3, 13, 10)), 0xfbf6ea);
  tower.position.set(isl.x, y + 6, isl.z);
  const band = paint(new THREE.Mesh(new THREE.CylinderGeometry(1.92, 2.12, 3, 10)), 0xd9453c);
  band.position.set(isl.x, y + 5.5, isl.z);
  const lamp = paint(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 10)), 0xfff0a0, { glow: true });
  lamp.position.set(isl.x, y + 13.4, isl.z);
  const beam = new THREE.PointLight(0xffe2a0, 0, 260, 1.2);
  beam.position.copy(lamp.position);
  nightLights.push(beam);
  group.add(beam);
  const cap = paint(new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.8, 10)), 0xd9453c);
  cap.position.set(isl.x, y + 15.2, isl.z);
  obstacles.push({ x: isl.x, z: isl.z, r: 2.8 });
  group.add(tower, band, lamp, cap);
}

// Mount Cinder smokes. A handful of grey puffs climb out of the crater and fade.
const smoke = [];
function buildSmoke(group, isl) {
  const top = heightOf(isl, isl.x, isl.z);
  const mat = new THREE.MeshBasicMaterial({ color: 0x8a8580, transparent: true, opacity: 0.5, depthWrite: false });
  const geo = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 7; i++) {
    const puff = new THREE.Mesh(geo, mat);
    group.add(puff);
    smoke.push({ puff, phase: i / 7, x: isl.x, z: isl.z, y: top });
  }
}
// Call every frame: `wind` pushes the smoke over.
export function updateIslands(time, wind) {
  for (const s of smoke) {
    const k = (time * 0.04 + s.phase) % 1; // 0 = just risen, 1 = gone
    s.puff.position.set(s.x + wind.dx * k * 140, s.y + 6 + k * 150, s.z + wind.dz * k * 140);
    s.puff.scale.setScalar((10 + 38 * k) * (k > 0.8 ? (1 - k) / 0.2 : 1));
  }
}

export function createIslands() {
  const group = new THREE.Group();
  const palms = [], bushes = [];
  const clear = (x, z) => obstacles.every((o) => Math.hypot(x - o.x, z - o.z) > o.r + 2.5) && keepClear.every((o) => Math.hypot(x - o.x, z - o.z) > o.r);

  for (const isl of ISLANDS) {
    isl.findSpot = islandPoint(isl, isl.find.angle, coastRadius(isl, isl.find.angle) * isl.find.dist);
    keepClear.push({ ...isl.findSpot, r: 6 });
  }

  FEATURES.forEach((isl, i) => {
    if (isl.reef) return; // a reef is only a pale patch in the water; there is nothing to build
    const r = rng(i * 131 + 7);
    group.add(buildTerrain(isl));
    if (isl.port !== undefined) buildPort(group, isl, r);
    if (isl.lighthouse) buildLighthouse(group, isl);
    if (isl.name === 'Mount Cinder') buildSmoke(group, isl);

    // Palms fringe the beaches; bushes fill the green interior. Rock and bare sand grow little.
    const lush = isl.type === 'volcano' || isl.type === 'cliff' ? 0 : isl.type === 'sand' ? 0.25 : isl.type === 'dark' ? 0.6 : 1;
    const nPalms = isl.kind === 'cay' ? 2 : Math.round(Math.min(22, isl.span / 6) * lush);
    for (let k = 0; k < nPalms; k++) {
      const th = r() * 6.28;
      const { x, z } = islandPoint(isl, th, coastRadius(isl, th) * (0.78 + r() * 0.16));
      const y = terrainHeight(x, z);
      if (y > 0.7 && y < 14 && clear(x, z)) palms.push({ x, z, y, h: 5 + r() * 3.5, lx: (r() - 0.5) * 0.5, lz: (r() - 0.5) * 0.5, rot: r() * 6.28 });
    }
    const nBush = isl.lighthouse ? 4 : isl.type === 'sand' || isl.type === 'cliff' ? 0 : Math.round(Math.min(90, isl.R / 2.5) * (isl.type === 'volcano' ? 0.5 : 1));
    for (let k = 0; k < nBush; k++) {
      const th = r() * 6.28;
      const { x, z } = islandPoint(isl, th, coastRadius(isl, th) * (isl.inner ? isl.inner + (1 - isl.inner) * (0.25 + 0.5 * r()) : Math.sqrt(r()) * 0.74));
      const y = terrainHeight(x, z);
      if (y < 1.2 || (isl.H > 28 && y > isl.H * (isl.type === 'volcano' ? 0.3 : 0.7)) || !clear(x, z)) continue; // keep beaches, rocky peaks and buildings clear
      bushes.push({ x, z, y, s: 2.2 + r() * 3.2, tone: r() });
    }
  });

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();

  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.26, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunks = paint(new THREE.InstancedMesh(trunkGeo, undefined, palms.length), 0x9a7a55);
  const crowns = paint(new THREE.InstancedMesh(palmCrownGeometry(), undefined, palms.length), 0x4fae4a);
  palms.forEach((p, i) => {
    q.setFromEuler(e.set(p.lx, p.rot, p.lz));
    trunks.setMatrixAt(i, m.compose(v.set(p.x, p.y - 0.3, p.z), q, s.set(1, p.h, 1)));
    const top = new THREE.Vector3(0, p.h, 0).applyQuaternion(q).add(v);
    crowns.setMatrixAt(i, m.compose(top, q, s.set(1, 1, 1)));
  });

  const bushMesh = paint(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), undefined, bushes.length), 0xffffff);
  const tone = new THREE.Color();
  bushes.forEach((b, i) => {
    q.identity();
    bushMesh.setMatrixAt(i, m.compose(v.set(b.x, b.y + b.s * 0.45, b.z), q, s.set(b.s, b.s * 0.85, b.s)));
    bushMesh.setColorAt(i, tone.set(0x2f8a45).lerp(new THREE.Color(0x63b84f), b.tone));
  });

  for (const im of [trunks, crowns, bushMesh]) {
    im.frustumCulled = false;
    group.add(im);
  }
  return group;
}
