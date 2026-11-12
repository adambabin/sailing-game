// The player's ships (sloop, brig, galleon): how each is built from simple shapes
// in code, and how they sail.

import * as THREE from 'three';
import { paint, applyPaint, sailPattern } from './materials.js';
import { waveHeight } from './waves.js';
import { terrainHeight, nearestIsland } from './islands.js';

// Starting colours. Hull, trim, sail and flag can be repainted at a shipwright.
export const SHIP_COLORS = {
  hull: 0x2f6f8f,
  bottom: 0x8c3b33,
  trim: 0xf2d9a0,
  deck: 0xc9a06c,
  wood: 0x7a5233,
  sail: 0xf6efdc,
  flag: 0xd9453c,
  cabin: 0xf3e6c8,
};

const KNOT = 0.5144; // metres per second in one knot
const MAX_SPEED = 8; // m/s with full sail in a fair 14-knot breeze

// How well the ship sails at each angle to the wind (degrees off the wind -> efficiency).
const POLAR = [[0, 0], [28, 0], [45, 0.55], [60, 0.8], [90, 0.97], [115, 1], [150, 0.88], [180, 0.78]];
function polar(deg) {
  for (let i = 1; i < POLAR.length; i++) {
    if (deg <= POLAR[i][0]) {
      const [a0, e0] = POLAR[i - 1], [a1, e1] = POLAR[i];
      return e0 + ((e1 - e0) * (deg - a0)) / (a1 - a0);
    }
  }
  return 0.78;
}

const Y = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

// Stretch a unit-height cylinder so it runs from point a to point b.
function setSpar(mesh, a, b) {
  tmpC.subVectors(b, a);
  const len = Math.max(tmpC.length(), 1e-4);
  mesh.position.copy(a).addScaledVector(tmpC, 0.5);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(Y, tmpC.divideScalar(len));
}
function spar(a, b, radius, color) {
  const mesh = paint(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius, 1, 8)), color);
  setSpar(mesh, a, b);
  return mesh;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- Hull shape -------------------------------------------------------------
// A hull is described by a handful of numbers (length, beam, how the deck sweeps
// up at bow and stern, how deep the keel is) and built from those.
function makeHull(sh) {
  const halfWidth = (t) => {
    const w = t < 0.35 ? sh.sternW + (1 - sh.sternW) * Math.sin((t / 0.35) * Math.PI * 0.5) : Math.pow(Math.max(0, 1 - Math.pow((t - 0.35) / 0.65, 2)), 0.75);
    return Math.max(0.02, w) * sh.beam * 0.5;
  };
  const deckY = (t) => sh.deck + sh.sheer * Math.pow(2 * t - 1, 2) * (t > 0.5 ? sh.bowF : sh.sternF);
  const keelY = (t) => -sh.draft + sh.bowRise * Math.pow(t, 5) + sh.sternRise * Math.pow(1 - t, 4);
  const tOf = (z) => (z - sh.z0) / sh.len;
  return {
    shape: sh,
    point(t, k, side, out) {
      const a = k * Math.PI * 0.5, kY = keelY(t);
      return out.set(side * halfWidth(t) * Math.pow(Math.sin(a), 0.75), kY + (deckY(t) - kY) * (1 - Math.pow(Math.cos(a), 1.4)), sh.z0 + sh.len * t);
    },
    // Height of the deck planks, and half the width of the deck, at a given z along the ship.
    deckAt: (z) => { const t = tOf(z), kY = keelY(t); return kY + (deckY(t) - kY) * (1 - Math.pow(Math.cos(0.86 * Math.PI * 0.5), 1.4)); },
    halfAt: (z) => halfWidth(tOf(z)),
  };
}

