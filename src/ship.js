// The sloop: how she looks (built from simple shapes in code) and how she sails.

import * as THREE from 'three';
import { paint, applyPaint, sailPattern } from './materials.js';
import { waveHeight } from './waves.js';
import { terrainHeight, nearestIsland } from './islands.js';

// Colours you will be able to customise later.
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
const Z0 = -6, LEN = 13, BEAM = 4.4;
const halfWidth = (t) => {
  const w = t < 0.35 ? 0.66 + 0.34 * Math.sin((t / 0.35) * Math.PI * 0.5) : Math.pow(Math.max(0, 1 - Math.pow((t - 0.35) / 0.65, 2)), 0.75);
  return Math.max(0.02, w) * BEAM * 0.5;
};
const deckY = (t) => 1.25 + 0.55 * Math.pow(2 * t - 1, 2) * (t > 0.5 ? 1.5 : 0.8);
const keelY = (t) => -1.1 + 1.7 * Math.pow(t, 5) + 0.35 * Math.pow(1 - t, 4);
function hullPoint(t, k, side, out) {
  const a = k * Math.PI * 0.5;
  const kY = keelY(t);
  return out.set(side * halfWidth(t) * Math.pow(Math.sin(a), 0.75), kY + (deckY(t) - kY) * (1 - Math.pow(Math.cos(a), 1.4)), Z0 + LEN * t);
}

