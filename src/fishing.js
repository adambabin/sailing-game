// Fishing from the ship. Slow down (or anchor), press the fish button to cast,
// wait for a bite, press again to strike, then hold the button to reel in:
// holding winds the fish in but strains the line, and when the fish runs the
// strain climbs fast, so let go until it tires. Too much strain snaps the line;
// too slack for too long and the fish shakes the hook.

import * as THREE from 'three';
import { save, persist } from './save.js';
import { REGIONS, FEATURES } from './islands.js';
import { waveHeight } from './waves.js';
import { hasReward } from './rewards.js';

const rand = (a, b) => a + Math.random() * (b - a);

// Every kind of fish. `where` says where it bites:
//   shore: true near land only, false out in open water only, missing for anywhere;
//   region: only in that named region; night / day: only then; storm: only in a gale.
// `odds` is how likely it is to take the hook when it is about. `fight` is how hard it pulls.
// `kg` is the range of weights, and `price` what a market pays for an ordinary one.
export const FISH = [
  { id: 'mackerel', name: 'Mackerel', kg: [0.4, 1.4], price: 5, odds: 10, fight: 0.35, where: {} },
  { id: 'barracuda', name: 'Barracuda', kg: [2, 12], price: 12, odds: 5, fight: 0.65, where: {} },
  { id: 'snapper', name: 'Red snapper', kg: [1, 6], price: 10, odds: 8, fight: 0.45, where: { shore: true } },
  { id: 'grouper', name: 'Grouper', kg: [3, 25], price: 15, odds: 5, fight: 0.6, where: { shore: true } },
  { id: 'mahi', name: 'Mahi-mahi', kg: [3, 15], price: 16, odds: 6, fight: 0.6, where: { shore: false, day: true } },
  { id: 'tuna', name: 'Yellowfin tuna', kg: [10, 60], price: 24, odds: 5, fight: 0.8, where: { shore: false } },
  { id: 'swordfish', name: 'Swordfish', kg: [30, 120], price: 42, odds: 2, fight: 0.95, where: { shore: false, night: true } },
  { id: 'opah', name: 'Moonfish', kg: [20, 60], price: 50, odds: 1.2, fight: 0.7, where: { night: true } },
  { id: 'wahoo', name: 'Wahoo', kg: [8, 30], price: 22, odds: 5, fight: 0.75, where: { region: 'The Cinder Isles' } },
  { id: 'pompano', name: 'Pompano', kg: [1, 4], price: 20, odds: 6, fight: 0.4, where: { region: 'The Pearl Rings', shore: true } },
  { id: 'bonefish', name: 'Bonefish', kg: [1, 6], price: 18, odds: 6, fight: 0.7, where: { region: 'The Shallows', shore: true } },
  { id: 'tarpon', name: 'Tarpon', kg: [15, 80], price: 26, odds: 4, fight: 0.9, where: { region: 'The Stepping Stones' } },
  { id: 'seabass', name: 'Black sea bass', kg: [1, 5], price: 15, odds: 7, fight: 0.45, where: { region: 'The Ironbound Coast' } },
  { id: 'sailfish', name: 'Sailfish', kg: [20, 60], price: 45, odds: 2.5, fight: 0.9, where: { region: 'Santa Brisa', shore: false } },
  { id: 'marlin', name: 'Blue marlin', kg: [80, 400], price: 80, odds: 0.6, fight: 1, where: { shore: false, far: true } },
  { id: 'oarfish', name: 'Oarfish', kg: [40, 150], price: 110, odds: 3, fight: 0.8, where: { storm: true } },
];
export const fishById = (id) => FISH.find((f) => f.id === id);
export const cargoKey = (fish) => 'fish_' + fish.id; // fish are kept in the hold as cargo under this name

// Words for where a fish is found, for the fish log and for tavern jobs.
export function habitat(fish) {
  const w = fish.where, bits = [];
  if (w.shore === true) bits.push('close in to land');
  else if (w.shore === false) bits.push('out in open water');
  else if (!w.region) bits.push('almost anywhere');
  if (w.region) bits.push((bits.length ? 'around ' : 'anywhere around ') + w.region);
  if (w.far) bits.push('far from home');
  if (w.night) bits.push('by night');
  if (w.day) bits.push('by day');
  if (w.storm) bits.push('only in the worst weather');
  return bits.join(', ');
}