// One band of hull planking between heights k0 and k1 (0 = keel, 1 = gunwale).
function hullBand(hull, k0, k1, rows, color, part) {
  const STATIONS = 16;
  const pos = [], idx = [];
  const p = new THREE.Vector3();
  const cols = rows * 2 + 2;
  for (let i = 0; i <= STATIONS; i++) {
    for (const side of [1, -1]) {
      for (let j = 0; j <= rows; j++) {
        hull.point(i / STATIONS, k0 + ((k1 - k0) * j) / rows, side, p);
        pos.push(p.x, p.y, p.z);
      }
    }
  }
  for (let i = 0; i < STATIONS; i++) {
    for (let s = 0; s < 2; s++) {
      for (let j = 0; j < rows; j++) {
        const a = i * cols + s * (rows + 1) + j, b = a + 1, c = a + cols, d = c + 1;
        if (s === 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
  }
  // Close off the flat stern.
  const base = pos.length / 3;
  for (const side of [1, -1]) {
    for (let j = 0; j <= rows; j++) {
      hull.point(0, k0 + ((k1 - k0) * j) / rows, side, p);
      pos.push(p.x, p.y, p.z);
      pos.push(0, p.y, p.z);
    }
  }
  for (let s = 0; s < 2; s++) {
    for (let j = 0; j < rows; j++) {
      const a = base + (s * (rows + 1) + j) * 2, b = a + 1, c = a + 2, d = a + 3;
      if (s === 0) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return paint(new THREE.Mesh(geo), color, { double: true, part });
}

function deckMesh(hull) {
  const STATIONS = 16;
  const pos = [], idx = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= STATIONS; i++) {
    hull.point(i / STATIONS, 0.86, 1, p);
    pos.push(p.x, p.y, p.z, -p.x, p.y, p.z);
  }
  for (let i = 0; i < STATIONS; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return paint(new THREE.Mesh(geo), SHIP_COLORS.deck, { double: true });
}

// ---- Sails ------------------------------------------------------------------
const SAIL_N = 8;
function sailMesh(color) {
  const n = SAIL_N;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * (n + 1) * 3), 3));
  const idx = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  geo.setIndex(idx);
  const uv = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) uv.push(i / n, j / n);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mesh = paint(new THREE.Mesh(geo), color, { double: true, part: 'sail' });
  mesh.frustumCulled = false;
  return mesh;
}
function shapeSail(mesh, fn) {
  const pos = mesh.geometry.attributes.position;
  let k = 0;
  for (let j = 0; j <= SAIL_N; j++) {
    for (let i = 0; i <= SAIL_N; i++) {
      fn(i / SAIL_N, j / SAIL_N, tmpA);
      pos.setXYZ(k++, tmpA.x, tmpA.y, tmpA.z);
    }
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

// ---- The three kinds of sail ---------------------------------------------------
// Each builder adds its spars and cloth to the ship and returns a function that
// reshapes the sail every frame. `c` carries: r (how much sail is set, 0..1),
// tack (which side the wind is on), ease (how far the sails are let out),
// fill (how hard the wind presses), luff (how much they flap) and time.
const box = (parent, w, h, d, color, x, y, z, opts) => {
  const m = paint(new THREE.Mesh(new THREE.BoxGeometry(w, h, d)), color, opts);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};

// A four-cornered sail on a boom and gaff, swinging about the mast (a sloop's mainsail, a brig's spanker).
function gaffSail(parent, C, o) {
  const boom = new THREE.Group();
  boom.position.set(0, o.y, o.z);
  boom.add(spar(V(0, 0, -0.2), V(0, 0.15, -o.boom - 0.5), o.thick, C.wood));
  const gaff = spar(V(0, 1, 0), V(0, 2, -1), o.thick * 0.85, C.wood);
  const sail = sailMesh(C.sail);
  const furled = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, o.boom - 0.4, 8)), C.sail, { part: 'sail', plain: true });
  furled.rotation.x = Math.PI / 2;
  furled.position.set(0, 0.45, -o.boom / 2 - 0.3);
  boom.add(gaff, sail, furled);
  parent.add(boom);
  return (c) => {
    const r = c.r;
    boom.rotation.y = c.ease * c.tack;
    sail.visible = gaff.visible = r > 0.03;
    furled.visible = r < 0.6;
    furled.scale.set(1 - r * 0.8, 1, 1 - r * 0.8);
    if (!sail.visible) return;
    const belly = -c.tack * (0.15 + 0.85 * c.fill) * o.boom * 0.14;
    const throatY = 0.3 + o.hoist * r, peakY = throatY + o.peakRise * r, peakZ = -0.4 - o.peakBack * Math.min(1, r * 2);
    setSpar(gaff, tmpA.set(0, throatY, -0.25), tmpB.set(0, peakY + 0.1, peakZ - 0.3));
    shapeSail(sail, (u, v, out) => {
      const footZ = -0.3 - o.boom * u, headZ = -0.3 + (peakZ + 0.3) * u;
      const footY = 0.3, headY = throatY + (peakY - throatY) * u;
      const bulge = Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.1 + 0.85 * v));
      const flutter = Math.sin(c.time * 11 + u * 7 + v * 3) * 0.22 * c.luff * Math.sin(Math.PI * u);
      out.set(belly * bulge * r + flutter, footY + (headY - footY) * v, footZ + (headZ - footZ) * v);
    });
  };
}

