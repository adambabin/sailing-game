// The people of the port villages: a barkeep, a merchant and a shipwright who
// each mind their place, villagers out for a stroll, and someone fishing off the dock.

import * as THREE from 'three';
import { paint, applyPaint } from './materials.js';
import { ISLANDS, terrainHeight, onDock, coastRadius, DOCK_TOP } from './islands.js';
import { KEEPERS } from './trade.js';

const SHIRTS = [0xf3efe2, 0xd98a5a, 0x7fb5c9, 0xe8c648, 0xc9605a, 0x8fbf7a, 0xb99ad1];
const TROUSERS = [0x2c3f63, 0x5a4a3a, 0x7a6a55, 0x3a5a4a];
const SKINS = [0xd9a47a, 0xb5774f, 0x8a5a3c, 0xe8c09a];
const HAIR = [0x2a1d14, 0x4a3320, 0x1c1c1f, 0x8a8a88];

// Build a person from simple blocks. Also used for the sailor you walk around as.
export function buildPerson(o) {
  const g = new THREE.Group();
  const part = (w, h, d, color, x, y, z) => {
    const m = paint(new THREE.Mesh(new THREE.BoxGeometry(w, h, d)), color);
    m.geometry.translate(0, -h / 2, 0); // hinge at the top, so limbs swing from hip and shoulder
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const legs = [part(0.24, 0.85, 0.26, o.trousers, 0.15, 0.85, 0), part(0.24, 0.85, 0.26, o.trousers, -0.15, 0.85, 0)];
  part(0.62, 0.75, 0.36, o.shirt, 0, 1.6, 0);
  if (o.sash) part(0.64, 0.14, 0.38, o.sash, 0, 0.98, 0);
  if (o.apron) part(0.5, 0.95, 0.06, o.apron, 0, 1.5, 0.2);
  const arms = [part(0.18, 0.7, 0.2, o.shirt, 0.41, 1.57, 0), part(0.18, 0.7, 0.2, o.shirt, -0.41, 1.57, 0)];
  const head = paint(new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8)), o.skin);
  head.position.y = 1.86;
  g.add(head);
  if (o.hat === 'straw') {
    const brim = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.05, 12)), 0xe6c36a);
    brim.position.y = 2.02;
    const crown = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 10)), 0xe6c36a);
    crown.position.y = 2.13;
    g.add(brim, crown);
  } else {
    // Hair, or a bright headscarf.
    const cap = paint(new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)), o.hat === 'scarf' ? o.scarf : o.hair);
    cap.position.y = 1.88;
    g.add(cap);
  }
  if (o.tool) {
    // Something held in the right hand: a hammer or a fishing rod.
    const tool = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, o.tool, 5)), 0x6e4a2c);
    tool.position.set(0, -0.7, o.tool / 2 - 0.1);
    tool.rotation.x = Math.PI / 2;
    arms[1].add(tool);
  }
  g.scale.setScalar(o.scale || 1.05);
  return { group: g, legs, arms };
}

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

const HELLOS = [
  'Fair winds to you, captain.',
  'Is that your sloop out there? She is a pretty one.',
  'You will want the tavern. Everyone does.',
  'My brother went to sea. Never writes.',
  'The mangoes are good this year.',
  'Welcome ashore. Mind the gulls, they are thieves.',
  'Stay a while. Nobody here is in a hurry.',
  'The market has the best of it before noon.',
];
const FISHING = [
  'Shh. You will scare them.',
  'Nothing biting. Never is. I come for the quiet.',
  'Caught one this big yesterday. Nobody saw.',
  'They bite best at dusk. So I am told.',
];