// What the water is like where the ship is.
export function waterAt(x, z, env) {
  let region = REGIONS[0], best = Infinity;
  for (const r of REGIONS) { const d = Math.hypot(x - r.x, z - r.z); if (d < best) { best = d; region = r; } }
  // Roughly how far it is to the nearest land, in metres (reefs count: fish love them).
  let land = Infinity;
  for (const f of FEATURES) land = Math.min(land, Math.hypot(x - f.x, z - f.z) - f.R * (1 + (f.stretch - 1) * 0.5));
  return {
    region: region.name,
    shore: land < 160, // within a short way of some land
    open: land > 260, // well out to sea
    far: Math.hypot(x - REGIONS[0].x, z - REGIONS[0].z) > 2000,
    night: env.night > 0.5,
    storm: env.storm > 0.45 || env.w > 0.85,
  };
}
const bites = (fish, water) => {
  const w = fish.where;
  if (w.shore === true && !water.shore) return false;
  if (w.shore === false && !water.open) return false;
  if (w.region && w.region !== water.region) return false;
  if (w.far && !water.far) return false;
  if (w.night && !water.night) return false;
  if (w.day && water.night) return false;
  if (w.storm && !water.storm) return false;
  return true;
};
// Which fish takes the hook here: a weighted draw from those about.
export function pickFish(water) {
  const here = FISH.filter((f) => bites(f, water));
  let total = here.reduce((a, f) => a + f.odds, 0), r = Math.random() * total;
  for (const f of here) if ((r -= f.odds) <= 0) return f;
  return here[0];
}

// What a market pays for a fish today. Each port has its own taste, and prices drift day to day.
export function fishPrice(port, fish, day) {
  let s = 0;
  for (const ch of port + fish.id) s = (s * 31 + ch.charCodeAt(0)) % 9973;
  const taste = 0.75 + (s % 50) / 100; // 0.75 to 1.24
  const drift = 0.92 + 0.16 * ((Math.sin(s + day * 12.7) + 1) / 2);
  return Math.max(1, Math.round(fish.price * taste * drift));
}

// Fish log rewards, by the number of kinds caught.
export const LOG_REWARDS = { 4: 'tackle', 8: 'marlinblue', 12: 'scales', 16: 'strongline' };

