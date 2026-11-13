// Storms. Now and then a storm builds somewhere upwind and drifts across the sea
// with the wind: a dark wall of cloud and rain you can see coming from miles off.
// Inside it the wind howls, the seas tower, rain pours and lightning cracks.
// A ship carrying more than half sail in one is strained and slowly damaged;
// shorten sail (or anchor) and she rides it out. A storm never sinks a ship:
// its damage stops at FLOOR, so only cannon can finish her.

import * as THREE from 'three';
import { WORLD } from './islands.js';
import { hasReward } from './rewards.js';

const white = new THREE.Color(1, 1, 1);
const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const bearingName = (from, to) => POINTS[Math.round(((((Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI) + 360) % 360) / 45) % 8];

export const SAFE_SAIL = 0.5; // more sail than this in a storm strains the ship
export const FLOOR = 0.25; // a storm never takes the hull below this
const STRAIN = 0.0045; // hull lost per second at full sail in the heart of a storm

export function createStorms() {
  const group = new THREE.Group();
  group.visible = false;

  // The storm's look: a heavy mass of dark cloud, and a curtain of rain hanging beneath it.
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 1 });
  const blob = new THREE.IcosahedronGeometry(1, 2);
  const mass = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 0.95, m = new THREE.Mesh(blob, cloudMat);
    const s = rand(0.18, 0.32);
    m.scale.set(s * 1.4, s * rand(0.45, 0.7), s);
    m.position.set(Math.cos(a) * r, rand(-0.04, 0.08), Math.sin(a) * r);
    mass.add(m);
  }
  mass.position.y = 230;
  const curtainMat = new THREE.MeshBasicMaterial({ color: 0x4a515c, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.92, 1, 40, 1, true), curtainMat);
  curtain.position.y = 115;
  group.add(mass, curtain);

  // A lightning bolt: a jagged line, shown for a moment.
  const boltGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(13 * 3), 3));
  const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xf4f6ff, fog: false }));
  bolt.frustumCulled = false;
  bolt.visible = false;
  const scene = new THREE.Group();
  scene.add(group, bolt);

  let storm = null; // { x, z, r, vx, vz, age, life }
  let wait = rand(300, 700); // seconds until the next storm builds
  let flashWait = 2, boltFor = 0;
  const st = { level: 0, announced: false, inside: false, strain: false };

  // A storm builds `far` metres upwind of `near`, so the wind carries it toward them.
  function spawn(near, wind, far = rand(1800, 2600)) {
    const side = rand(-0.6, 0.6), ux = -wind.dx, uz = -wind.dz;
    let x = near.x + (ux * Math.cos(side) - uz * Math.sin(side)) * far, z = near.z + (uz * Math.cos(side) + ux * Math.sin(side)) * far;
    x = Math.min(WORLD.x1 - 200, Math.max(WORLD.x0 + 200, x));
    z = Math.min(WORLD.z1 - 200, Math.max(WORLD.z0 + 200, z));
    const speed = rand(2.6, 3.6);
    storm = { x, z, r: rand(400, 520), vx: wind.dx * speed, vz: wind.dz * speed, age: 0, life: rand(480, 660) };
    st.announced = false;
    return storm;
  }

  // How strong the storm is overall: it builds for a minute and dies away over the last one.
  const strength = () => (storm ? Math.min(1, storm.age / 60, (storm.life - storm.age) / 70) : 0);
  // How stormy it is at a point: full force in the middle, nothing beyond the edge.
  function at(x, z) {
    if (!storm) return 0;
    const d = Math.hypot(x - storm.x, z - storm.z);
    return strength() * (1 - smooth(storm.r * 0.5, storm.r * 1.1, d));
  }

  return {
    scene,
    state: st,
    get current() { return storm; },
    at,
    spawn,
    // `where`: the ship (or the sailor ashore). `fx.thunder(distance)` plays the thunder.
    // Returns notices to show: 'building', 'inside', 'passed', or null.
    update(dt, time, where, wind, env, camera, fx) {
      let notice = null;
      if (!storm) {
        if ((wait -= dt) <= 0) { spawn(where, wind); }
        env.storm += (0 - env.storm) * Math.min(1, dt * 0.5);
        env.flash = Math.max(0, env.flash - dt * 4);
        group.visible = bolt.visible = false;
        st.level = env.storm;
        if (st.inside && env.storm < 0.15) { st.inside = false; notice = 'passed'; }
        return notice;
      }
      storm.age += dt;
      storm.x += storm.vx * dt;
      storm.z += storm.vz * dt;
      const gone = storm.age > storm.life || storm.x < WORLD.x0 - 600 || storm.x > WORLD.x1 + 600 || storm.z < WORLD.z0 - 600 || storm.z > WORLD.z1 + 600;
      if (gone) { storm = null; wait = rand(700, 1300); return null; }

      // The weather where you are eases toward the storm's (the sea takes a little longer, in environment.js).
      const here = at(where.x, where.z);
      env.storm += (here - env.storm) * Math.min(1, dt * 0.6);
      st.level = env.storm;
      const d = Math.hypot(where.x - storm.x, where.z - storm.z);
      if (!st.announced && d < 2800 && strength() > 0.3) { st.announced = true; notice = 'building'; }
      if (!st.inside && env.storm > 0.45) { st.inside = true; notice = 'inside'; }
      else if (st.inside && env.storm < 0.15) { st.inside = false; notice = 'passed'; }

      // Draw it: the cloud mass turns slowly, and the whole thing fades in and out with its strength.
      const k = strength();
      group.visible = d < 6000;
      group.position.set(storm.x, 0, storm.z);
      mass.scale.set(storm.r * 1.2, storm.r * 0.9, storm.r * 1.2);
      mass.rotation.y = time * 0.01;
      curtain.scale.set(storm.r, 240, storm.r);
      cloudMat.color.setRGB(0.2 + 0.1 * (1 - env.night), 0.22 + 0.1 * (1 - env.night), 0.26 + 0.1 * (1 - env.night)).lerp(white, env.flash * 0.25);
      curtainMat.opacity = 0.5 * k;
      mass.visible = k > 0.05;

      // Lightning, more often the stronger it is. Thunder follows, later the further off it is.
      env.flash = Math.max(0, env.flash - dt * 4);
      if ((boltFor -= dt) <= 0) bolt.visible = false;
      if ((flashWait -= dt) <= 0 && k > 0.3) {
        flashWait = rand(2, 7) / k;
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * storm.r * 0.7;
        const bx = storm.x + Math.cos(a) * r, bz = storm.z + Math.sin(a) * r;
        const p = boltGeo.attributes.position.array;
        let x = bx, z = bz;
        for (let i = 0; i < 13; i++) {
          p[i * 3] = x; p[i * 3 + 1] = 230 - i * 19; p[i * 3 + 2] = z;
          x += rand(-9, 9); z += rand(-9, 9);
        }
        boltGeo.attributes.position.needsUpdate = true;
        bolt.visible = true;
        boltFor = 0.14;
        const far = Math.hypot(bx - camera.position.x, bz - camera.position.z);
        env.flash = Math.min(1, 1.2 - far / 2500);
        if (far < 4500) fx.thunder(far);
      }
      return notice;
    },
    // How much a storm strains the ship this frame. Returns the hull to lose (0 if none).
    strain(dt, s) {
      const k = at(s.x, s.z);
      st.strain = k > 0.35 && s.sail > SAFE_SAIL && s.anchorDepth < 0.9 && !s.sinking;
      if (!st.strain || s.hull <= FLOOR) return 0;
      return Math.min(s.hull - FLOOR, dt * STRAIN * (hasReward('figurehead') ? 0.5 : 1) * k * ((s.sail - SAFE_SAIL) / (1 - SAFE_SAIL)));
    },
  };
}
