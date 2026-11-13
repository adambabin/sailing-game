// Treasure maps. A map is a sketch of one island with an X on it but no name:
// you work out which island it shows, sail there, and dig.

import * as THREE from 'three';
import { paint, applyPaint } from './materials.js';
import { ISLANDS, terrainHeight, coastRadius, islandPoint, islandGrid, onDock, obstacles } from './islands.js';
import { save, persist } from './save.js';

export const MAP_PRICE = 60, MAX_MAPS = 3;

// Rarer maps lead to richer hauls.
const TIERS = [
  { name: 'A weathered map', chance: 0.68, coins: [150, 260] },
  { name: 'A fine map', chance: 0.26, coins: [300, 460] },
  { name: 'A captain’s map', chance: 0.06, coins: [650, 900] },
];
const FOUND_WITHIN = 5, WARM_WITHIN = 28; // metres from the X

const rand = (a, b) => a + Math.random() * (b - a);

// Pick somewhere on dry, open ground for the X.
function pickSpot() {
  for (let tries = 0; tries < 300; tries++) {
    const isl = ISLANDS[Math.floor(Math.random() * ISLANDS.length)];
    if (save.maps.some((m) => m.island === isl.name)) continue; // one map per island at a time
    const a = rand(0, Math.PI * 2), d = rand(0.3, 0.86);
    const { x, z } = islandPoint(isl, a, coastRadius(isl, a) * d);
    const h = terrainHeight(x, z);
    if (h < 1.2 || h > Math.max(8, isl.H * 0.55)) continue; // not in the surf, not up a cliff
    if (onDock(isl, x, z) || obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 3)) continue;
    if (Math.hypot(x - isl.findSpot.x, z - isl.findSpot.z) < 10) continue;
    return { island: isl.name, x, z };
  }
  return null;
}

function newMap() {
  const spot = pickSpot();
  if (!spot) return null;
  let roll = Math.random(), tier = 0;
  while (tier < TIERS.length - 1 && (roll -= TIERS[tier].chance) > 0) tier++;
  const [lo, hi] = TIERS[tier].coins;
  return { id: Date.now() + '-' + Math.floor(Math.random() * 1e4), ...spot, tier, coins: Math.round(rand(lo, hi) / 5) * 5 };
}