export function createFishing(waves) {
  const group = new THREE.Group();
  const float = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xd9453c }));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  cap.position.y = 0.14;
  float.add(cap);
  const lineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.7 }));
  line.frustumCulled = false;
  group.add(float, line);
  group.visible = false;

  // state: 'idle', 'waiting' (line out), 'bite' (strike now!), 'reeling' (fish on)
  const f = { state: 'idle', wait: 0, biteFor: 0, fish: null, kg: 0, tension: 0, landed: 0, surge: 0, surgeWait: 0, slack: 0, fx: 0, fz: 0, side: 1 };
  const rod = new THREE.Vector3(), tmp = new THREE.Vector3();
  const quicker = () => (hasReward('tackle') ? 0.65 : 1);

  function cast(ship) {
    const s = ship.state;
    f.state = 'waiting';
    f.wait = rand(5, 14) * quicker();
    f.side = Math.random() < 0.5 ? 1 : -1;
    // The float lands a little way off the quarter.
    const back = s.stern - 6, out = f.side * (s.halfBeam + 8);
    f.fx = s.x + Math.sin(s.heading) * back + Math.cos(s.heading) * out;
    f.fz = s.z + Math.cos(s.heading) * back - Math.sin(s.heading) * out;
  }
  const reelIn = () => { f.state = 'idle'; f.fish = null; };

  return {
    group,
    state: f,
    get active() { return f.state !== 'idle'; },
    // The fish button: cast, strike, or (while reeling) nothing, because reeling is holding it down.
    press(ship, env) {
      if (f.state === 'idle') { cast(ship); return 'cast'; }
      if (f.state === 'waiting') { reelIn(); return 'in'; }
      if (f.state === 'bite') {
        f.state = 'reeling';
        f.tension = 0.35; f.landed = 0.05; f.surge = 0; f.surgeWait = rand(1, 3); f.slack = 0;
        return 'strike';
      }
      return null;
    },
    // Called every frame. `held` is whether the fish button is held down. Returns an event, or null:
    // 'bite', 'missed', 'caught', 'snapped', 'shook', 'tooFast'.
    update(dt, time, ship, env, held, onWater) {
      const s = ship.state;
      group.visible = f.state !== 'idle';
      if (f.state === 'idle') return null;
      if (!onWater || Math.abs(s.speed) > 2.4) { reelIn(); group.visible = false; return 'tooFast'; }
      let event = null;
      if (f.state === 'waiting' && (f.wait -= dt) <= 0) {
        f.fish = pickFish(waterAt(f.fx, f.fz, env));
        f.state = 'bite';
        f.biteFor = 1.4;
        event = 'bite';
      } else if (f.state === 'bite' && (f.biteFor -= dt) <= 0) {
        f.state = 'waiting';
        f.wait = rand(4, 10) * quicker();
        event = 'missed';
      } else if (f.state === 'reeling') {
        const fight = f.fish.fight, strong = hasReward('strongline') ? 0.75 : 1;
        // Now and then the fish makes a run for it.
        if (f.surge > 0) f.surge -= dt;
        else if ((f.surgeWait -= dt) <= 0) { f.surge = rand(0.8, 1.8) * (0.6 + fight * 0.6); f.surgeWait = rand(1.5, 4) / (0.5 + fight); }
        const running = f.surge > 0;
        if (held) {
          f.tension += dt * (0.22 + (running ? 0.9 * fight : 0)) * strong;
          f.landed += dt * (running ? 0.02 : 0.2 / (0.6 + fight));
        } else {
          f.tension -= dt * (running ? -0.25 * fight * strong : 0.55);
          f.landed -= dt * (running ? 0.07 * fight : 0.015);
        }
        f.tension = Math.max(0, f.tension);
        f.landed = Math.max(0, f.landed);
        f.slack = f.tension < 0.06 ? f.slack + dt : 0;
        if (f.tension >= 1) { reelIn(); event = 'snapped'; }
        else if (f.slack > 2.5) { reelIn(); event = 'shook'; }
        else if (f.landed >= 1) { event = 'caught'; }
      }
      // Draw the float riding the waves, and the line from the rail to it.
      if (group.visible) {
        const bob = f.state === 'bite' ? -0.25 + Math.sin(time * 30) * 0.12 : f.state === 'reeling' ? -0.15 - (f.surge > 0 ? 0.2 : 0) : Math.sin(time * 2.2) * 0.05;
        if (f.state === 'reeling') {
          // The fish is drawn toward the ship as you reel.
          const back = s.stern - 6 + (1 - f.landed) * 0, out = f.side * (s.halfBeam + 2 + 9 * (1 - f.landed));
          const tx = s.x + Math.sin(s.heading) * back + Math.cos(s.heading) * out, tz = s.z + Math.cos(s.heading) * back - Math.sin(s.heading) * out;
          f.fx += (tx - f.fx) * Math.min(1, dt * 3) + (f.surge > 0 ? Math.sin(time * 9) * 0.06 : 0);
          f.fz += (tz - f.fz) * Math.min(1, dt * 3);
        }
        float.position.set(f.fx, waveHeight(waves, f.fx, f.fz, time) + bob, f.fz);
        ship.root.updateMatrixWorld();
        rod.set(f.side * (s.halfBeam - 0.2), 2.2, s.stern + 1.5).applyMatrix4(ship.root.matrixWorld);
        const p = lineGeo.attributes.position.array;
        tmp.copy(float.position);
        p[0] = rod.x; p[1] = rod.y; p[2] = rod.z; p[3] = tmp.x; p[4] = tmp.y + 0.1; p[5] = tmp.z;
        lineGeo.attributes.position.needsUpdate = true;
      }
      return event;
    },
    // A fish has been landed: weigh it, stow it, write it in the log. Returns { fish, kg, newKind, best, reward }.
    land() {
      const fish = f.fish, [lo, hi] = fish.kg;
      const kg = Math.round((lo + (hi - lo) * Math.pow(Math.random(), 1.8)) * 10) / 10; // big ones are rarer
      reelIn();
      const entry = save.fishLog[fish.id] || (save.fishLog[fish.id] = { n: 0, best: 0 });
      const newKind = entry.n === 0, best = kg > entry.best;
      entry.n++;
      if (best) entry.best = kg;
      persist();
      return { fish, kg, newKind, best: best && !newKind, kinds: Object.keys(save.fishLog).length };
    },
    cancel: reelIn,
    waterAt, // for tests: what the water is like at a spot
  };
}