// A three-cornered sail set forward of a mast, hoisted up a stay.
function jibSail(parent, C, o) {
  const sail = sailMesh(C.sail);
  parent.add(sail);
  return (c) => {
    const r = c.r;
    sail.visible = r > 0.03;
    if (!sail.visible) return;
    const belly = -c.tack * (0.15 + 0.85 * c.fill) * o.spread * 0.55;
    const headY = o.tack.y + (o.head.y - o.tack.y) * r, headZ = o.tack.z + (o.head.z - o.tack.z) * r;
    const clewX = -c.tack * o.spread * Math.min(1, c.ease * 2.2), clewZ = o.tack.z + (o.clewZ - o.tack.z) * Math.min(1, r * 1.5);
    shapeSail(sail, (u, v, out) => {
      const bx = clewX * u, by = o.tack.y + 0.05 * u, bz = o.tack.z + (clewZ - o.tack.z) * u;
      const bulge = Math.sin(Math.PI * u) * Math.sin(Math.PI * v * 0.9);
      const flutter = Math.sin(c.time * 12 + u * 6 + v * 4) * 0.2 * c.luff * Math.sin(Math.PI * v);
      out.set(bx - bx * v + belly * bulge * r + flutter, by + (headY - by) * v, bz + (headZ - bz) * v);
    });
  };
}

// A square sail hung from a yard across the mast. It unrolls downward from the yard, and the
// yard is braced round (swung) so the sail keeps facing the wind.
function squareSail(parent, C, o) {
  const yard = new THREE.Group();
  yard.position.set(0, o.y, o.z + 0.4);
  yard.add(spar(V(-o.w / 2 - 0.5, 0, 0), V(o.w / 2 + 0.5, 0, 0), 0.13, C.wood));
  const sail = sailMesh(C.sail);
  const furled = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, o.w, 8)), C.sail, { part: 'sail', plain: true });
  furled.rotation.z = Math.PI / 2;
  furled.position.y = -0.3;
  yard.add(sail, furled);
  parent.add(yard);
  return (c) => {
    const r = c.r;
    yard.rotation.y = -c.tack * (Math.PI / 2 - Math.min(Math.PI / 2, c.ease + 0.5)) * Math.min(1, r * 3);
    sail.visible = r > 0.03;
    furled.visible = r < 0.6;
    furled.scale.set(1 - r * 0.8, 1, 1 - r * 0.8);
    if (!sail.visible) return;
    const depth = (0.12 + 0.88 * c.fill) * o.w * 0.13 * r;
    shapeSail(sail, (u, v, out) => {
      const bulge = (1 - Math.pow(2 * u - 1, 2)) * Math.sin(Math.PI * (0.08 + 0.8 * v));
      const flutter = Math.sin(c.time * 10 + u * 8 + v * 5) * 0.3 * c.luff * Math.sin(Math.PI * v);
      out.set((u - 0.5) * o.w * (1 - 0.05 * v), -0.15 - o.h * r * v, 0.12 + depth * bulge + flutter);
    });
  };
}

// A row of cannon down each side of the deck. Returns where the port-side guns sit;
// the starboard ones mirror them.
function gunRow(m, C, hull, zs) {
  const guns = [];
  for (const z of zs) {
    const x = hull.halfAt(z) * 0.8, y = hull.deckAt(z) + 0.42;
    guns.push({ x, y, z });
    for (const side of [1, -1]) {
      const barrel = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 1.35, 8)), 0x2b2d33);
      barrel.rotation.z = (-side * Math.PI) / 2;
      barrel.position.set(side * (x + 0.25), y, z);
      m.add(barrel);
      box(m, 0.75, 0.3, 0.55, C.wood, side * (x - 0.1), y - 0.25, z);
    }
  }
  return guns;
}

// ---- The ships ------------------------------------------------------------------
// Each kind of ship: what she costs and carries, how she handles, and how to build her.
// The builder adds everything to `m` and returns the per-frame sail functions plus a few
// positions the rest of the game needs (flag, anchor, lantern, rudder).
function buildSloop(m, C) {
  const hull = makeHull({ z0: -6, len: 13, beam: 4.4, sternW: 0.66, deck: 1.25, sheer: 0.55, bowF: 1.5, sternF: 0.8, draft: 1.1, bowRise: 1.7, sternRise: 0.35 });
  m.add(hullBand(hull, 0, 0.6, 4, C.bottom), hullBand(hull, 0.6, 0.9, 3, C.hull, 'hull'), hullBand(hull, 0.9, 1, 1, C.trim, 'trim'), deckMesh(hull));
  const MAST_Z = 1.5, MAST_TOP = 15.2;
  m.add(spar(V(0, 0.9, MAST_Z), V(0, MAST_TOP, MAST_Z), 0.19, C.wood));
  m.add(spar(V(0, 1.75, 5.6), V(0, 2.6, 10.8), 0.13, C.wood));
  box(m, 2.1, 1.0, 2.2, C.cabin, 0, 1.55, -1.9); // the cabin stops short of the wheel
  box(m, 2.4, 0.16, 2.5, C.wood, 0, 2.12, -1.9);
  for (const [x, z] of [[0.9, 3.4], [-0.75, 4.1]]) {
    const barrel = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.75, 8)), C.wood);
    barrel.position.set(x, 1.45, z);
    m.add(barrel);
  }
  m.add(spar(V(0, 1.4, -5.7), V(0, 2.45, -5.7), 0.05, C.wood));
  // Standing rigging (fixed ropes holding the mast up).
  const top = V(0, MAST_TOP - 0.3, MAST_Z), lines = [];
  for (const end of [V(0, 2.6, 10.8), V(0, 1.9, -5.9), V(2.05, 1.5, 0.6), V(-2.05, 1.5, 0.6), V(2.0, 1.5, 2.2), V(-2.0, 1.5, 2.2)]) lines.push(top, end);
  m.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), ROPE));
  return {
    sails: [
      gaffSail(m, C, { y: 3.3, z: MAST_Z, boom: 6.6, hoist: 7.3, peakRise: 3.3, peakBack: 4.9, thick: 0.12 }),
      jibSail(m, C, { tack: V(0, 2.7, 10.5), head: V(0, 13.6, 1.8), clewZ: 2.8, spread: 1.5 }),
    ],
    flag: V(0, MAST_TOP - 0.2, MAST_Z), anchor: V(-1.25, 1.35, 5.2), lantern: V(0, 2.55, -5.7), rudder: V(0, -0.1, -6), rudderSize: 1,
    helm: V(0, 3.05, -4.75), // where your eyes are when you stand at the wheel
    guns: gunRow(m, C, hull, [-0.2, 2.9]), crew: [V(0.7, hull.deckAt(3.8), 3.8)],
  };
}