// One band of hull planking between heights k0 and k1 (0 = keel, 1 = gunwale).
function hullBand(k0, k1, rows, color, part) {
  const STATIONS = 16;
  const pos = [], idx = [];
  const p = new THREE.Vector3();
  const cols = rows * 2 + 2;
  for (let i = 0; i <= STATIONS; i++) {
    for (const side of [1, -1]) {
      for (let j = 0; j <= rows; j++) {
        hullPoint(i / STATIONS, k0 + ((k1 - k0) * j) / rows, side, p);
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
      hullPoint(0, k0 + ((k1 - k0) * j) / rows, side, p);
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

function deckMesh() {
  const STATIONS = 16;
  const pos = [], idx = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= STATIONS; i++) {
    const t = i / STATIONS;
    hullPoint(t, 0.86, 1, p);
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

export function createShip(waves) {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const C = SHIP_COLORS;

  root.add(hullBand(0, 0.6, 4, C.bottom), hullBand(0.6, 0.9, 3, C.hull, 'hull'), hullBand(0.9, 1, 1, C.trim, 'trim'), deckMesh());

  // Mast, bowsprit and cabin.
  const MAST_Z = 1.5, MAST_TOP = 15.2;
  root.add(spar(V(0, 0.9, MAST_Z), V(0, MAST_TOP, MAST_Z), 0.19, C.wood));
  root.add(spar(V(0, 1.75, 5.6), V(0, 2.6, 10.8), 0.13, C.wood));
  const cabin = paint(new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.0, 2.9)), C.cabin);
  cabin.position.set(0, 1.55, -2.3);
  const cabinRoof = paint(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 3.2)), C.wood);
  cabinRoof.position.set(0, 2.12, -2.3);
  root.add(cabin, cabinRoof);
  for (const [x, z] of [[0.9, 3.4], [-0.75, 4.1]]) {
    const barrel = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.75, 8)), C.wood);
    barrel.position.set(x, 1.45, z);
    root.add(barrel);
  }
  const lantern = paint(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6)), 0xffe9a0, { glow: true });
  lantern.position.set(0, 2.55, -5.7);
  root.add(lantern, spar(V(0, 1.4, -5.7), V(0, 2.45, -5.7), 0.05, C.wood));
  const lanternLight = new THREE.PointLight(0xffc878, 0, 30, 1.5);
  lanternLight.position.set(0, 2.9, -5.2);
  root.add(lanternLight);

  const rudder = paint(new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.9)), C.wood);
  rudder.geometry.translate(0, 0, -0.45);
  rudder.position.set(0, -0.1, Z0);
  root.add(rudder);

  // Standing rigging (fixed ropes holding the mast up).
  const rope = new THREE.LineBasicMaterial({ color: 0x3a2f28 });
  const top = V(0, MAST_TOP - 0.3, MAST_Z);
  const lines = [];
  for (const end of [V(0, 2.6, 10.8), V(0, 1.9, -5.9), V(2.05, 1.5, 0.6), V(-2.05, 1.5, 0.6), V(2.0, 1.5, 2.2), V(-2.0, 1.5, 2.2)]) lines.push(top, end);
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), rope));

  // Boom, gaff and mainsail swing together around the mast.
  const boom = new THREE.Group();
  boom.position.set(0, 3.3, MAST_Z);
  boom.add(spar(V(0, 0, -0.2), V(0, 0.15, -7.1), 0.12, C.wood));
  const gaff = spar(V(0, 1, 0), V(0, 2, -1), 0.1, C.wood);
  const mainsail = sailMesh(C.sail);
  const furled = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6.2, 8)), C.sail, { part: 'sail' });
  furled.rotation.x = Math.PI / 2;
  furled.position.set(0, 0.45, -3.6);
  boom.add(gaff, mainsail, furled);
  root.add(boom);

  const jib = sailMesh(C.sail);
  root.add(jib);

  // Pennant at the masthead.
  const flagGeo = new THREE.PlaneGeometry(2.4, 0.9, 8, 1);
  flagGeo.translate(1.2, 0, 0);
  const flag = paint(new THREE.Mesh(flagGeo), C.flag, { double: true, part: 'flag' });
  flag.position.set(0, MAST_TOP - 0.2, MAST_Z);
  const flagBase = flagGeo.attributes.position.clone();
  root.add(flag);

  // Anchor and its cable.
  const anchor = new THREE.Group();
  const iron = 0x3b3f47;
  anchor.add(paint(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12)), iron));
  const arms = paint(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 10, Math.PI)), iron);
  arms.rotation.z = Math.PI;
  arms.position.y = -0.15;
  anchor.add(arms);
  const ANCHOR_HOME = V(-1.25, 1.35, 5.2);
  const cable = spar(V(0, 0, 0), V(0, 1, 0), 0.045, 0x3a2f28);
  root.add(anchor, cable);

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
  };

  function update(dt, time, input, wind) {
    const s = state;
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

    // --- Wind drives the ship
    const eff = polar(s.windAngle);
    // Stronger wind gives more drive, with diminishing returns so a gale is fast but not absurd.
    const windRatio = wind.speed / 14;
    const windFactor = windRatio < 1 ? windRatio : Math.pow(windRatio, 0.6);
    s.inIrons = eff < 0.05 && s.sail > 0.15;
    const target = s.anchorDepth > 0.9 ? 0 : MAX_SPEED * (s.speedBonus || 1) * eff * s.sail * windFactor;
    s.speed += (target - s.speed) * (target > s.speed ? 0.3 : 0.16) * dt;
    s.anchorDepth = THREE.MathUtils.clamp(s.anchorDepth + (s.anchorDown ? dt / 1.4 : -dt / 2), 0, 1);
    if (s.anchorDepth > 0.9) s.speed -= s.speed * Math.min(1, dt * 1.6);
    // How hard the wind presses the sails: slack in light air, bellied out taut in a blow.
    s.fill += ((eff > 0.05 ? THREE.MathUtils.clamp(wind.speed / 14, 0.25, 1.7) : 0) - s.fill) * Math.min(1, dt * 2);

    // --- Steering: the rudder needs water flowing past it to bite
    const bite = 0.22 + 0.78 * Math.min(1, Math.abs(s.speed) / 4);
    let turn = -s.rudder * 0.55 * bite;
    if (s.anchorDepth > 0.9) turn = -Math.sin(s.relWind / 2) * 0.3; // swing head to wind at anchor
    s.heading += turn * dt;

    s.x += fx * s.speed * dt;
    s.z += fz * s.speed * dt;
    if (s.anchorDepth < 0.5) { // bare hull drifts slowly downwind
      s.x += wind.dx * 0.12 * dt;
      s.z += wind.dz * 0.12 * dt;
    }

    // --- Shallows: nudge the ship back to deep water rather than crashing
    const bowX = s.x + fx * 6, bowZ = s.z + fz * 6;
    s.agroundTimer = Math.max(0, (s.agroundTimer || 0) - dt);
    if (terrainHeight(bowX, bowZ) > -1.3 || terrainHeight(s.x, s.z) > -1.3) {
      const isl = nearestIsland(s.x, s.z);
      const ox = s.x - isl.x, oz = s.z - isl.z, ol = Math.hypot(ox, oz) || 1;
      s.x += (ox / ol) * dt * 3.5;
      s.z += (oz / ol) * dt * 3.5;
      s.speed -= s.speed * Math.min(1, dt * 3);
      s.agroundTimer = 1.5;
    }
    s.aground = s.agroundTimer > 0;

    // --- Float on the waves
    const h = (dx, dz) => waveHeight(waves, s.x + fx * dz + px * dx, s.z + fz * dz + pz * dx, time);
    const hBow = h(0, 6), hStern = h(0, -5), hPort = h(1.9, 0), hStbd = h(-1.9, 0), hMid = h(0, 0);
    const k = Math.min(1, dt * 5);
    s.y += ((hBow + hStern + hPort + hStbd + 2 * hMid) / 6 - s.y) * k;
    s.pitch += (-Math.atan2(hBow - hStern, 11) * 0.85 - s.pitch) * k;
    const heel = s.tack * Math.sin(THREE.MathUtils.degToRad(s.windAngle)) * s.sail * s.fill * 0.19;
    const lean = -turn * Math.min(1, s.speed / 6) * 0.12;
    s.roll += (Math.atan2(hPort - hStbd, 3.8) * 0.6 + heel + lean - s.roll) * Math.min(1, dt * 3);

    root.position.set(s.x, s.y + 0.3, s.z);
    root.rotation.set(s.pitch, s.heading, s.roll);
    rudder.rotation.y = -s.rudder * 0.6;

    // --- Sails: the boom swings out further the more the wind is behind
    const r = s.sail;
    const ease = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(s.windAngle) * 0.5 - 0.1, 0.08, 1.4) * Math.min(1, r * 3);
    boom.rotation.y = ease * s.tack;
    const luff = s.inIrons ? 1 : 0.35 * Math.max(0, 1 - wind.speed / 9); // sails flap in irons and hang slack in light air
    const belly = -s.tack * (0.15 + 0.85 * s.fill);

    mainsail.visible = gaff.visible = r > 0.03;
    furled.visible = r < 0.6;
    furled.scale.set(1 - r * 0.8, 1, 1 - r * 0.8);
    if (mainsail.visible) {
      const throatY = 0.3 + 7.3 * r, peakY = throatY + 3.3 * r, peakZ = -0.4 - 4.9 * Math.min(1, r * 2);
      setSpar(gaff, tmpA.set(0, throatY, -0.25), tmpB.set(0, peakY + 0.1, peakZ - 0.3));
      shapeSail(mainsail, (u, v, out) => {
        const footZ = -0.3 - 6.6 * u, headZ = -0.3 + (peakZ + 0.3) * u;
        const footY = 0.3, headY = throatY + (peakY - throatY) * u;
        const bulge = Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.1 + 0.85 * v));
        const flutter = Math.sin(time * 11 + u * 7 + v * 3) * 0.22 * luff * Math.sin(Math.PI * u);
        out.set(belly * bulge * 0.95 * r + flutter, footY + (headY - footY) * v, footZ + (headZ - footZ) * v);
      });
    }
    jib.visible = r > 0.03;
    if (jib.visible) {
      const tackP = tmpB.set(0, 2.7, 10.5);
      const headX = 0, headY = 2.7 + 10.9 * r, headZ = 10.5 - 8.7 * r;
      const clewX = -s.tack * 1.5 * Math.min(1, ease * 2.2), clewY = 2.75, clewZ = 10.5 - 7.7 * Math.min(1, r * 1.5);
      shapeSail(jib, (u, v, out) => {
        const bx = tackP.x + (clewX - tackP.x) * u, by = tackP.y + (clewY - tackP.y) * u, bz = tackP.z + (clewZ - tackP.z) * u;
        const bulge = Math.sin(Math.PI * u) * Math.sin(Math.PI * v * 0.9);
        const flutter = Math.sin(time * 12 + u * 6 + v * 4) * 0.2 * luff * Math.sin(Math.PI * v);
        out.set(bx + (headX - bx) * v + belly * bulge * 0.8 * r + flutter, by + (headY - by) * v, bz + (headZ - bz) * v);
      });
    }

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
    anchor.position.set(ANCHOR_HOME.x - depth * 0.6, ANCHOR_HOME.y - depth * 8, ANCHOR_HOME.z + depth * 2.5);
    cable.visible = depth > 0.02;
    if (cable.visible) setSpar(cable, tmpA.set(ANCHOR_HOME.x, ANCHOR_HOME.y + 0.3, ANCHOR_HOME.z), tmpB.copy(anchor.position).setY(anchor.position.y + 0.5));
  }

  // Repaint the ship. `look` holds colours for hull, trim, sail and flag, plus a sail pattern.
  function setLook(look) {
    const map = look.pattern && look.pattern !== 'plain' ? sailPattern(look.pattern, look.flag) : null;
    root.traverse((o) => {
      const p = o.userData.paint;
      if (!p || !p.part) return;
      p.color = look[p.part];
      if (p.part === 'sail' && o !== furled) p.map = map;
    });
    applyPaint(root);
  }

  return {
    root,
    state,
    update,
    setLook,
    lanternLight,
    get knots() {
      return state.speed / KNOT;
    },
  };
}
