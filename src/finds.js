// Things to find ashore: one curiosity on every island, and shells on the beaches.

import * as THREE from 'three';
import { paint, applyPaint } from './materials.js';
import { ISLANDS, terrainHeight, coastRadius, obstacles } from './islands.js';
import { save, persist } from './save.js';

const STONE = 0x9d988b, WOOD = 0x7a5233, DARK = 0x3b3f47, BRASS = 0xd9a441;

const box = (g, w, h, d, color, x, y, z) => {
  const m = paint(new THREE.Mesh(new THREE.BoxGeometry(w, h, d)), color);
  m.position.set(x, y, z);
  g.add(m);
  return m;
};
const cyl = (g, r, h, color, x, y, z, sides = 8) => {
  const m = paint(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides)), color);
  m.position.set(x, y, z);
  g.add(m);
  return m;
};
const ball = (g, r, color, x, y, z, sx = 1, sy = 1, sz = 1) => {
  const m = paint(new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7)), color);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  g.add(m);
  return m;
};

// Each curiosity: what it is called, the button text, what the logbook says, and how to build it.
const KINDS = {
  cannon: {
    name: 'The harbour gun', verb: 'Look at the old cannon',
    text: ['An iron cannon, rusted to the colour of the hillside, still pointing out over the harbour.', 'Someone has planted marigolds in the muzzle.'],
    build(g) {
      const barrel = cyl(g, 0.3, 2.6, DARK, 0, 0.95, 0.3);
      barrel.rotation.x = Math.PI / 2 - 0.15;
      box(g, 1.0, 0.5, 1.8, WOOD, 0, 0.45, 0);
      for (const x of [-0.62, 0.62]) cyl(g, 0.45, 0.14, WOOD, x, 0.45, 0, 10).rotation.z = Math.PI / 2;
      ball(g, 0.16, 0xe8a23a, 0, 1.2, 1.6);
    },
  },
  turtle: {
    name: 'A sea turtle', verb: 'Watch the turtle',
    text: ['A big green turtle rests on the warm sand, blinking slowly.', 'She watches you for a while, decides you are no trouble, and goes back to sleep.'],
    build(g) {
      ball(g, 0.8, 0x5d7a4a, 0, 0.3, 0, 1, 0.45, 1.2);
      ball(g, 0.24, 0x7f9a62, 0, 0.3, 1.05, 1, 0.8, 1.2);
      for (const [x, z] of [[0.75, 0.55], [-0.75, 0.55], [0.6, -0.7], [-0.6, -0.7]]) ball(g, 0.3, 0x7f9a62, x, 0.12, z, 1.3, 0.25, 0.7);
    },
  },
  nest: {
    name: 'A gull’s nest', verb: 'Peek at the nest',
    text: ['A ring of driftwood and seaweed with three speckled eggs in it.', 'A gull overhead has a great deal to say about you being here. You leave it be.'],
    build(g) {
      const ring = paint(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.17, 6, 12)), 0x8a6a45);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.18;
      g.add(ring);
      for (const [x, z] of [[0.14, 0.1], [-0.15, 0.05], [0, -0.16]]) ball(g, 0.13, 0xe9e2cf, x, 0.22, z, 1, 1.25, 1);
    },
  },
  ruin: {
    name: 'The old chapel', verb: 'Explore the ruin',
    text: ['Two pillars and an arch are all that is left standing. Hibiscus has grown up through the floor.', 'From the doorway you can see the whole northern sea. You sketch what you can make out onto your chart.'],
    reveal: true,
    build(g) {
      for (const x of [-2, 2]) box(g, 0.9, 5, 0.9, STONE, x, 2.5, 0);
      box(g, 5.6, 0.8, 1.0, STONE, 0, 5.3, 0);
      box(g, 3.2, 1.8, 0.8, STONE, -4.2, 0.9, -2.2).rotation.y = 0.5;
      box(g, 1.6, 0.9, 0.8, STONE, 4, 0.45, -2.6).rotation.y = -0.3;
      box(g, 1.0, 0.6, 1.0, STONE, 1.2, 0.3, 2.4).rotation.y = 0.7;
      ball(g, 0.5, 0xd9453c, -1.2, 0.4, -1.4);
    },
  },
  swing: {
    name: 'The mango swing', verb: 'Sit on the swing',
    text: ['A plank on two ropes, hung from the biggest mango tree on the key.', 'You sit a while and watch your ship ride at anchor. Nothing needs doing.'],
    build(g) {
      cyl(g, 0.5, 5, WOOD, 0, 2.5, 0);
      ball(g, 3.4, 0x3d9450, 0, 6.3, 0, 1.2, 0.8, 1.2);
      const branch = cyl(g, 0.16, 4, WOOD, 1.8, 4.3, 0);
      branch.rotation.z = Math.PI / 2;
      for (const z of [-0.4, 0.4]) cyl(g, 0.025, 3.3, 0xe9e2cf, 2.8, 2.65, z, 4);
      box(g, 0.4, 0.08, 1.1, WOOD, 2.8, 1.0, 0);
      for (const [x, z] of [[-1.5, 1.2], [1, -1.8]]) ball(g, 0.2, 0xf2a03a, x, 4.2, z);
    },
  },
  bell: {
    name: 'The sailors’ bell', verb: 'Ring the bell',
    text: ['A bronze bell under a little roof, put up by the town for ships that came home late.', 'You give the rope a pull. The note carries a long way over the water.'],
    ring: true,
    build(g) {
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(g, 0.12, 3.4, WOOD, x, 1.7, z, 6);
      const roof = paint(new THREE.Mesh(new THREE.ConeGeometry(2, 1.2, 4)), 0xc8583a);
      roof.position.y = 4;
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      const bell = paint(new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2)), BRASS, { double: true });
      bell.scale.y = 1.3;
      bell.position.y = 2.5;
      g.add(bell);
      cyl(g, 0.03, 1.4, 0xe9e2cf, 0, 1.75, 0, 4);
    },
  },
  wreck: {
    name: 'The wreck on the spit', verb: 'Look over the wreck',
    text: ['The ribs of an old ship, bleached grey and half buried, like the bones of a whale.', 'Whoever she was, she chose a pretty place to stop.'],
    build(g) {
      box(g, 0.4, 0.4, 9, 0x8f877a, 0, 0.2, 0);
      for (let i = 0; i < 6; i++) {
        for (const side of [-1, 1]) {
          const rib = box(g, 0.22, 2.6 - Math.abs(i - 2.5) * 0.35, 0.22, 0x8f877a, side * 1.0, 1.1, -3.6 + i * 1.45);
          rib.rotation.z = -side * 0.5;
        }
      }
    },
  },
  telescope: {
    name: 'The keeper’s telescope', verb: 'Look through the telescope',
    text: ['A brass telescope on a tripod, polished by a great many hands.', 'Through it the far islands jump close. You mark them on your chart.'],
    reveal: true,
    build(g) {
      for (let i = 0; i < 3; i++) {
        const leg = cyl(g, 0.04, 1.7, WOOD, Math.cos(i * 2.09) * 0.35, 0.8, Math.sin(i * 2.09) * 0.35, 5);
        leg.rotation.set(Math.sin(i * 2.09) * 0.4, 0, -Math.cos(i * 2.09) * 0.4);
      }
      const tube = cyl(g, 0.09, 1.4, BRASS, 0, 1.7, 0.2);
      tube.rotation.x = Math.PI / 2 - 0.2;
    },
  },
  chest: {
    name: 'The chest under the stones', verb: 'Dig by the three stones',
    text: ['Under the middle stone, a hand’s depth down, your fingers find an iron ring.', 'An old sea chest. Inside, wrapped in oilcloth: 120 coins, and a note that says only “Well found.”'],
    coins: 120,
    build(g) {
      for (const [x, z] of [[-1, 0.3], [0, -0.5], [1, 0.4]]) ball(g, 0.42, STONE, x, 0.2, z, 1, 0.7, 1);
      const chest = box(g, 1.0, 0.6, 0.65, WOOD, 0, 0.2, 0.9);
      box(g, 1.04, 0.1, 0.69, BRASS, 0, 0.35, 0.9);
      g.userData.chest = chest;
    },
  },
  bottle: {
    name: 'A message in a bottle', verb: 'Open the bottle',
    text: ['The cork comes out with a sigh. The paper inside is dry.', '“If the tide brings you this: what I buried is on the bigger Twin, under the three stones on the hill. I shall not be back for it. Spend it on something that floats.”'],
    build(g) {
      const b = cyl(g, 0.14, 0.5, 0x4f9a7a, 0, 0.18, 0);
      b.rotation.z = 1.2;
      const neck = cyl(g, 0.06, 0.24, 0x4f9a7a, 0.32, 0.31, 0);
      neck.rotation.z = 1.2;
      ball(g, 0.07, 0xc9a06c, 0.45, 0.36, 0);
    },
  },
  cairn: {
    name: 'The summit cairn', verb: 'Climb the cairn',
    text: ['The top of Windward Hat, the highest ground in the islands. Every sailor who makes the climb adds a stone.', 'The whole sea is laid out below you like a chart. You add your stone, and copy down everything you can see.'],
    reveal: true,
    build(g) {
      [[1.1, 0.35], [0.85, 0.95], [0.6, 1.45], [0.4, 1.85]].forEach(([r, y], i) => ball(g, r, STONE, (i % 2) * 0.12, y, 0, 1, 0.55, 1));
      cyl(g, 0.04, 2.2, WOOD, 0, 3, 0, 5);
      box(g, 0.8, 0.45, 0.03, 0xd9453c, 0.42, 3.8, 0);
    },
  },
};

