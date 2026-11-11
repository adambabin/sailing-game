// Life at sea: gulls wheeling near land, dolphins that come to play at the bow,
// flying fish, and other ships going about their business in the distance.

import * as THREE from 'three';
import { paint, applyPaint } from './materials.js';
import { waveHeight } from './waves.js';
import { ISLANDS, islandCoast, nightLights } from './islands.js';

const rand = (a, b) => a + Math.random() * (b - a);

// ---- Gulls ------------------------------------------------------------------------
function buildGull() {
  const g = new THREE.Group();
  const body = paint(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 5)), 0xffffff);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const wings = [1, -1].map((side) => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.22), new THREE.Vector3(0, 0, -0.2), new THREE.Vector3(side * 1.25, 0, -0.05)]);
    geo.computeVertexNormals();
    const w = paint(new THREE.Mesh(geo), 0xeef1f4, { double: true });
    g.add(w);
    return w;
  });
  g.scale.setScalar(1.25);
  return { group: g, wings, angle: rand(0, 6.28), radius: rand(14, 42), height: rand(10, 28), speed: rand(0.25, 0.45) * (Math.random() < 0.5 ? -1 : 1), flap: rand(0, 6) };
}

// ---- Dolphins ---------------------------------------------------------------------
function buildDolphin() {
  const g = new THREE.Group();
  const grey = 0x6d8799;
  const body = paint(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8)), grey);
  body.scale.set(0.3, 0.34, 1.25);
  const snout = paint(new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 6)), grey);
  snout.rotation.x = Math.PI / 2;
  snout.position.z = 1.35;
  const fin = paint(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 4)), grey);
  fin.scale.x = 0.25;
  fin.rotation.x = -0.5;
  fin.position.set(0, 0.42, -0.1);
  const tail = paint(new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.5, 4)), grey);
  tail.scale.z = 0.2;
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -1.4;
  g.add(body, snout, fin, tail);
  return { group: g, x: 0, z: 0, phase: 0, wasUp: false };
}

// ---- Other ships ------------------------------------------------------------------
// A square sail: a sheet bowed forward by the wind, hung from a yard.
function squareSail(g, color, w, h, y, z) {
  const geo = new THREE.PlaneGeometry(w, h, 6, 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / (w / 2), v = pos.getY(i) / (h / 2);
    pos.setZ(i, (1 - u * u) * (1 - v * v * 0.5) * w * 0.17);
  }
  geo.computeVertexNormals();
  const sail = paint(new THREE.Mesh(geo), color, { double: true });
  sail.position.set(0, y, z + 0.3);
  const yard = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, w + 1, 6)), 0x5a3e26);
  yard.rotation.z = Math.PI / 2;
  yard.position.set(0, y + h / 2, z + 0.25);
  g.add(sail, yard);
}

function buildMerchant(hullColor, sailColor) {
  const g = new THREE.Group();
  const hull = paint(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), hullColor, { double: true });
  hull.scale.set(3.3, 4.2, 12.5);
  hull.position.y = 2.6;
  const deck = paint(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.2, 14)), 0xc9a06c);
  deck.scale.set(3.25, 1, 12.4);
  deck.position.y = 2.5;
  const rail = paint(new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.9, 5)), hullColor);
  rail.position.set(0, 3.3, -8.2);
  const sprit = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 8, 6)), 0x5a3e26);
  sprit.rotation.x = Math.PI / 2 - 0.25;
  sprit.position.set(0, 4.2, 13.5);
  g.add(hull, deck, rail, sprit);
  for (const [z, h] of [[4.5, 22], [-3.2, 25]]) {
    const mast = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, h, 6)), 0x5a3e26);
    mast.position.set(0, h / 2 + 2.5, z);
    g.add(mast);
    squareSail(g, sailColor, 11.5, 8.5, 2.5 + h * 0.36, z);
    squareSail(g, sailColor, 9, 7, 2.5 + h * 0.74, z);
  }
  // A jib out to the bowsprit.
  const jibGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 5.2, 16.5), new THREE.Vector3(0, 20, 5), new THREE.Vector3(0.9, 5.6, 6.5)]);
  jibGeo.computeVertexNormals();
  g.add(paint(new THREE.Mesh(jibGeo), sailColor, { double: true }));
  const lamp = paint(new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6)), 0xffd98a, { glow: true });
  lamp.position.set(0, 5.4, -10.6);
  nightLights.push(lamp);
  g.add(lamp);
  g.rotation.order = 'YXZ';
  return g;
}

// A random spot of open water, well clear of every island.
function openWater() {
  for (let i = 0; i < 40; i++) {
    const x = rand(-1700, 2000), z = rand(-2200, 1600);
    if (islandCoast(x, z) < -0.95) return { x, z };
  }
  return { x: 0, z: 300 };
}