export function createPeople() {
  const group = new THREE.Group();
  const ports = [];

  ISLANDS.filter((isl) => isl.portInfo).forEach((isl, pi) => {
    const r = rng(pi * 613 + 29);
    const info = isl.portInfo;
    const box = new THREE.Group();
    box.visible = false;
    group.add(box);
    const people = [];
    const ground = (x, z) => (onDock(isl, x, z) ? Math.max(DOCK_TOP, terrainHeight(x, z)) : terrainHeight(x, z));
    const add = (kind, look, x, z, heading, extra = {}) => {
      const body = buildPerson({ skin: pick(r, SKINS), hair: pick(r, HAIR), trousers: pick(r, TROUSERS), shirt: pick(r, SHIRTS), scarf: pick(r, SHIRTS), ...look });
      box.add(body.group);
      const p = { ...body, kind, x, z, y: ground(x, z), heading, home: heading, stride: 0, wave: 0, timer: r() * 4, walking: false, target: null, ...extra };
      people.push(p);
      return p;
    };

    // The three keepers stand by their places.
    for (const place of info.places) {
      const look = place.kind === 'tavern' ? { apron: 0xf3efe2, shirt: 0x8a5a3c } : place.kind === 'market' ? { hat: 'scarf' } : { apron: 0x7a5233, tool: 0.45 };
      const k = add('keeper', look, place.keeperX, place.keeperZ, Math.atan2(info.ux, info.uz), { place });
      place.keeper = k;
      place.keeperName = (KEEPERS[isl.name] || {})[place.kind] || 'the keeper';
    }

    // Someone fishing off the side of the dock.
    const along = info.start + 20, fx = isl.x + info.ux * along - info.uz * 1.35, fz = isl.z + info.uz * along + info.ux * 1.35;
    const fisher = add('fisher', { hat: 'straw', tool: 2.6 }, fx, fz, Math.atan2(-info.uz, info.ux));
    const line = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.6, 4)), 0xf3efe2);
    line.position.set(fx - info.uz * 2.6, DOCK_TOP - 0.1, fz + info.ux * 2.6);
    box.add(line);
    fisher.line = line;

    // Villagers stroll between the dock, the three places and the beach.
    const spots = [{ x: isl.x + info.ux * (info.start - 4), z: isl.z + info.uz * (info.start - 4) }];
    for (const place of info.places) spots.push({ x: place.doorX + info.uz * 3, z: place.doorZ - info.ux * 3 });
    const th = Math.atan2(info.uz, info.ux);
    for (const off of [-0.42, -0.2, 0.2, 0.42]) {
      const a = th + off * Math.min(1, 110 / isl.R), d = coastRadius(isl, a) * 0.9;
      spots.push({ x: isl.x + Math.cos(a) * d, z: isl.z + Math.sin(a) * d });
    }
    const walkers = isl.R > 100 ? 4 : 3;
    for (let i = 0; i < walkers; i++) {
      const s = spots[Math.floor(r() * spots.length)];
      add('villager', { hat: pick(r, ['straw', 'none', 'scarf', 'none']), scale: 0.95 + r() * 0.15 }, s.x + r() * 2, s.z + r() * 2, r() * 6.28, { speed: 1.1 + r() * 0.5 });
    }
    ports.push({ isl, box, people, spots, ground });
  });
  applyPaint(group);

  let current = null;

  return {
    group,
    // `focus` is where the player is (ship or sailor); `player` is the sailor's position when ashore, else null.
    update(dt, time, env, focus, player) {
      // Only the nearest port's people are shown and moved.
      let best = null, bd = 520;
      for (const p of ports) {
        const d = Math.hypot(focus.x - p.isl.x, focus.z - p.isl.z) - p.isl.R;
        if (d < bd) { bd = d; best = p; }
      }
      if (best !== current) {
        if (current) current.box.visible = false;
        if (best) best.box.visible = true;
        current = best;
      }
      if (!current) return;
      const abed = env.night > 0.6; // villagers and the fisher go home after dark; the keepers stay
      for (const p of current.people) {
        const near = player ? Math.hypot(player.x - p.x, player.z - p.z) : 99;
        let swing = 0;
        if (p.kind !== 'keeper') p.group.visible = !abed;
        if (p.kind === 'fisher') p.line.visible = !abed;

        if (p.kind === 'villager' && !abed) {
          if (!p.walking) {
            p.timer -= dt;
            if (p.timer <= 0 && near > 3) { p.target = current.spots[Math.floor(Math.random() * current.spots.length)]; p.walking = true; }
          } else {
            const dx = p.target.x - p.x, dz = p.target.z - p.z, dist = Math.hypot(dx, dz);
            if (dist < 0.6) { p.walking = false; p.timer = 2 + Math.random() * 7; }
            else if (near > 1.6) { // stop politely rather than walk through you
              const want = Math.atan2(dx, dz);
              let diff = want - p.heading;
              diff = Math.atan2(Math.sin(diff), Math.cos(diff));
              p.heading += THREE.MathUtils.clamp(diff, -3 * dt, 3 * dt);
              const nx = p.x + Math.sin(p.heading) * p.speed * dt, nz = p.z + Math.cos(p.heading) * p.speed * dt;
              if (current.ground(nx, nz) < 0.6) { // never wade into the sea: stop and think of somewhere else to go
                p.walking = false;
                p.timer = 1 + Math.random() * 2;
              } else {
                p.x = nx;
                p.z = nz;
                p.stride += dt * 6.5 * p.speed;
                swing = Math.sin(p.stride) * 0.55;
              }
            }
          }
        }
        // Anyone standing still turns to face you when you come close.
        if (player && near < 6 && !p.walking && p.kind !== 'fisher') {
          let diff = Math.atan2(player.x - p.x, player.z - p.z) - p.heading;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          p.heading += diff * Math.min(1, dt * 4);
        } else if (p.kind === 'keeper') {
          let diff = p.home - p.heading;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          p.heading += diff * Math.min(1, dt * 2);
        }

        p.legs[0].rotation.x = swing;
        p.legs[1].rotation.x = -swing;
        p.arms[0].rotation.x = -swing * 0.8;
        p.arms[1].rotation.x = swing * 0.8;
        if (p.kind === 'fisher') {
          p.arms[1].rotation.x = -1.15 + Math.sin(time * 0.8) * 0.05; // holding the rod out over the water
          p.arms[0].rotation.x = -0.5;
        } else if (p.place && p.place.kind === 'shipwright' && near > 6) {
          p.arms[1].rotation.x = -1.2 + Math.abs(Math.sin(time * 4)) * 0.9; // hammering
        }
        if (p.wave > 0) { // a friendly wave
          p.wave -= dt;
          p.arms[0].rotation.x = -2.7;
          p.arms[0].rotation.z = Math.sin(time * 12) * 0.35;
        } else p.arms[0].rotation.z = 0;

        p.y += (current.ground(p.x, p.z) - p.y) * Math.min(1, dt * 10);
        p.group.position.set(p.x, p.y + Math.sin(time * 1.6 + p.home) * 0.012, p.z);
        p.group.rotation.y = p.heading;
      }
    },
    // The villager or fisher close enough to greet, if any.
    nearby(player) {
      if (!current) return null;
      let best = null, bd = 3.2;
      for (const p of current.people) {
        if (p.kind === 'keeper' || !p.group.visible) continue;
        const d = Math.hypot(player.x - p.x, player.z - p.z);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
    // Greet someone: they wave, and this returns what they say.
    greet(p, env) {
      p.wave = 1.6;
      if (p.kind === 'fisher') return FISHING[Math.floor(Math.random() * FISHING.length)];
      if (env.w > 0.62 && Math.random() < 0.5) return 'Blowing up out there. Glad to be ashore.';
      return HELLOS[Math.floor(Math.random() * HELLOS.length)];
    },
    get current() { return current; },
  };
}
