// Things to find ashore: one curiosity on every island, and shells on the beaches.

import * as THREE from 'three';
import { paint, applyPaint } from './materials.js';
import { ISLANDS, terrainHeight, coastRadius, islandPoint, obstacles } from './islands.js';
import { save, persist } from './save.js';

const STONE = 0x9d988b, WOOD = 0x7a5233, DARK = 0x3b3f47, BRASS = 0xd9a441, CLIFF_GREY = 0x8d8a82;

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
  // ---- The wider sea -----------------------------------------------------------------
  crater: {
    name: 'The crater’s edge', verb: 'Look into the crater',
    text: ['The ground is warm through your boots. Far below, something red moves slowly under a skin of black.', 'From the rim the whole northern sea lies open. You mark what you can see on your chart.'],
    reveal: true,
    build(g) {
      for (let i = 0; i < 5; i++) ball(g, 0.6 + (i % 3) * 0.25, 0x4a4541, Math.cos(i * 1.3) * 1.6, 0.3, Math.sin(i * 1.3) * 1.6, 1, 0.7, 1);
      cyl(g, 0.05, 2.4, WOOD, 0, 1.2, 0, 5);
      box(g, 0.9, 0.5, 0.04, 0xf0c05a, 0.47, 2.1, 0);
    },
  },
  hotspring: {
    name: 'The hot spring', verb: 'Soak your feet',
    text: ['A pool the colour of milk and jade, steaming gently among black rocks.', 'The harbour folk say an hour here cures anything a sailor can catch. You give it ten minutes.'],
    build(g) {
      const pool = cyl(g, 2.2, 0.16, 0x8fd6c4, 0, 0.1, 0, 14);
      pool.scale.z = 0.7;
      for (let i = 0; i < 7; i++) ball(g, 0.5 + (i % 2) * 0.3, 0x4a4541, Math.cos(i * 0.9) * 2.5, 0.25, Math.sin(i * 0.9) * 1.8, 1, 0.7, 1);
      ball(g, 0.35, 0xf1f1ee, 0.3, 1.0, 0.1, 1, 1.5, 1); // a curl of steam
    },
  },
  geyser: {
    name: 'The Kettle’s spout', verb: 'Wait for the spout',
    text: ['A hole in the rock no wider than a barrel, rimmed with yellow crust.', 'You wait. It grumbles, coughs, and throws a column of steam as high as a mainmast. You understand the name now.'],
    build(g) {
      const rim = paint(new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.28, 6, 12)), 0xcdbb5a);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.2;
      g.add(rim);
      cyl(g, 0.28, 3.2, 0xf1f1ee, 0, 1.8, 0, 8);
      ball(g, 0.8, 0xf1f1ee, 0, 3.7, 0);
    },
  },
  idol: {
    name: 'The stone face', verb: 'Study the stone face',
    text: ['A head of black stone taller than you, staring out to sea with an expression of mild disappointment.', 'Nobody knows who carved it. Somebody has left it a mango.'],
    build(g) {
      box(g, 1.3, 2.6, 1.1, 0x55504b, 0, 1.3, 0);
      box(g, 1.5, 0.35, 1.2, 0x4a4541, 0, 2.2, 0.08);
      box(g, 0.35, 0.9, 0.4, 0x4a4541, 0, 1.5, 0.6);
      ball(g, 0.17, 0xf2a03a, 0.5, 0.17, 1.0);
    },
  },
  clam: {
    name: 'The giant clam', verb: 'Look at the giant clam',
    text: ['Washed up on the lagoon side, a clam shell you could bathe a child in, its lip scalloped like a pie crust.', 'The other half is nowhere to be seen. You hope whatever opened it has gone.'],
    build(g) {
      const half = paint(new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), 0xf3e6d0, { double: true });
      half.rotation.x = Math.PI * 0.8;
      half.position.y = 0.5;
      half.scale.z = 0.7;
      g.add(half);
      ball(g, 0.16, 0xf6efe6, 0.1, 0.3, 0.2);
    },
  },
  divers: {
    name: 'The divers’ shrine', verb: 'Read the names',
    text: ['A post hung with dozens of shell necklaces, one for every pearl diver the town has lost to the deep.', 'The newest is still bright. You straighten it and move on quietly.'],
    build(g) {
      cyl(g, 0.14, 3, WOOD, 0, 1.5, 0, 6);
      box(g, 1.6, 0.12, 0.12, WOOD, 0, 2.5, 0);
      for (let i = 0; i < 5; i++) ball(g, 0.14, i % 2 ? 0xf7c9c0 : 0xf3e6d0, -0.6 + i * 0.3, 2.1 - (i % 2) * 0.2, 0.05);
      ball(g, 0.5, STONE, 0, 0.2, 0.7, 1, 0.5, 1);
    },
  },
  figurehead: {
    name: 'The figurehead', verb: 'Look at the figurehead',
    text: ['A carved woman with flaking gilt hair, propped upright in the sand of the bay, gazing at the water she once led a ship across.', 'Someone keeps her painted. You never learn who.'],
    build(g) {
      const body = box(g, 0.7, 2.2, 0.6, 0xe9e2cf, 0, 1.2, 0);
      body.rotation.x = -0.25;
      ball(g, 0.33, 0xd9a47a, 0, 2.5, 0.35);
      ball(g, 0.38, BRASS, 0, 2.6, 0.2, 1, 1, 0.8);
      box(g, 1.2, 0.3, 0.3, 0xe9e2cf, 0, 1.9, 0.25);
    },
  },
  whale: {
    name: 'The bones on the bar', verb: 'Walk among the bones',
    text: ['The ribs of a whale arch out of the sand, white as the sails of a ship laid up for good.', 'The wind makes a low note going through them. You stand a while and listen.'],
    build(g) {
      for (let i = 0; i < 6; i++) for (const side of [-1, 1]) {
        const rib = box(g, 0.16, 2.4 - Math.abs(i - 2.5) * 0.3, 0.16, 0xf1ede2, side * 0.9, 1.0, -3 + i * 1.2);
        rib.rotation.z = -side * 0.45;
      }
      box(g, 0.3, 0.3, 7.5, 0xf1ede2, 0, 0.2, 0);
      ball(g, 0.7, 0xf1ede2, 0, 0.5, 4.3, 1, 0.7, 1.5);
    },
  },
  hermit: {
    name: 'The hermit’s hut', verb: 'Knock at the hut',
    text: ['A hut of driftwood and a ship’s door, with a garden of sea-glass set out in careful rows.', 'Nobody answers. There is a kettle still warm on the stone, and a second cup set out, as if for you.'],
    build(g) {
      box(g, 2.6, 2, 2.2, 0x8a7a66, 0, 1, 0);
      const roof = paint(new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.2, 4)), 0x6e5a48);
      roof.position.y = 2.6;
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      box(g, 0.8, 1.5, 0.1, 0x2f6f8f, 0, 0.75, 1.13);
      for (let i = 0; i < 5; i++) ball(g, 0.1, [0x4f9a7a, 0x8fd0e8, 0xf0c05a][i % 3], -1 + i * 0.5, 0.08, 2);
    },
  },
  grave: {
    name: 'A pirate’s grave', verb: 'Read the marker',
    text: ['A cutlass driven into the ground for a cross, and a board: “Here lies Jem Harrow, who was never caught. Mind the third Stone.”', 'You do not know what that means. You suspect it is a joke.'],
    build(g) {
      const mound = ball(g, 1.1, 0xd8c48e, 0, 0.1, 0, 0.8, 0.3, 1.6);
      mound.position.y = 0.15;
      box(g, 0.08, 1.5, 0.16, 0xb9bcc2, 0, 0.9, -1.5);
      box(g, 0.5, 0.08, 0.2, DARK, 0, 1.2, -1.5);
      box(g, 0.8, 0.45, 0.06, WOOD, 0.7, 0.5, -1.5);
    },
  },
  watchtower: {
    name: 'The old watchtower', verb: 'Climb the watchtower',
    text: ['Stone to the height of a man, then timber, then nothing: the roof went in some gale before you were born.', 'From the top you can see all four Stones and a good deal more. You copy it onto your chart.'],
    reveal: true,
    build(g) {
      cyl(g, 1.6, 4, STONE, 0, 2, 0, 8);
      cyl(g, 1.75, 0.3, STONE, 0, 4.1, 0, 8);
      for (let i = 0; i < 4; i++) box(g, 0.5, 0.5, 0.4, STONE, Math.cos(i * 1.57) * 1.5, 4.5, Math.sin(i * 1.57) * 1.5);
      box(g, 0.7, 1.4, 0.2, 0x2a2420, 0, 0.7, 1.55);
    },
  },
  sundial: {
    name: 'The sundial', verb: 'Read the sundial',
    text: ['A bronze dial on a stone pillar, green with age, set here by some navigator to keep the islands’ time.', 'It is right to the quarter hour. Around the rim: “I count only the bright hours.”'],
    build(g) {
      cyl(g, 0.35, 1.1, STONE, 0, 0.55, 0, 8);
      cyl(g, 0.7, 0.1, 0x6f9a86, 0, 1.15, 0, 12);
      const gnomon = box(g, 0.05, 0.5, 0.6, BRASS, 0, 1.4, 0);
      gnomon.rotation.x = 0.6;
    },
  },
  well: {
    name: 'The wishing well', verb: 'Drop in a coin',
    text: ['A ring of mossy stone and a bucket on a rope that has outlived several buckets.', 'You drop in a coin and listen. It is a long time before the splash. You do not say what you wished for.'],
    coins: -1,
    build(g) {
      const ring = paint(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.9, 12, 1, true)), STONE, { double: true });
      ring.position.y = 0.45;
      g.add(ring);
      for (const x of [-1, 1]) cyl(g, 0.09, 2.2, WOOD, x, 1.1, 0, 6);
      box(g, 2.4, 0.12, 0.3, WOOD, 0, 2.25, 0);
      box(g, 0.35, 0.35, 0.35, WOOD, 0.3, 1.3, 0);
    },
  },
  eyrie: {
    name: 'The eagle’s ledge', verb: 'Go out onto the ledge',
    text: ['A shelf of rock above a drop that makes your knees remember they are knees. An old nest the size of a cartwheel sits at the end of it.', 'Below you the Ironbound Coast runs away south like the edge of a blade. You sketch it all.'],
    reveal: true,
    build(g) {
      box(g, 3, 0.4, 2, CLIFF_GREY, 0, 0.2, 0);
      const nest = paint(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.3, 6, 12)), 0x6e5a48);
      nest.rotation.x = Math.PI / 2;
      nest.position.set(0.6, 0.6, 0);
      g.add(nest);
      ball(g, 0.2, 0xf3efe2, 0.6, 0.6, 0, 1, 1.2, 1);
    },
  },
  anchor: {
    name: 'The great anchor', verb: 'Look at the great anchor',
    text: ['An anchor taller than a house, half sunk in the turf above the town, from a ship nobody alive has seen.', 'Children have worn its flukes smooth with climbing. The town is named for it, and not the other way round.'],
    build(g) {
      const shank = box(g, 0.4, 5, 0.4, DARK, 0, 2.6, 0);
      shank.rotation.z = 0.25;
      const arms = paint(new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.22, 6, 12, Math.PI)), DARK);
      arms.rotation.z = Math.PI + 0.25;
      arms.position.set(0.55, 0.7, 0);
      g.add(arms);
      box(g, 2.2, 0.3, 0.3, WOOD, -0.6, 4.7, 0).rotation.z = 0.25;
    },
  },
  cave: {
    name: 'The smugglers’ cave', verb: 'Search the cave',
    text: ['A cleft in the cliff, dry at the back, with a ring bolt in the wall and candle stubs on a ledge.', 'Behind a loose stone: an oilcloth bundle, 150 coins, and a list of names with every one crossed out but the last.'],
    coins: 150,
    build(g) {
      box(g, 3.4, 3, 1.2, 0x55504b, 0, 1.5, -0.8);
      box(g, 1.6, 2.1, 0.5, 0x1d1b1a, 0, 1.05, -0.2);
      box(g, 0.7, 0.5, 0.5, WOOD, 1.6, 0.25, 0.5);
      cyl(g, 0.3, 0.7, WOOD, -1.5, 0.35, 0.6);
    },
  },
  fort: {
    name: 'Fort Santa Brisa', verb: 'Walk the ramparts',
    text: ['Four walls of coral stone and a gate with no door, built against an enemy who never came.', 'Goats live in the powder magazine now. From the ramparts the whole western sea is yours, and you draw it.'],
    reveal: true,
    build(g) {
      for (const [x, z, w, d] of [[0, -4, 9, 1], [0, 4, 9, 1], [-4, 0, 1, 9], [4, 0, 1, 9]]) box(g, w, 3, d, 0xd9cfb8, x, 1.5, z);
      for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) cyl(g, 1.2, 4, 0xcfc4ab, x, 2, z, 8);
      box(g, 1.8, 2.2, 1.1, 0x2a2420, 0, 1.1, 4);
      cyl(g, 0.05, 3, WOOD, 4, 5.5, 4, 5);
      box(g, 1.0, 0.6, 0.04, 0xd9453c, 4.5, 6.6, 4);
    },
  },
  parrots: {
    name: 'The parrot tree', verb: 'Watch the parrots',
    text: ['One old fig tree, and in it more parrots than leaves: red, green, blue, and all of them talking.', 'One says “Hard a-port” very clearly. You look around. Nobody else seems to have heard.'],
    build(g) {
      cyl(g, 0.45, 4, WOOD, 0, 2, 0);
      ball(g, 3, 0x3d9450, 0, 5.2, 0, 1.2, 0.75, 1.2);
      [0xd9453c, 0x3a78c9, 0xf0c05a, 0x3aa66a, 0xd9453c, 0x3a78c9].forEach((c, i) => ball(g, 0.2, c, Math.cos(i * 1.1) * 2.4, 4.4 + (i % 3) * 0.7, Math.sin(i * 1.1) * 2.4, 1, 1.3, 1));
    },
  },
  hammock: {
    name: 'The best hammock in the islands', verb: 'Try the hammock',
    text: ['Slung between two palms at exactly the right height, facing exactly the right way, with a coconut within reach.', 'You tell yourself five minutes. The tide has turned by the time you wake.'],
    build(g) {
      for (const x of [-1.8, 1.8]) cyl(g, 0.14, 3.4, 0x9a7a55, x, 1.7, 0, 6);
      const sling = box(g, 3.4, 0.08, 0.9, 0xf3e6c8, 0, 1.1, 0);
      sling.scale.y = 1;
      ball(g, 0.2, 0x7a5233, 2.3, 0.2, 0.5);
    },
  },
  cross: {
    name: 'The farewell post', verb: 'Read the farewell post',
    text: ['A ship’s spar set upright at the end of the world, carved from top to bottom with names and dates.', 'It is where ships turned for home. You find a clear space near the bottom, and add your own.'],
    build(g) {
      cyl(g, 0.16, 4.2, 0x8f877a, 0, 2.1, 0, 6);
      box(g, 1.8, 0.14, 0.14, 0x8f877a, 0, 3.3, 0);
      ball(g, 0.4, STONE, 0.4, 0.15, 0.3, 1, 0.6, 1);
      ball(g, 0.3, STONE, -0.4, 0.12, 0.2, 1, 0.6, 1);
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
      // On the beach, a third of the way round from each other. Step along if that spot is open water.
      let a = isl.find.angle + 1.3 + k * 2.1 + i, p = null;
      for (let tries = 0; tries < 30; tries++, a += 0.21) {
        p = islandPoint(isl, a, coastRadius(isl, a) * 0.955);
        if (terrainHeight(p.x, p.z) > 0.25) break;
      }
      const sx = p.x, sz = p.z;
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
      if (f.kind.coins) save.coins = Math.max(0, save.coins + f.kind.coins); // a find may pay you, or (the well) cost you a coin
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
