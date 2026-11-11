// Islands, palms, ports and lighthouses. Everything is generated from the
// short list below, so adding an island is a one-line change.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from './materials.js';

export const MAX_ISLANDS = 12;

// x, z: position in metres (north is -z). R: radius. H: height of the hills.
// port: compass direction the dock faces, in radians (PI/2 = south).
export const ISLANDS = [
  { name: 'Port Marigold', x: 150, z: -560, R: 120, H: 38, port: Math.PI / 2 },
  { name: 'Turtle Cay', x: -300, z: -330, R: 42, H: 6 },
  { name: 'Gull Rock', x: 430, z: -190, R: 30, H: 15, lighthouse: true },
  { name: 'Isla Hibiscus', x: -650, z: -950, R: 165, H: 72 },
  { name: 'Mango Key', x: 720, z: -1000, R: 70, H: 14 },
  { name: 'Saint Avelle', x: -900, z: 320, R: 130, H: 46, port: 0 },
  { name: 'Coral Spit', x: 360, z: 620, R: 50, H: 6 },
  { name: 'Lantern Isle', x: 1120, z: 220, R: 90, H: 30, lighthouse: true },
  { name: 'The Twins', x: -210, z: 1100, R: 62, H: 20 },
  { name: 'Little Twin', x: -70, z: 1195, R: 40, H: 12 },
  { name: 'Windward Hat', x: 1500, z: -1700, R: 185, H: 95 },
];

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

ISLANDS.forEach((isl, i) => {
  const r = rng(i * 977 + 13);
  isl.p1 = r() * 6.28;
  isl.p2 = r() * 6.28;
  isl.seed = r() * 100;
});

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
function coastRadius(isl, th) {
  return isl.R * (1 + 0.18 * Math.sin(3 * th + isl.p1) + 0.1 * Math.sin(5 * th + isl.p2));
}

// "Coast coordinate": 1 at an island's centre, 0 on the shoreline, negative out at sea.
function coastOf(isl, x, z) {
  const dx = x - isl.x, dz = z - isl.z;
  const d = Math.hypot(dx, dz);
  if (d > isl.R * 2.6) return -1;
  return 1 - d / coastRadius(isl, Math.atan2(dz, dx));
}

export function islandCoast(x, z) {
  let best = -1;
  for (const isl of ISLANDS) best = Math.max(best, coastOf(isl, x, z));
  return best;
}

function heightOf(isl, x, z) {
  const t = coastOf(isl, x, z);
  if (t <= 0) return Math.max(-6, t * 14); // sea bed sloping away from the beach
  const beach = 1.6 * smooth(0, 0.12, t);
  const bumps = 0.7 + 0.6 * noise(x * 0.025 + isl.seed, z * 0.025);
  return beach + isl.H * Math.pow(smooth(0.1, 0.95, t), 1.4) * bumps;
}

// Ground height at any point in the world (negative = under water).
export function terrainHeight(x, z) {
  let best = -6;
  for (const isl of ISLANDS) best = Math.max(best, heightOf(isl, x, z));
  return best;
}

// The island whose shore is closest to (x, z).
export function nearestIsland(x, z) {
  let best = null, bt = -Infinity;
  for (const isl of ISLANDS) {
    const t = coastOf(isl, x, z);
    if (t > bt) { bt = t; best = isl; }
  }
  return best;
}

const SAND = new THREE.Color(0xf4e3b1), WET = new THREE.Color(0xd8c48e);
const GRASS_A = new THREE.Color(0x77c35c), GRASS_B = new THREE.Color(0x3d9450), ROCK = new THREE.Color(0x9d988b);

function buildTerrain(isl) {
  const RINGS = 24, SEGS = 64;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= RINGS; i++) {
    const s = Math.pow(i / RINGS, 0.9) * 1.4;
    for (let j = 0; j <= SEGS; j++) {
      const th = (j / SEGS) * Math.PI * 2;
      const d = coastRadius(isl, th) * s;
      const x = isl.x + Math.cos(th) * d, z = isl.z + Math.sin(th) * d;
      const h = heightOf(isl, x, z);
      pos.push(x, h, z);
      if (h < 0.35) c.copy(WET);
      else if (h < 2.0) c.copy(SAND);
      else if (isl.H > 28 && h > isl.H * 0.74) c.copy(ROCK);
      else c.copy(GRASS_A).lerp(GRASS_B, noise(x * 0.06, z * 0.06 + 9));
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
  const body = paint(new THREE.Mesh(new THREE.BoxGeometry(w, h + 2, d)), walls[Math.floor(r() * walls.length)], { outline: 0.09 });
  body.position.set(x, y + h / 2 - 1, z);
  body.rotation.y = rot;
  const roof = paint(new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.4, 4)), 0xc8583a, { outline: 0.09 });
  roof.position.set(x, y + h + 1.2, z);
  roof.rotation.y = rot + Math.PI / 4;
  group.add(body, roof);
}

