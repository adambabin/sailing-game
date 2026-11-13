// Going ashore: a little sailor you can walk around the dock, beach and village.

import * as THREE from 'three';
import { paint, applyPaint } from './materials.js';
import { buildPerson } from './people.js';
import { terrainHeight, onDock, obstacles, coastRadius, islandPoint, islandAngle, DOCK_TOP } from './islands.js';

const WALK_SPEED = 5, TURN_SPEED = 2.4;

const buildSailor = () => buildPerson({ shirt: 0xf3efe2, trousers: 0x2c3f63, skin: 0xd9a47a, hat: 'straw', sash: 0xd9453c, scale: 1.1 });

function buildDinghy() {
  const g = new THREE.Group();
  const hull = paint(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), 0xc9a06c, { double: true });
  hull.scale.set(0.8, 0.55, 1.9);
  const seat = paint(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.3)), 0x7a5233);
  seat.position.y = -0.12;
  g.add(hull, seat);
  return g;
}

export function createShore() {
  const sailor = buildSailor();
  const dinghy = buildDinghy();
  sailor.group.visible = dinghy.visible = false;
  applyPaint(sailor.group);
  applyPaint(dinghy);

  const state = { active: false, island: null, boat: null, x: 0, y: 0, z: 0, heading: 0, stride: 0, moving: false, onWood: false };

  const walkable = (x, z) => {
    if (onDock(state.island, x, z)) return true;
    if (terrainHeight(x, z) < 0.25) return false; // the sea
    for (const o of obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r) return false;
    return true;
  };

  return {
    walkable, // can the sailor stand at (x, z)? (used by tests)
    sailor: sailor.group,
    dinghy,
    state,
    // Go ashore on `isl`: onto its dock if `useDock`, otherwise onto the beach nearest the ship.
    land(isl, ship, useDock) {
      const s = state;
      s.active = true;
      s.island = isl;
      if (useDock) {
        const p = isl.portInfo;
        s.x = isl.x + p.ux * (p.end - 4);
        s.z = isl.z + p.uz * (p.end - 4);
        s.y = DOCK_TOP;
        s.heading = Math.atan2(-p.ux, -p.uz); // facing the village
        s.boat = { x: isl.x + p.ux * (p.end - 3), z: isl.z + p.uz * (p.end - 3), y: 0.6, reach: 7 };
        dinghy.position.set(isl.x + p.ux * (p.end - 2) - p.uz * 2.9, 0.6, isl.z + p.uz * (p.end - 2) + p.ux * 2.9);
      } else {
        // The beach nearest the ship. If that way is open water (the mouth of a lagoon), look along the shore for sand.
        let th = islandAngle(isl, ship.x, ship.z), spot = null;
        const inLagoon = isl.inner && Math.hypot(ship.x - isl.x, ship.z - isl.z) < coastRadius(isl, th) * isl.inner * isl.stretch;
        const at = inLagoon ? isl.inner + 0.07 : isl.type === 'cliff' ? 0.975 : 0.93, edge = inLagoon ? isl.inner + 0.012 : 0.99; // a cliff island has only a ledge of beach // land on the lagoon side if she lies inside
        for (let i = 0; i < 44 && !spot; i++) {
          const t = th + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 0.14, p = islandPoint(isl, t, coastRadius(isl, t) * at);
          if (terrainHeight(p.x, p.z) > 0.45) { spot = p; th = t; }
        }
        spot = spot || islandPoint(isl, th, coastRadius(isl, th) * at);
        const R = coastRadius(isl, th), water = islandPoint(isl, th, R * edge), boat = islandPoint(isl, th, R * (at + (edge - at) * 0.5));
        s.x = spot.x;
        s.z = spot.z;
        s.y = terrainHeight(s.x, s.z);
        s.heading = Math.atan2(isl.x - s.x, isl.z - s.z) + (inLagoon ? Math.PI : 0); // facing up the beach
        s.boat = { x: boat.x, z: boat.z, y: 0.95, reach: 6 };
        dinghy.position.set(water.x, 0.95, water.z); // pulled up on the sand
      }
      sailor.group.visible = dinghy.visible = true;
      dinghy.rotation.y = s.heading;
    },
    leave() {
      state.active = false;
      sailor.group.visible = dinghy.visible = false;
    },
    // Is the sailor standing by the rowing boat?
    atDinghy() {
      const s = state;
      return Math.hypot(s.x - s.boat.x, s.z - s.boat.z) < s.boat.reach;
    },
    // Walk in the direction of `move` (a world-space push of length 0 to 1), turning to face it.
    // Returns true on each footstep.
    update(dt, move, frozen) {
      const s = state;
      let mx = frozen ? 0 : move.x, mz = frozen ? 0 : move.z;
      const push = Math.min(1, Math.hypot(mx, mz));
      if (push > 0.05) {
        const scale = push / Math.hypot(mx, mz); // a push harder than 1 still walks at full speed, no faster
        mx *= scale;
        mz *= scale;
        let diff = Math.atan2(mx, mz) - s.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        s.heading += THREE.MathUtils.clamp(diff, -TURN_SPEED * 4 * dt, TURN_SPEED * 4 * dt);
      } else mx = mz = 0;
      const dx = mx * WALK_SPEED * dt, dz = mz * WALK_SPEED * dt;
      const before = s.x + s.z;
      if (walkable(s.x + dx, s.z + dz)) { s.x += dx; s.z += dz; }
      else if (walkable(s.x + dx, s.z)) s.x += dx; // slide along whatever is in the way
      else if (walkable(s.x, s.z + dz)) s.z += dz;
      s.moving = Math.abs(s.x + s.z - before) > 1e-5;
      s.onWood = onDock(s.island, s.x, s.z);
      const ground = s.onWood ? Math.max(DOCK_TOP, terrainHeight(s.x, s.z)) : terrainHeight(s.x, s.z);
      s.y += (ground - s.y) * Math.min(1, dt * 12);

      let stepped = false;
      if (s.moving) {
        const prev = s.stride;
        s.stride += dt * (4 + 5 * push);
        stepped = Math.floor(prev / Math.PI) !== Math.floor(s.stride / Math.PI);
      } else s.stride = 0;
      const swing = s.moving ? Math.sin(s.stride) * 0.7 : 0;
      sailor.legs[0].rotation.x = swing;
      sailor.legs[1].rotation.x = -swing;
      sailor.arms[0].rotation.x = -swing * 0.8;
      sailor.arms[1].rotation.x = swing * 0.8;
      sailor.group.position.set(s.x, s.y + (s.moving ? Math.abs(Math.cos(s.stride)) * 0.05 : 0), s.z);
      sailor.group.rotation.y = s.heading;
      dinghy.position.y = s.boat.y + Math.sin(performance.now() * 0.0015) * 0.05;
      return stepped;
    },
  };
}