// Brig and galleon are both square-rigged, so they share one builder driven by a list of masts.
function buildSquareRigger(m, C, o) {
  const hull = makeHull(o.hull);
  const sh = o.hull, bowZ = sh.z0 + sh.len, sternZ = sh.z0;
  m.add(hullBand(hull, 0, 0.6, 4, C.bottom), hullBand(hull, 0.6, 0.9, 3, C.hull, 'hull'), hullBand(hull, 0.9, 1, 1, C.trim, 'trim'), deckMesh(hull));
  const sails = [], lines = [];

  // Deck furniture: raised decks at bow and stern, a hatch, a deckhouse.
  for (const d of o.decks) {
    const zc = (d.z0 + d.z1) / 2, w = Math.min(hull.halfAt(d.z0), hull.halfAt(d.z1)) * 2 * 0.93, base = Math.min(hull.deckAt(d.z0), hull.deckAt(d.z1));
    box(m, w, d.h, d.z1 - d.z0, C.hull, 0, base + d.h / 2 - 0.1, zc, { part: 'hull' });
    box(m, w + 0.3, 0.18, d.z1 - d.z0 + 0.3, C.deck, 0, base + d.h, zc);
    box(m, w + 0.34, 0.5, 0.2, C.trim, 0, base + d.h + 0.3, d.rail === 'fore' ? d.z1 : d.z0, { part: 'trim' });
    if (d.windows) for (let i = 0; i < d.windows; i++) box(m, 0.7, 0.6, 0.12, 0xffe2a0, (i - (d.windows - 1) / 2) * 1.25, base + d.h * 0.55, d.z0 - 0.05, { glow: true });
  }
  box(m, 2.2, 0.35, 2.6, C.wood, 0, hull.deckAt(o.hatchZ) + 0.18, o.hatchZ);

  // Bowsprit, then each mast with its square sails.
  const spritTip = V(0, hull.deckAt(bowZ - 1) + o.sprit * 0.32, bowZ + o.sprit * 0.9);
  m.add(spar(V(0, hull.deckAt(bowZ - 3) + 0.4, bowZ - 3), spritTip, 0.2, C.wood));
  let prevTop = spritTip, tallest = null;
  o.masts.forEach((mast, i) => {
    const foot = hull.deckAt(mast.z), top = V(0, foot + mast.h, mast.z);
    m.add(spar(V(0, foot - 0.5, mast.z), top, 0.3, C.wood));
    for (const sq of mast.sails) sails.push(squareSail(m, C, { y: foot + sq.y, z: mast.z, w: sq.w, h: sq.h }));
    if (mast.spanker) sails.push(gaffSail(m, C, { y: foot + mast.spanker.up, z: mast.z, thick: 0.15, ...mast.spanker }));
    // Stays fore and aft, and shrouds down to each side.
    lines.push(top, prevTop);
    for (const side of [1, -1]) for (const dz of [-1.2, -2.6]) lines.push(V(0, foot + mast.h * 0.72, mast.z), V(side * hull.halfAt(mast.z + dz) * 0.98, hull.deckAt(mast.z + dz) + 0.4, mast.z + dz));
    if (i === o.masts.length - 1) lines.push(top, V(0, hull.deckAt(sternZ + 1) + 1, sternZ + 0.5));
    prevTop = top;
    if (!tallest || top.y > tallest.y) tallest = top;
  });
  // Jibs between the bowsprit and the foremast.
  const fore = o.masts[0], foreFoot = hull.deckAt(fore.z);
  for (let j = 0; j < o.jibs; j++) {
    const f = 1 - j * 0.4;
    sails.push(jibSail(m, C, {
      tack: V(0, spritTip.y - (1 - f) * o.sprit * 0.3, fore.z + (spritTip.z - fore.z) * f),
      head: V(0, foreFoot + fore.h * (0.92 - j * 0.2), fore.z + 0.5), clewZ: fore.z + 1.6, spread: 1.8,
    }));
  }
  m.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), ROPE));
  m.add(spar(V(0, hull.deckAt(sternZ + 0.6), sternZ + 0.5), V(0, hull.deckAt(sternZ + 0.6) + 1.6, sternZ + 0.5), 0.06, C.wood));
  return {
    sails,
    flag: V(0, tallest.y - 0.2, tallest.z), anchor: V(-hull.halfAt(bowZ - 5) * 0.95, hull.deckAt(bowZ - 5) + 0.3, bowZ - 5),
    lantern: V(0, hull.deckAt(sternZ + 0.6) + 1.75, sternZ + 0.5), rudder: V(0, -0.2, sternZ), rudderSize: o.rudder,
    helm: V(0, hull.deckAt(o.helmZ) + o.helmUp + 1.75, o.helmZ),
    guns: gunRow(m, C, hull, o.guns), crew: o.crew.map((z, i) => V(i % 2 ? 0.9 : -0.9, hull.deckAt(z), z)),
  };
}

