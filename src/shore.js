// Going ashore: a little sailor you can walk around the dock, beach and village.

import * as THREE from 'three';
import { paint, applyPaint } from './materials.js';
import { buildPerson } from './people.js';
import { terrainHeight, onDock, obstacles, DOCK_TOP } from './islands.js';

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

  const state = { active: false, island: null, x: 0, y: 0, z: 0, heading: 0, stride: 0, moving: false, onWood: false };

  const walkable = (x, z) => {
    if (onDock(state.island, x, z)) return true;
    if (terrainHeight(x, z) < 0.25) return false; // the sea
    for (const o of obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r) return false;
    return true;
  };

  return {
    sailor: sailor.group,
    dinghy,
    state,
    // Step onto the dock of `isl`.
    land(isl) {
      const p = isl.portInfo, s = state;
      s.active = true;
      s.island = isl;
      s.x = isl.x + p.ux * (p.end - 4);
      s.z = isl.z + p.uz * (p.end - 4);
      s.y = DOCK_TOP;
      s.heading = Math.atan2(-p.ux, -p.uz); // facing the village
      sailor.group.visible = dinghy.visible = true;
      dinghy.position.set(isl.x + p.ux * (p.end - 2) - p.uz * 2.9, 0.6, isl.z + p.uz * (p.end - 2) + p.ux * 2.9);
      dinghy.rotation.y = s.heading;
    },
    leave() {
      state.active = false;
      sailor.group.visible = dinghy.visible = false;
    },
    // Is the sailor standing at the seaward end of the dock, by the dinghy?
    atDinghy() {
      const s = state, p = s.island.portInfo;
      const along = (s.x - s.island.x) * p.ux + (s.z - s.island.z) * p.uz;
      return onDock(s.island, s.x, s.z) && along > p.end - 9;
    },
    // Walk with the same keys as the ship: left/right turn, up/down walk. Returns true on each footstep.
    update(dt, held, frozen) {
      const s = state;
      const turn = frozen ? 0 : (held.left ? 1 : 0) - (held.right ? 1 : 0);
      const move = frozen ? 0 : (held.up ? 1 : 0) - (held.down ? 0.55 : 0);
      s.heading += turn * TURN_SPEED * dt;
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      const dx = fx * move * WALK_SPEED * dt, dz = fz * move * WALK_SPEED * dt;
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
        s.stride += dt * 9;
        stepped = Math.floor(prev / Math.PI) !== Math.floor(s.stride / Math.PI);
      } else s.stride = 0;
      const swing = s.moving ? Math.sin(s.stride) * 0.7 : 0;
      sailor.legs[0].rotation.x = swing;
      sailor.legs[1].rotation.x = -swing;
      sailor.arms[0].rotation.x = -swing * 0.8;
      sailor.arms[1].rotation.x = swing * 0.8;
      sailor.group.position.set(s.x, s.y + (s.moving ? Math.abs(Math.cos(s.stride)) * 0.05 : 0), s.z);
      sailor.group.rotation.y = s.heading;
      dinghy.position.y = 0.6 + Math.sin(performance.now() * 0.0015) * 0.06;
      return stepped;
    },
  };
}