export const SHELLS_PER_ISLAND = 3;

export function createFinds() {
  const group = new THREE.Group();
  const finds = [], shells = [];
  const shellGeo = new THREE.ConeGeometry(0.2, 0.42, 7);

  ISLANDS.forEach((isl, i) => {
    const kind = KINDS[isl.find.kind];
    const g = new THREE.Group();
    const { x, z } = isl.findSpot;
    g.position.set(x, terrainHeight(x, z), z);
    g.rotation.y = isl.find.angle + 1;
    kind.build(g);
    group.add(g);
    obstacles.push({ x, z, r: 0.9 });
    finds.push({ id: isl.name, island: isl, kind, x, z, y: g.position.y + 2.6, group: g });

    for (let k = 0; k < SHELLS_PER_ISLAND; k++) {
      const a = isl.find.angle + 1.3 + k * 2.1 + i, d = coastRadius(isl, a) * 0.955;
      const sx = isl.x + Math.cos(a) * d, sz = isl.z + Math.sin(a) * d;
      const m = paint(new THREE.Mesh(shellGeo), k % 2 ? 0xf7c9c0 : 0xf3e6d0);
      m.position.set(sx, terrainHeight(sx, sz) + 0.12, sz);
      m.rotation.set(1.3, a, 0.4);
      const id = `${i}-${k}`;
      m.visible = !save.shells.includes(id);
      group.add(m);
      shells.push({ id, island: isl, x: sx, z: sz, mesh: m });
    }
  });
  applyPaint(group);
  const openChest = (f) => { if (f.group.userData.chest) f.group.userData.chest.position.y = 0.55; };
  finds.forEach((f) => { if (save.finds.includes(f.id)) openChest(f); });

  return {
    group, finds, shells,
    total: finds.length,
    shellTotal: shells.length,
    // The curiosity on this island, with how far away the sailor is.
    on(isl) { return finds.find((f) => f.island === isl); },
    isFound: (f) => save.finds.includes(f.id),
    // Record a find. Returns true the first time.
    discover(f) {
      if (save.finds.includes(f.id)) return false;
      save.finds.push(f.id);
      if (f.kind.coins) save.coins += f.kind.coins;
      if (f.kind.reveal) for (const other of ISLANDS) if (!save.discovered.includes(other.name) && !save.rumoured.includes(other.name)) save.rumoured.push(other.name);
      openChest(f);
      persist();
      return true;
    },
    // Pick up any shell the sailor is standing on. Returns how many are now collected, or 0.
    collect(sailor) {
      for (const s of shells) {
        if (s.mesh.visible && s.island === sailor.island && Math.hypot(sailor.x - s.x, sailor.z - s.z) < 1.5) {
          s.mesh.visible = false;
          save.shells.push(s.id);
          persist();
          return save.shells.length;
        }
      }
      return 0;
    },
  };
}