const BRIG = {
  hull: { z0: -10, len: 21, beam: 6.4, sternW: 0.74, deck: 2.1, sheer: 0.8, bowF: 1.4, sternF: 1.5, draft: 1.7, bowRise: 2.6, sternRise: 0.6 },
  decks: [{ z0: -9.6, z1: -5, h: 1.5, rail: 'fore', windows: 3 }],
  hatchZ: 0.5, sprit: 6.5, jibs: 2, rudder: 1.5, helmZ: -7.6, helmUp: 1.5,
  guns: [-4, -2, 1.9, 3.4, 6.2], crew: [-1.2, 2.6, 6.8], // the wheel stands on the raised deck aft. The lowest sails are cut high enough to see under from there.
  masts: [
    { z: 4.6, h: 24, sails: [{ y: 9.5, w: 10.5, h: 5.4 }, { y: 16.3, w: 8.5, h: 6.2 }, { y: 21.8, w: 6.5, h: 4.8 }] },
    { z: -3.2, h: 27, sails: [{ y: 11.5, w: 11.5, h: 6 }, { y: 18.8, w: 9.3, h: 6.6 }, { y: 24.6, w: 7, h: 5.2 }], spanker: { up: 4.4, boom: 7.2, hoist: 6.2, peakRise: 3, peakBack: 5.2 } },
  ],
};

const GALLEON = {
  hull: { z0: -14, len: 29, beam: 8.6, sternW: 0.8, deck: 3.0, sheer: 1.2, bowF: 1.3, sternF: 2.4, draft: 2.3, bowRise: 3.4, sternRise: 0.9 },
  decks: [{ z0: -13.5, z1: -7.5, h: 2.4, rail: 'fore', windows: 4 }, { z0: -13.5, z1: -10.5, h: 4.3, rail: 'fore', windows: 3 }, { z0: 6.5, z1: 11.5, h: 1.6, rail: 'aft' }],
  hatchZ: 2.2, sprit: 9, jibs: 2, rudder: 2.1, helmZ: -9.2, helmUp: 2.4,
  guns: [-6.6, -5, -3.4, -1.8, 0.6, 3.8, 5.2, 6.2], crew: [-5.5, -2.5, 0.8, 4.2, 5.8],
  masts: [
    { z: 8.8, h: 29, sails: [{ y: 13, w: 13.5, h: 7.2 }, { y: 21.5, w: 10.8, h: 7.6 }, { y: 27, w: 8, h: 5 }] },
    { z: -0.6, h: 34, sails: [{ y: 13.5, w: 15, h: 7.6 }, { y: 23, w: 12, h: 8.6 }, { y: 31, w: 9, h: 7 }] },
    { z: -9.6, h: 22, sails: [{ y: 19.6, w: 7.5, h: 6 }], spanker: { up: 6.4, boom: 6.5, hoist: 6.4, peakRise: 3.2, peakBack: 5 } },
  ],
};