export function createTreasure() {
  const group = new THREE.Group();

  // The bottle that washes up on one beach each day, with a map inside.
  const bottle = new THREE.Group();
  const glass = paint(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8)), 0x4f9a7a);
  glass.rotation.z = 1.2;
  glass.position.y = 0.18;
  const cork = paint(new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5)), 0xc9a06c);
  cork.position.set(0.3, 0.3, 0);
  bottle.add(glass, cork);
  group.add(bottle);
  const bottleSpot = { island: null, x: 0, z: 0, day: -1 };
  function placeBottle() {
    if (bottleSpot.day === save.days) return;
    bottleSpot.day = save.days;
    const isl = ISLANDS[(save.days * 7 + 3) % ISLANDS.length];
    let a = save.days * 2.4 + 0.7, p = null;
    for (let tries = 0; tries < 30; tries++, a += 0.21) { p = islandPoint(isl, a, coastRadius(isl, a) * 0.95); if (terrainHeight(p.x, p.z) > 0.25) break; }
    bottleSpot.island = isl;
    bottleSpot.x = p.x;
    bottleSpot.z = p.z;
    bottle.position.set(bottleSpot.x, terrainHeight(bottleSpot.x, bottleSpot.z), bottleSpot.z);
    bottle.rotation.y = a;
  }

  // An opened chest left behind wherever you have dug one up this session.
  function leaveChest(x, z) {
    const g = new THREE.Group();
    const add = (w, h, d, color, y, zz) => { const m = paint(new THREE.Mesh(new THREE.BoxGeometry(w, h, d)), color); m.position.set(0, y, zz); g.add(m); return m; };
    add(1.0, 0.55, 0.65, 0x7a5233, 0.28, 0);
    add(0.86, 0.1, 0.5, 0xf0c05a, 0.56, 0); // the gleam of what was inside
    add(1.0, 0.12, 0.65, 0x7a5233, 0.75, -0.42).rotation.x = -1.1; // lid thrown back
    const mound = paint(new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)), 0xd8c48e);
    mound.scale.y = 0.4;
    mound.position.set(1.3, 0, 0.3);
    g.add(mound);
    g.position.set(x, terrainHeight(x, z) - 0.05, z);
    g.rotation.y = rand(0, 6.28);
    applyPaint(g);
    group.add(g);
  }
  applyPaint(group);

  return {
    group,
    tierName: (m) => TIERS[m.tier].name,
    bottleIsland: () => (save.bottleDay === save.days ? null : bottleSpot.island),
    canHoldMore: () => save.maps.length < MAX_MAPS,
    // Add a new map to the player's collection. Returns it, or null if there is no room.
    gainMap() {
      if (save.maps.length >= MAX_MAPS) return null;
      const m = newMap();
      if (!m) return null;
      save.maps.push(m);
      persist();
      return m;
    },
    update() {
      placeBottle();
      bottle.visible = save.bottleDay !== save.days;
    },
    // Walking over the day's bottle picks it up. Returns the map inside, 'full' if you cannot carry more, or null.
    collectBottle(sailor) {
      if (!bottle.visible || sailor.island !== bottleSpot.island || Math.hypot(sailor.x - bottleSpot.x, sailor.z - bottleSpot.z) > 1.6) return null;
      if (save.maps.length >= MAX_MAPS) return 'full';
      save.bottleDay = save.days;
      return this.gainMap();
    },
    // Dig where the sailor stands. Tells you whether you struck treasure, are close, or found nothing.
    dig(sailor) {
      let warm = false;
      for (const m of save.maps) {
        if (m.island !== sailor.island.name) continue;
        const d = Math.hypot(sailor.x - m.x, sailor.z - m.z);
        if (d < FOUND_WITHIN) {
          save.maps = save.maps.filter((x) => x !== m);
          save.coins += m.coins;
          save.treasures++;
          persist();
          leaveChest(m.x, m.z);
          return { found: m };
        }
        if (d < WARM_WITHIN) warm = true;
      }
      return { found: null, warm };
    },
    // Draw a map onto a canvas. `sailor` is passed when you are standing on the island it shows.
    draw(canvas, m, sailor) {
      const isl = ISLANDS.find((i) => i.name === m.island);
      const S = 280, scale = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = canvas.height = S * scale;
      const g = canvas.getContext('2d');
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.fillStyle = '#e6d3a3';
      g.fillRect(0, 0, S, S);
      // Stains and worn edges.
      for (let i = 0; i < 9; i++) {
        g.fillStyle = `rgba(120, 84, 40, ${0.04 + ((i * 37) % 10) / 200})`;
        g.beginPath();
        g.arc((i * 97 + m.coins) % S, (i * 61 + m.coins * 3) % S, 18 + ((i * 29) % 40), 0, 7);
        g.fill();
      }
      const k = (S * 0.36) / (isl.span * 1.3); // metres to pixels
      const X = (x) => S / 2 + (x - isl.x) * k, Y = (z) => S / 2 + (z - isl.z) * k;
      g.strokeStyle = '#4a3423';
      g.lineJoin = 'round';
      // The land, inked in from the island's real shape (so lagoons and long bars come out right).
      const grid = islandGrid(isl), px = grid.cell * k;
      for (let j = 0; j < grid.n; j++) {
        for (let i = 0; i < grid.n; i++) {
          const v = grid.cells[j * grid.n + i];
          if (v < 2) continue;
          const cx = X(isl.x - grid.half + i * grid.cell), cy = Y(isl.z - grid.half + j * grid.cell);
          g.fillStyle = v >= 4 ? 'rgba(120, 96, 52, 0.55)' : 'rgba(160, 140, 80, 0.42)';
          g.fillRect(cx - 0.3, cy - 0.3, px + 0.6, px + 0.6);
          // A dark edge wherever land meets water.
          g.fillStyle = '#4a3423';
          if (i === 0 || grid.cells[j * grid.n + i - 1] < 2) g.fillRect(cx - 1, cy, 1.6, px);
          if (i === grid.n - 1 || grid.cells[j * grid.n + i + 1] < 2) g.fillRect(cx + px - 0.6, cy, 1.6, px);
          if (j === 0 || grid.cells[(j - 1) * grid.n + i] < 2) g.fillRect(cx, cy - 1, px, 1.6);
          if (j === grid.n - 1 || grid.cells[(j + 1) * grid.n + i] < 2) g.fillRect(cx, cy + px - 0.6, px, 1.6);
        }
      }
      g.lineWidth = 1.3;
      // Landmarks: hills, a lighthouse, a dock.
      if (isl.H > 20) for (const [dx, dy] of [[0, 0], [-13, 6], [12, 8]]) { g.beginPath(); g.moveTo(S / 2 + dx - 9, S / 2 + dy + 6); g.lineTo(S / 2 + dx, S / 2 + dy - 8); g.lineTo(S / 2 + dx + 9, S / 2 + dy + 6); g.stroke(); }
      if (isl.lighthouse) { g.beginPath(); g.rect(S / 2 - 2.5, S / 2 - 16, 5, 13); g.stroke(); g.beginPath(); g.arc(S / 2, S / 2 - 19, 3, 0, 7); g.stroke(); }
      if (isl.portInfo) {
        const p = isl.portInfo;
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(X(isl.x + p.ux * p.start), Y(isl.z + p.uz * p.start)); g.lineTo(X(isl.x + p.ux * p.end), Y(isl.z + p.uz * p.end)); g.stroke();
        g.lineWidth = 1.3;
        for (const pl of p.places) g.strokeRect(X(pl.x) - 3, Y(pl.z) - 3, 6, 6);
      }
      // A few waves in the sea around it.
      g.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const wx = 26 + ((i * 83 + m.coins) % (S - 60)), wy = 22 + ((i * 131 + m.coins * 2) % (S - 44));
        if (Math.hypot(wx - S / 2, wy - S / 2) < S * 0.4) continue;
        g.beginPath(); g.moveTo(wx, wy); g.quadraticCurveTo(wx + 4, wy - 5, wx + 8, wy); g.quadraticCurveTo(wx + 12, wy - 5, wx + 16, wy); g.stroke();
      }
      // The X.
      g.strokeStyle = '#a3261c';
      g.lineWidth = 3;
      const mx = X(m.x), my = Y(m.z);
      g.beginPath(); g.moveTo(mx - 6, my - 6); g.lineTo(mx + 6, my + 6); g.moveTo(mx + 6, my - 6); g.lineTo(mx - 6, my + 6); g.stroke();
      // You, once you are standing on the right island.
      if (sailor && sailor.island === isl) {
        g.fillStyle = '#1f2f45';
        g.beginPath(); g.arc(X(sailor.x), Y(sailor.z), 4, 0, 7); g.fill();
        g.strokeStyle = '#e6d3a3'; g.lineWidth = 1.5; g.stroke();
      }
      // North.
      g.strokeStyle = g.fillStyle = '#4a3423';
      g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(S - 26, 44); g.lineTo(S - 26, 18); g.lineTo(S - 31, 27); g.moveTo(S - 26, 18); g.lineTo(S - 21, 27); g.stroke();
      g.font = "13px 'IM Fell English', Georgia, serif";
      g.textAlign = 'center';
      g.fillText('N', S - 26, 58);
    },
  };
}