// `fx` supplies foam(x, z, size) and splash() so wildlife can disturb the water.
export function createWildlife(waves, fx) {
  const group = new THREE.Group();

  const gulls = Array.from({ length: 7 }, buildGull);
  const flock = { x: 0, z: 0, placed: false };
  gulls.forEach((b) => group.add(b.group));

  const dolphins = Array.from({ length: 3 }, buildDolphin);
  dolphins.forEach((d) => { d.group.visible = false; group.add(d.group); });
  const pod = { active: false, wait: rand(25, 50), time: 0, side: 1 };

  const fishGeo = new THREE.SphereGeometry(1, 6, 4);
  const fish = Array.from({ length: 5 }, () => {
    const m = paint(new THREE.Mesh(fishGeo), 0xc9d8e6);
    m.scale.set(0.07, 0.1, 0.32);
    m.visible = false;
    group.add(m);
    return { mesh: m, t: 2, x: 0, z: 0, dx: 0, dz: 0, delay: 0 };
  });
  let fishWait = rand(8, 16);

  const looks = [[0x5a3a2a, 0xf1e8d2], [0x2b3a4e, 0xe9dcc0], [0x6e2f2a, 0xf4efe2]];
  const merchants = looks.map(([hullColor, sailColor], i) => {
    const mesh = buildMerchant(hullColor, sailColor);
    group.add(mesh);
    const start = openWater();
    return { mesh, x: start.x, z: start.z, heading: rand(0, 6.28), goal: openWater(), speed: 3.2 + i * 0.5, bob: rand(0, 6) };
  });

  applyPaint(group);

  function update(dt, time, ship, env, camera) {
    const fxs = Math.sin(ship.heading), fzs = Math.cos(ship.heading);

    // --- Gulls keep to the nearest island, and come out to circle a ship that sails close.
    let near = ISLANDS[0], nd = Infinity;
    for (const isl of ISLANDS) {
      const d = Math.hypot(ship.x - isl.x, ship.z - isl.z) - isl.R;
      if (d < nd) { nd = d; near = isl; }
    }
    const toShip = Math.hypot(ship.x - near.x, ship.z - near.z) || 1;
    const tx = nd < 280 ? ship.x : near.x + ((ship.x - near.x) / toShip) * near.R;
    const tz = nd < 280 ? ship.z : near.z + ((ship.z - near.z) / toShip) * near.R;
    if (!flock.placed || Math.hypot(tx - flock.x, tz - flock.z) > 900) { flock.x = tx; flock.z = tz; flock.placed = true; }
    flock.x += (tx - flock.x) * Math.min(1, dt * 0.25);
    flock.z += (tz - flock.z) * Math.min(1, dt * 0.25);
    const awake = env.night < 0.5 && env.rain < 0.3;
    for (const b of gulls) {
      b.group.visible = awake;
      if (!awake) continue;
      b.angle += b.speed * dt;
      b.flap += dt * 7;
      const glide = Math.sin(time * 0.3 + b.radius) > 0.2; // they flap for a while, then soar
      const wing = glide ? 0.12 : Math.sin(b.flap) * 0.6;
      b.wings[0].rotation.z = wing;
      b.wings[1].rotation.z = -wing;
      const y = b.height + Math.sin(time * 0.5 + b.radius) * 2.5;
      b.group.position.set(flock.x + Math.cos(b.angle) * b.radius, y, flock.z + Math.sin(b.angle) * b.radius);
      const dir = Math.sign(b.speed);
      b.group.rotation.set(0, Math.atan2(-Math.sin(b.angle) * dir, Math.cos(b.angle) * dir), -0.3 * dir);
    }

    // --- Dolphins: now and then a pod joins the ship in open water and leaps alongside.
    const openSea = islandCoast(ship.x, ship.z) < -0.85;
    if (!pod.active) {
      pod.wait -= dt;
      if (pod.wait <= 0 && ship.speed > 2.5 && openSea && env.w < 0.75 && env.night < 0.7) {
        pod.active = true;
        pod.time = rand(22, 36);
        pod.side = Math.random() < 0.5 ? -1 : 1;
        dolphins.forEach((d, i) => {
          d.x = ship.x - fxs * 30 - fzs * pod.side * (30 + i * 4);
          d.z = ship.z - fzs * 30 + fxs * pod.side * (30 + i * 4);
          d.phase = i * 2.1;
          d.group.visible = true;
        });
      }
    } else {
      pod.time -= dt;
      const leaving = pod.time < 0 || ship.speed < 1 || !openSea;
      dolphins.forEach((d, i) => {
        // Hold station off the bow; when they lose interest they peel away to the side.
        const side = pod.side * (leaving ? 70 : ship.halfBeam + 3 + i * 2.6), ahead = leaving ? 20 : ship.bow + 4 - i * 4.5 + Math.sin(time * 0.4 + i) * 2;
        const gx = ship.x + fxs * ahead - fzs * side, gz = ship.z + fzs * ahead + fxs * side;
        const k = Math.min(1, dt * (leaving ? 0.35 : 1.4));
        const px = d.x, pz = d.z;
        d.x += (gx - d.x) * k;
        d.z += (gz - d.z) * k;
        d.phase += dt * 1.9;
        const p = d.phase % (Math.PI * 2);
        const up = p < Math.PI * 0.8; // the leap; the rest of the cycle is spent under water
        const a = p / 0.8;
        const y = waveHeight(waves, d.x, d.z, time) + (up ? Math.sin(a) * 1.5 - 0.35 : -1.1);
        d.group.position.set(d.x, y, d.z);
        d.group.rotation.set(up ? -Math.cos(a) * 0.75 : 0, Math.atan2(d.x - px, d.z - pz), 0, 'YXZ');
        if (up !== d.wasUp) {
          fx.foam(d.x, d.z, 0.7);
          fx.foam(d.x + rand(-0.6, 0.6), d.z + rand(-0.6, 0.6), 0.5);
          if (!up) fx.splash(Math.hypot(d.x - camera.position.x, d.z - camera.position.z));
        }
        d.wasUp = up;
      });
      if (leaving && (pod.time < -9 || Math.hypot(dolphins[0].x - ship.x, dolphins[0].z - ship.z) > 60)) {
        pod.active = false;
        pod.wait = rand(60, 130);
        dolphins.forEach((d) => (d.group.visible = false));
      }
    }

    // --- Flying fish skitter out of the ship's way.
    fishWait -= dt;
    if (fishWait <= 0 && ship.speed > 2 && openSea && env.night < 0.6 && env.w < 0.8) {
      fishWait = rand(9, 22);
      const cx = ship.x + fxs * rand(14, 34) - fzs * rand(-16, 16), cz = ship.z + fzs * rand(14, 34) + fxs * rand(-16, 16);
      const a = ship.heading + rand(-0.9, 0.9);
      const n = 2 + Math.floor(Math.random() * 4);
      fish.slice(0, n).forEach((f, i) => {
        f.x = cx + rand(-2, 2); f.z = cz + rand(-2, 2);
        f.dx = Math.sin(a + rand(-0.15, 0.15)); f.dz = Math.cos(a + rand(-0.15, 0.15));
        f.t = 0; f.delay = i * 0.12;
      });
    }
    for (const f of fish) {
      if (f.t >= 1) { f.mesh.visible = false; continue; }
      if (f.delay > 0) { f.delay -= dt; continue; }
      const was = f.t;
      f.t += dt / 1.1;
      const x = f.x + f.dx * 9 * f.t, z = f.z + f.dz * 9 * f.t;
      f.mesh.visible = true;
      f.mesh.position.set(x, waveHeight(waves, x, z, time) + Math.sin(Math.PI * f.t) * 1.1 - 0.05, z);
      f.mesh.rotation.set(-Math.cos(Math.PI * f.t) * 0.5, Math.atan2(f.dx, f.dz), 0, 'YXZ');
      if (was === 0 || f.t >= 1) fx.foam(x, z, 0.3);
    }

    // --- Other ships wander between random points of open sea, steering clear of land and of you.
    for (const m of merchants) {
      if (Math.hypot(m.goal.x - m.x, m.goal.z - m.z) < 120) m.goal = openWater();
      let want = Math.atan2(m.goal.x - m.x, m.goal.z - m.z);
      const ax = m.x + Math.sin(m.heading) * 170, az = m.z + Math.cos(m.heading) * 170;
      if (islandCoast(ax, az) > -0.75 || Math.hypot(ship.x - ax, ship.z - az) < 110) want = m.heading - 1.2;
      let diff = want - m.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      m.heading += THREE.MathUtils.clamp(diff, -0.12 * dt, 0.12 * dt);
      m.x += Math.sin(m.heading) * m.speed * dt;
      m.z += Math.cos(m.heading) * m.speed * dt;
      m.mesh.position.set(m.x, waveHeight(waves, m.x, m.z, time) * 0.5 + 0.3, m.z);
      m.mesh.rotation.set(Math.sin(time * 0.5 + m.bob) * 0.03, m.heading, Math.sin(time * 0.37 + m.bob) * 0.05);
    }
  }

  return { group, update, pod, merchants, dolphins };
}
