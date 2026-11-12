// Other ships at sea. Each is a real ship: she sails, can be hit by cannon fire,
// takes damage, and sinks. (For now they are all peaceful merchants.)

import * as THREE from 'three';
import { buildNpcModel } from './ship.js';
import { waveHeight } from './waves.js';
import { islandCoast, nightLights } from './islands.js';

const rand = (a, b) => a + Math.random() * (b - a);

const LOOKS = {
  merchant: [
    { hull: 0x5a3a2a, trim: 0xe9dcc0, sail: 0xf1e8d2, flag: 0xf0c05a },
    { hull: 0x2f6b4a, trim: 0xf2d9a0, sail: 0xe9dcc0, flag: 0xffffff },
    { hull: 0x6e2f2a, trim: 0xf2d9a0, sail: 0xf4efe2, flag: 0x3a78c9 },
  ],
};

// A random spot of open water, well clear of every island and of `avoid`.
function openWater(avoid, far = 0) {
  for (let i = 0; i < 60; i++) {
    const x = rand(-1700, 2000), z = rand(-2200, 1600);
    if (islandCoast(x, z) < -0.95 && (!avoid || Math.hypot(x - avoid.x, z - avoid.z) > far)) return { x, z };
  }
  return { x: 0, z: 300 };
}

export function createVessels(waves, fx) {
  const group = new THREE.Group();
  const list = [];

  function add(typeId, faction, look, speed) {
    const model = buildNpcModel(typeId, look);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
    lamp.position.set(0, model.type.size.stern * 0 + 5.5, model.type.size.stern + 0.5);
    nightLights.push(lamp);
    model.group.add(lamp);
    group.add(model.group);
    const start = openWater();
    const v = {
      faction, type: model.type, model: model.group, guns: model.guns, size: model.type.size, top: model.type.top,
      x: start.x, z: start.z, y: 0, heading: rand(0, 6.28), speed, cruise: speed, vx: 0, vz: 0,
      hull: 1, sinking: 0, gone: false, away: 0, alarm: 0, goal: openWater(), bob: rand(0, 6),
      reload: { port: 0, stbd: 0 }, reloadTime: model.type.reload,
      // A cannonball has struck her.
      hit(damage, by) {
        if (v.sinking) return;
        v.hull = Math.max(0, v.hull - damage / v.type.hullMax);
        v.alarm = 40; // she runs for it
        v.attacker = by;
        if (v.hull <= 0) { v.sinking = 0.001; fx.sunk(v); }
      },
    };
    list.push(v);
    return v;
  }
  add('brig', 'merchant', LOOKS.merchant[0], 3.4);
  add('sloop', 'merchant', LOOKS.merchant[1], 4.2);
  add('brig', 'merchant', LOOKS.merchant[2], 3.7);

  function update(dt, time, player) {
    for (const v of list) {
      if (v.gone) {
        // After a while another ship of her kind comes over the horizon.
        if ((v.away -= dt) <= 0) {
          const p = openWater(player, 1100);
          Object.assign(v, { x: p.x, z: p.z, hull: 1, sinking: 0, gone: false, alarm: 0, goal: openWater(), heading: rand(0, 6.28) });
          v.model.visible = true;
        }
        continue;
      }
      if (v.sinking) {
        v.sinking += dt;
        v.speed *= 1 - Math.min(1, dt * 0.8);
        if (Math.random() < dt * 4) fx.foam(v.x + rand(-4, 4), v.z + rand(-6, 6), rand(0.6, 1.4));
        if (v.sinking > 9) { v.gone = true; v.away = rand(50, 90); v.model.visible = false; }
      } else {
        v.alarm = Math.max(0, v.alarm - dt);
        if (Math.hypot(v.goal.x - v.x, v.goal.z - v.z) < 120) v.goal = openWater();
        let want = Math.atan2(v.goal.x - v.x, v.goal.z - v.z);
        // Frightened, she turns her stern to whoever fired on her and crowds on sail.
        if (v.alarm > 0 && v.attacker) want = Math.atan2(v.x - v.attacker.x, v.z - v.attacker.z);
        const ax = v.x + Math.sin(v.heading) * 170, az = v.z + Math.cos(v.heading) * 170;
        if (islandCoast(ax, az) > -0.75 || (!v.alarm && Math.hypot(player.x - ax, player.z - az) < 110)) want = v.heading - 1.2;
        let diff = want - v.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        v.heading += THREE.MathUtils.clamp(diff, -0.14 * dt, 0.14 * dt);
        const target = v.cruise * (v.alarm > 0 ? 1.5 : 1) * (0.55 + 0.45 * v.hull);
        v.speed += (target - v.speed) * Math.min(1, dt * 0.4);
      }
      v.vx = Math.sin(v.heading) * v.speed;
      v.vz = Math.cos(v.heading) * v.speed;
      v.x += v.vx * dt;
      v.z += v.vz * dt;
      v.y = waveHeight(waves, v.x, v.z, time) * 0.5;
      const low = (1 - v.hull) * 0.6 + v.sinking * v.sinking * 0.2;
      v.model.position.set(v.x, v.y + 0.3 - low, v.z);
      v.model.rotation.set(Math.sin(time * 0.5 + v.bob) * 0.03 - Math.min(0.4, v.sinking * 0.05), v.heading, Math.sin(time * 0.37 + v.bob) * 0.05 + Math.min(1.2, v.sinking * 0.15));
    }
  }

  return { group, list, update };
}
