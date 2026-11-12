// What a sunk ship leaves behind: crates, casks and the odd sea chest, bobbing
// among the wreckage until you sail over them or they drift away.

import * as THREE from 'three';
import { paint, applyPaint } from './materials.js';
import { waveHeight } from './waves.js';
import { GOODS } from './trade.js';

const rand = (a, b) => a + Math.random() * (b - a);
const LASTS = 240; // seconds before flotsam sinks or drifts off

export function createLoot(waves) {
  const group = new THREE.Group();
  const items = [];

  function mesh(kind) {
    const g = new THREE.Group();
    if (kind === 'coins') { // a small sea chest
      const body = paint(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.9)), 0x7a5233);
      const band = paint(new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.14, 0.94)), 0xf0c05a);
      band.position.y = 0.2;
      g.add(body, band);
    } else if (kind === 'map') { // a corked bottle
      const glass = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.1, 8)), 0x4f9a7a);
      const cork = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.4, 6)), 0xc9a06c);
      cork.position.y = 0.7;
      g.add(glass, cork);
    } else g.add(paint(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4)), 0x8a6a45)); // a cargo crate
    applyPaint(g);
    group.add(g);
    return g;
  }

  return {
    group, items,
    // Scatter what `v` was carrying where she went down. `withMap`: there is a treasure map aboard.
    drop(v, withMap) {
      const add = (kind, amount, good) => items.push({ kind, amount, good, x: v.x + rand(-9, 9), z: v.z + rand(-9, 9), age: 0, spin: rand(0, 6), mesh: mesh(kind) });
      const big = v.typeId === 'sloop' ? 1 : v.typeId === 'brig' ? 2 : 3.5;
      if (v.faction === 'merchant') {
        // Trade goods, in two or three lots, and the master's cash box.
        for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) add('cargo', Math.round(rand(2, 4) * big), GOODS[Math.floor(Math.random() * GOODS.length)]);
        add('coins', Math.round(rand(20, 50) * big));
      } else {
        add('coins', Math.round(rand(40, 80) * big));
        if (v.faction === 'pirate' && Math.random() < 0.5) add('cargo', Math.round(rand(2, 3) * big), GOODS[2 + Math.floor(Math.random() * 3)]); // plundered rum, spice or pearls
      }
      if (withMap) add('map', 1);
    },
    // Bob and drift, and hand over anything the ship is close enough to hook aboard.
    // `take(item)` returns true if the item was taken.
    update(dt, time, ship, wind, take) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.age += dt;
        it.x += wind.dx * 0.25 * dt;
        it.z += wind.dz * 0.25 * dt;
        const y = waveHeight(waves, it.x, it.z, time);
        it.mesh.position.set(it.x, y - 0.25 - Math.max(0, it.age - LASTS + 8) * 0.3, it.z);
        it.mesh.rotation.set(Math.sin(time * 0.9 + it.spin) * 0.25, it.spin + time * 0.1, Math.cos(time * 0.7 + it.spin) * 0.25);
        const near = ship && Math.hypot(it.x - ship.x, it.z - ship.z) < ship.bow + 5;
        if ((near && take(it)) || it.age > LASTS) {
          group.remove(it.mesh);
          items.splice(i, 1);
        }
      }
    },
  };
}