// price: coins at a shipwright. hold: crates. hullMax: how much damage she can take. reload: seconds between broadsides.
// speed/turn/accel: handling. pointing: how many
// degrees further off the wind she must sail than the sloop. size: where she touches the water.
export const SHIP_TYPES = {
  sloop: {
    name: 'Sloop', blurb: 'One mast, quick to turn, sails closest to the wind.', price: 0, hold: 20,
    speed: 1, turn: 0.55, accel: 0.3, pointing: 0, heel: 0.19, draft: 1.3,
    hullMax: 100, reload: 5, top: 3, // top: how high above the water a cannonball can strike her
    size: { bow: 6, stern: -5, half: 1.9 }, cam: { dist: 34, height: 4, min: 14 }, build: buildSloop,
  },
  brig: {
    name: 'Brig', blurb: 'Two masts of square sails. Carries more than twice the cargo, turns more slowly.', price: 900, hold: 45,
    speed: 1.12, turn: 0.4, accel: 0.22, pointing: 9, heel: 0.15, draft: 1.9,
    hullMax: 220, reload: 6.5, top: 4.5,
    size: { bow: 10, stern: -9, half: 2.8 }, cam: { dist: 54, height: 7, min: 22 }, build: (m, C) => buildSquareRigger(m, C, BRIG),
  },
  galleon: {
    name: 'Galleon', blurb: 'Three masts and a high stern. Fastest with the wind behind her, a vast hold, stately in the turn.', price: 2800, hold: 90,
    speed: 1.22, turn: 0.28, accel: 0.16, pointing: 15, heel: 0.11, draft: 2.5,
    hullMax: 400, reload: 8, top: 7,
    size: { bow: 14, stern: -13, half: 3.8 }, cam: { dist: 76, height: 10, min: 30 }, build: (m, C) => buildSquareRigger(m, C, GALLEON),
  },
};

const ROPE = new THREE.LineBasicMaterial({ color: 0x3a2f28 });