function buildPort(group, isl, r) {
  const th = isl.port;
  const ux = Math.cos(th), uz = Math.sin(th);
  const shore = coastRadius(isl, th);
  const LEN = 34;
  const mid = shore * 0.96 + LEN / 2;
  const dock = paint(new THREE.Mesh(new THREE.BoxGeometry(LEN, 0.35, 3.6)), 0xa9794d, { outline: 0.07 });
  dock.position.set(isl.x + ux * mid, 1.25, isl.z + uz * mid);
  dock.rotation.y = -th;
  group.add(dock);
  const postGeo = new THREE.CylinderGeometry(0.22, 0.22, 5, 6);
  for (let i = 0; i < 6; i++) {
    for (const side of [-1, 1]) {
      const along = shore * 0.96 + 3 + i * 6;
      const post = paint(new THREE.Mesh(postGeo), 0x6e4a2c, { outline: 0.05 });
      post.position.set(isl.x + ux * along - uz * side * 1.7, -0.6, isl.z + uz * along + ux * side * 1.7);
      group.add(post);
    }
  }
  for (let i = 0; i < 7; i++) {
    const a = th + (r() - 0.5) * 1.5;
    const d = coastRadius(isl, a) * (0.72 + r() * 0.16);
    house(group, isl.x + Math.cos(a) * d, isl.z + Math.sin(a) * d, r() * 6.28, r);
  }
  isl.dock = { x: isl.x + ux * (shore + LEN * 0.8), z: isl.z + uz * (shore + LEN * 0.8) };
}

function buildLighthouse(group, isl) {
  const y = terrainHeight(isl.x, isl.z);
  const tower = paint(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.3, 13, 10)), 0xfbf6ea, { outline: 0.09 });
  tower.position.set(isl.x, y + 6, isl.z);
  const band = paint(new THREE.Mesh(new THREE.CylinderGeometry(1.92, 2.12, 3, 10)), 0xd9453c);
  band.position.set(isl.x, y + 5.5, isl.z);
  const lamp = paint(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 10)), 0xfff0a0, { glow: true });
  lamp.position.set(isl.x, y + 13.4, isl.z);
  const cap = paint(new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.8, 10)), 0xd9453c, { outline: 0.09 });
  cap.position.set(isl.x, y + 15.2, isl.z);
  group.add(tower, band, lamp, cap);
}

export function createIslands() {
  const group = new THREE.Group();
  const palms = [], bushes = [];

  ISLANDS.forEach((isl, i) => {
    const r = rng(i * 131 + 7);
    group.add(buildTerrain(isl));
    if (isl.port !== undefined) buildPort(group, isl, r);
    if (isl.lighthouse) buildLighthouse(group, isl);

    const nPalms = Math.min(22, Math.round(isl.R / 6));
    for (let k = 0; k < nPalms; k++) {
      const th = r() * 6.28;
      const d = coastRadius(isl, th) * (0.78 + r() * 0.16);
      const x = isl.x + Math.cos(th) * d, z = isl.z + Math.sin(th) * d;
      palms.push({ x, z, y: terrainHeight(x, z), h: 5 + r() * 3.5, lx: (r() - 0.5) * 0.5, lz: (r() - 0.5) * 0.5, rot: r() * 6.28 });
    }
    const nBush = isl.lighthouse ? 4 : Math.round(isl.R / 2.5);
    for (let k = 0; k < nBush; k++) {
      const th = r() * 6.28;
      const d = coastRadius(isl, th) * Math.sqrt(r()) * 0.74;
      const x = isl.x + Math.cos(th) * d, z = isl.z + Math.sin(th) * d;
      const y = terrainHeight(x, z);
      if (isl.H > 28 && y > isl.H * 0.7) continue; // keep the rocky peaks bare
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