export function createShip(waves) {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const C = SHIP_COLORS;

  // Parts every ship has. They are moved to the right spot when the kind of ship changes.
  const lantern = paint(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6)), 0xffe9a0, { glow: true });
  const lanternLight = new THREE.PointLight(0xffc878, 0, 30, 1.5);
  const rudder = paint(new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.9)), C.wood);
  rudder.geometry.translate(0, 0, -0.45);
  const flagGeo = new THREE.PlaneGeometry(2.4, 0.9, 8, 1);
  flagGeo.translate(1.2, 0, 0);
  const flag = paint(new THREE.Mesh(flagGeo), C.flag, { double: true, part: 'flag' });
  const flagBase = flagGeo.attributes.position.clone();
  const anchor = new THREE.Group();
  const iron = 0x3b3f47;
  anchor.add(paint(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12)), iron));
  const arms = paint(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 10, Math.PI)), iron);
  arms.rotation.z = Math.PI;
  arms.position.y = -0.15;
  anchor.add(arms);
  const ANCHOR_HOME = V(-1.25, 1.35, 5.2);
  const cable = spar(V(0, 0, 0), V(0, 1, 0), 0.045, 0x3a2f28);
  // The ship's wheel, on a post just ahead of where the helmsman stands.
  const wheelPost = new THREE.Group();
  box(wheelPost, 0.16, 1.0, 0.16, C.wood, 0, -0.5, 0);
  const wheel = new THREE.Group();
  wheel.add(paint(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 6, 16)), C.wood));
  for (let i = 0; i < 4; i++) {
    const spoke = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.12, 5)), C.wood);
    spoke.rotation.z = (i * Math.PI) / 4;
    wheel.add(spoke);
  }
  wheel.position.set(0, 0.05, -0.14);
  wheelPost.add(wheel);
  const helm = V(0, 3, -4);
  root.add(lantern, lanternLight, rudder, flag, anchor, cable, wheelPost);

  let type = SHIP_TYPES.sloop, typeId = 'sloop', model = null, rig = null, lastLook = null;

  // Swap to a different kind of ship: throw away the old model and build the new one.
  function setType(id) {
    typeId = SHIP_TYPES[id] ? id : 'sloop';
    type = SHIP_TYPES[typeId];
    if (model) {
      root.remove(model);
      model.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    model = new THREE.Group();
    rig = type.build(model, C);
    root.add(model);
    lantern.position.copy(rig.lantern);
    lanternLight.position.copy(rig.lantern).y += 0.4;
    rudder.position.copy(rig.rudder);
    rudder.scale.setScalar(rig.rudderSize);
    flag.position.copy(rig.flag);
    ANCHOR_HOME.copy(rig.anchor);
    helm.copy(rig.helm);
    wheelPost.position.set(0, rig.helm.y - 0.85, rig.helm.z + 1.45);
    state.halfBeam = type.size.half;
    state.bow = type.size.bow;
    state.stern = type.size.stern;
    if (lastLook) setLook(lastLook);
    else applyPaint(root);
  }

  const state = {
    x: 0, z: 0, heading: Math.PI, // heading: 0 = sailing toward +z (south), PI = north
    speed: 3,
    sail: 0.6, // 0 = furled, 1 = full sail
    rudder: 0, // -1 = hard to port, 1 = hard to starboard
    anchorDown: false,
    anchorDepth: 0, // 0 = stowed, 1 = on the sea bed
    tack: 1, // which side the wind is on: 1 = port, -1 = starboard (smoothed)
    tackSign: 1,
    fill: 0,
    inIrons: false,
    aground: false,
    windAngle: 90, // degrees between the bow and the wind (0 = pointing straight into it)
    relWind: 0, // signed angle of the wind relative to the bow, for the dial
    y: 0, pitch: 0, roll: 0,
    halfBeam: 1.9, bow: 6, stern: -5, // size of the current ship, for the wake and for dolphins
    hull: 1, // how sound the hull is: 1 = undamaged, 0 = sinking
    sinking: 0, // seconds since she started to go down (0 = afloat)
  };
  const ctx = { r: 0, tack: 1, ease: 0, fill: 0, luff: 0, time: 0 };

  function update(dt, time, input, wind) {
    const s = state, size = type.size;
    // --- Controls
    s.sail = THREE.MathUtils.clamp(s.sail + input.sail * dt * 0.45, 0, 1);
    s.rudder += (input.steer - s.rudder) * Math.min(1, dt * 3.5);

    const fx = Math.sin(s.heading), fz = Math.cos(s.heading); // forward
    const px = Math.cos(s.heading), pz = -Math.sin(s.heading); // port side
    const wfx = -wind.dx, wfz = -wind.dz; // direction the wind comes from
    const ahead = fx * wfx + fz * wfz, port = px * wfx + pz * wfz;
    s.windAngle = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(ahead, -1, 1)));
    s.relWind = Math.atan2(-port, ahead);
    if (Math.abs(port) > 0.12) s.tackSign = Math.sign(port);
    s.tack += (s.tackSign - s.tack) * Math.min(1, dt * 2.5);

    // --- Wind drives the ship. Square-riggers cannot point as close to the wind as the sloop.
    const eff = polar(s.windAngle - type.pointing * Math.max(0, (120 - s.windAngle) / 120));
    // Stronger wind gives more drive, with diminishing returns so a gale is fast but not absurd.
    const windRatio = wind.speed / 14;
    const windFactor = windRatio < 1 ? windRatio : Math.pow(windRatio, 0.6);
    s.inIrons = eff < 0.05 && s.sail > 0.15;
    // A holed ship is a slow ship.
    const sound = s.sinking ? 0 : 0.55 + 0.45 * s.hull;
    const target = s.anchorDepth > 0.9 ? 0 : MAX_SPEED * type.speed * (s.speedBonus || 1) * eff * s.sail * windFactor * sound;
    s.speed += (target - s.speed) * (target > s.speed ? type.accel : type.accel * 0.55) * dt;
    s.anchorDepth = THREE.MathUtils.clamp(s.anchorDepth + (s.anchorDown ? dt / 1.4 : -dt / 2), 0, 1);
    if (s.anchorDepth > 0.9) s.speed -= s.speed * Math.min(1, dt * 1.6);
    // How hard the wind presses the sails: slack in light air, bellied out taut in a blow.
    s.fill += ((eff > 0.05 ? THREE.MathUtils.clamp(wind.speed / 14, 0.25, 1.7) : 0) - s.fill) * Math.min(1, dt * 2);

    // --- Steering: the rudder needs water flowing past it to bite
    const bite = 0.22 + 0.78 * Math.min(1, Math.abs(s.speed) / 4);
    let turn = -s.rudder * type.turn * bite;
    if (s.anchorDepth > 0.9) turn = -Math.sin(s.relWind / 2) * 0.3; // swing head to wind at anchor
    s.heading += turn * dt;

    s.x += fx * s.speed * dt;
    s.z += fz * s.speed * dt;
    if (s.anchorDepth < 0.5) { // bare hull drifts slowly downwind
      s.x += wind.dx * 0.12 * dt;
      s.z += wind.dz * 0.12 * dt;
    }

    // --- Shallows: nudge the ship back to deep water rather than crashing. Bigger ships need deeper water.
    const bowX = s.x + fx * size.bow, bowZ = s.z + fz * size.bow;
    s.agroundTimer = Math.max(0, (s.agroundTimer || 0) - dt);
    if (terrainHeight(bowX, bowZ) > -type.draft || terrainHeight(s.x, s.z) > -type.draft) {
      const isl = nearestIsland(s.x, s.z);
      const ox = s.x - isl.x, oz = s.z - isl.z, ol = Math.hypot(ox, oz) || 1;
      s.x += (ox / ol) * dt * 3.5;
      s.z += (oz / ol) * dt * 3.5;
      s.speed -= s.speed * Math.min(1, dt * 3);
      s.agroundTimer = 1.5;
    }
    s.aground = s.agroundTimer > 0;

    // --- Float on the waves. A long hull bridges the small waves, so she moves less.
    const h = (dx, dz) => waveHeight(waves, s.x + fx * dz + px * dx, s.z + fz * dz + pz * dx, time);
    const hBow = h(0, size.bow), hStern = h(0, size.stern), hPort = h(size.half, 0), hStbd = h(-size.half, 0), hMid = h(0, 0);
    const k = Math.min(1, dt * 5);
    s.y += ((hBow + hStern + hPort + hStbd + 2 * hMid) / 6 - s.y) * k;
    s.pitch += (-Math.atan2(hBow - hStern, size.bow - size.stern) * 0.85 - s.pitch) * k;
    const heel = s.tack * Math.sin(THREE.MathUtils.degToRad(s.windAngle)) * s.sail * s.fill * type.heel;
    const lean = -turn * Math.min(1, s.speed / 6) * 0.12;
    s.roll += (Math.atan2(hPort - hStbd, size.half * 2) * 0.6 + heel + lean - s.roll) * Math.min(1, dt * 3);

    // A damaged ship sits lower; a sinking one rolls over and goes down.
    const low = (1 - s.hull) * 0.5 + s.sinking * s.sinking * 0.22;
    root.position.set(s.x, s.y + 0.3 - low, s.z);
    root.rotation.set(s.pitch - Math.min(0.35, s.sinking * 0.04), s.heading, s.roll + Math.min(1.1, s.sinking * 0.14));
    rudder.rotation.y = -s.rudder * 0.6;
    wheel.rotation.z = -s.rudder * 2.2;

    // --- Sails: let out further the more the wind is behind
    ctx.r = s.sail;
    ctx.tack = s.tack;
    ctx.ease = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(s.windAngle) * 0.5 - 0.1, 0.08, 1.4) * Math.min(1, s.sail * 3);
    ctx.fill = s.fill;
    ctx.luff = s.inIrons ? 1 : 0.35 * Math.max(0, 1 - wind.speed / 9); // sails flap in irons and hang slack in light air
    ctx.time = time;
    for (const shape of rig.sails) shape(ctx);

    // --- Flag streams downwind (wind as felt on deck)
    const awx = wind.dx * wind.speed * KNOT - fx * s.speed, awz = wind.dz * wind.speed * KNOT - fz * s.speed;
    flag.rotation.y = Math.atan2(-(fx * awx + fz * awz), px * awx + pz * awz);
    const fp = flagGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const x = flagBase.getX(i);
      fp.setZ(i, Math.sin(x * 3 - time * 9) * 0.1 * x);
    }
    fp.needsUpdate = true;

    // --- Anchor
    const depth = s.anchorDepth;
    anchor.position.set(ANCHOR_HOME.x - depth * 0.6, ANCHOR_HOME.y - depth * 9, ANCHOR_HOME.z + depth * 2.5);
    cable.visible = depth > 0.02;
    if (cable.visible) setSpar(cable, tmpA.set(ANCHOR_HOME.x, ANCHOR_HOME.y + 0.3, ANCHOR_HOME.z), tmpB.copy(anchor.position).setY(anchor.position.y + 0.5));
  }

  // Repaint the ship. `look` holds colours for hull, trim, sail and flag, plus a sail pattern.
  function setLook(look) {
    lastLook = look;
    const map = look.pattern && look.pattern !== 'plain' ? sailPattern(look.pattern, look.flag) : null;
    root.traverse((o) => {
      const p = o.userData.paint;
      if (!p || !p.part) return;
      p.color = look[p.part];
      if (p.part === 'sail' && !p.plain) p.map = map; // rolled-up sails stay plain
    });
    applyPaint(root);
  }

  setType('sloop');

  return {
    root,
    state,
    update,
    setLook,
    setType,
    lanternLight,
    helm,
    get guns() { return rig.guns; },
    get crewSpots() { return rig.crew; },
    get type() { return type; },
    get typeId() { return typeId; },
    get knots() {
      return state.speed / KNOT;
    },
  };
}

// A ship for someone else to sail (merchants, navy, pirates). She is built exactly like the
// player's, but her sails are set once and left alone, which is far cheaper to draw.
export function buildNpcModel(typeId, look) {
  const type = SHIP_TYPES[typeId];
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const rig = type.build(group, SHIP_COLORS);
  const flagGeo = new THREE.PlaneGeometry(2.4, 0.9, 1, 1);
  flagGeo.translate(-1.2, 0, 0);
  const flag = paint(new THREE.Mesh(flagGeo), look.flag, { double: true, part: 'flag' });
  flag.position.copy(rig.flag);
  flag.rotation.y = Math.PI / 2;
  group.add(flag);
  const c = { r: 1, tack: 1, ease: 1.0, fill: 1, luff: 0, time: 0 };
  for (const shape of rig.sails) shape(c);
  group.traverse((o) => {
    const p = o.userData.paint;
    if (p && p.part && look[p.part] !== undefined) p.color = look[p.part];
    if (o.isMesh && o.frustumCulled === false) { o.geometry.computeBoundingSphere(); o.frustumCulled = true; }
  });
  applyPaint(group);
  return { group, type, guns: rig.guns };
}
