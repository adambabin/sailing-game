// Your home port. Buy a house in any port (at its tavern) and build up around it:
// a warehouse to store cargo, moorings where your spare ships lie, businesses
// that earn while you are away, and a trophy hall for everything you have done.
// The buildings stand on plots every port keeps free (islands.js, homeLots), so
// moving your home simply puts them up again in the new port.

import * as THREE from 'three';
import { paint, applyPaint } from './materials.js';
import { ISLANDS, obstacles, terrainHeight, nightLights } from './islands.js';
import { waveHeight } from './waves.js';
import { buildNpcModel } from './ship.js';
import { save, persist, cargoCount } from './save.js';
import { GOODS, buyPrice } from './trade.js';
import { ZONES, LORDS, lordState } from './factions.js';

export const HOME_PRICE = 600, MOVE_PRICE = 300;
export const WAREHOUSE_SPACE = 100; // crates the warehouse holds
const PENDING_DAYS = 5; // businesses stop making more once this many days' worth is waiting

// What can be built. `lot` is which of the port's plots it stands on (0 is the house).
// `makes` is what a business produces each day.
export const BUILDINGS = {
  warehouse: { name: 'Warehouse', cost: 300, lot: 1, detail: `Store up to ${WAREHOUSE_SPACE} crates of cargo and fish here, safe from the sea.` },
  moorings: { name: 'Moorings', cost: 250, lot: null, detail: 'Your spare ships lie here. Lay up fleet ships to stop paying their wages; they are mended while they wait.' },
  trophy: { name: 'Trophy hall', cost: 350, lot: 2, detail: 'A place to show off your catches, your finds and your victories.' },
  smokehouse: { name: 'Fish smokehouse', cost: 400, lot: 3, detail: 'Smokes the local catch and sells it: 35 coins a day.', makes: { coins: 35 } },
  plantation: { name: 'Plantation', cost: 700, lot: 4, detail: 'Grows 4 crates a day of mangoes, timber or spice, whichever this island grows best, to sell elsewhere.', makes: { crates: 4, good: 'cheapest' } },
  distillery: { name: 'Rum distillery', cost: 1100, lot: 5, detail: 'Makes 3 crates of rum a day.', makes: { crates: 3, good: 'rum' } },
};
const DOORS = { house: 'Go into your house', warehouse: 'Open the warehouse', trophy: 'Visit the trophy hall', smokehouse: 'Look in at the smokehouse', plantation: 'Walk the plantation', distillery: 'Look in at the distillery' };
export const LABELS = { house: 'Your house', warehouse: 'Warehouse', trophy: 'Trophy hall', smokehouse: 'Smokehouse', plantation: 'Plantation', distillery: 'Distillery' };

export const homeIsland = () => (save.home.port ? ISLANDS.find((i) => i.name === save.home.port) : null);
export const has = (id) => !!save.home.built[id];
export const storeCount = () => Object.values(save.home.store).reduce((a, n) => a + n, 0);

// Which crop a plantation in this port grows today: of the things that grow (mangoes, timber, spice), the cheapest here.
const CROPS = ['mango', 'timber', 'spice'];
export function plantationGood(port, day) {
  const crops = GOODS.filter((g) => CROPS.includes(g.id));
  let best = crops[0];
  for (const g of crops) if (buyPrice(port, g, day) / g.base < buyPrice(port, best, day) / best.base) best = g;
  return best;
}

// A new day: the businesses make their goods (up to a few days' worth waiting), and laid-up ships are mended.
export function newDay() {
  if (!save.home.port) return;
  const p = save.home.pending;
  for (const [id, b] of Object.entries(BUILDINGS)) {
    if (!has(id) || !b.makes) continue;
    if (b.makes.coins) p.coins = Math.min(p.coins + b.makes.coins, b.makes.coins * PENDING_DAYS);
    if (b.makes.crates) {
      const good = b.makes.good === 'rum' ? 'rum' : plantationGood(save.home.port, save.days).id;
      const cap = b.makes.crates * PENDING_DAYS;
      const mine = id + ':' + good;
      p.goods[mine] = Math.min((p.goods[mine] || 0) + b.makes.crates, cap);
    }
  }
  for (const m of save.home.moored) m.hull = 1;
  persist();
}
// Gather what the businesses have made: coins to the purse, crates to the warehouse (or the hold).
// Returns a sentence saying what was collected.
export function collect(holdRoom) {
  const p = save.home.pending, bits = [];
  if (p.coins) { save.coins += p.coins; bits.push(`${p.coins} coins`); p.coins = 0; }
  let room = holdRoom;
  for (const key of Object.keys(p.goods)) {
    const good = key.split(':')[1];
    let n = p.goods[key];
    const toStore = has('warehouse') ? Math.min(n, WAREHOUSE_SPACE - storeCount()) : 0;
    if (toStore > 0) { save.home.store[good] = (save.home.store[good] || 0) + toStore; n -= toStore; }
    const toHold = Math.min(n, room);
    if (toHold > 0) { save.cargo[good] = (save.cargo[good] || 0) + toHold; n -= toHold; room -= toHold; }
    const taken = p.goods[key] - n;
    if (taken) bits.push(`${taken} crates of ${GOODS.find((g) => g.id === good).name.toLowerCase()}` + (toStore > 0 ? (toHold > 0 ? ' (warehouse and hold)' : ' (to the warehouse)') : ' (to the hold)'));
    if (n > 0) p.goods[key] = n; else delete p.goods[key];
  }
  persist();
  return bits.length ? 'Collected ' + bits.join(', ') + '.' : 'Nothing waiting yet. Your businesses make their goods each morning.';
}
export const pendingText = () => {
  const p = save.home.pending, bits = [];
  if (p.coins) bits.push(`${p.coins} coins`);
  for (const [key, n] of Object.entries(p.goods)) bits.push(`${n} crates of ${GOODS.find((g) => g.id === key.split(':')[1]).name.toLowerCase()}`);
  return bits.join(', ');
};

// ---- The buildings themselves ----------------------------------------------------------
function kit(g) {
  const box = (w, h, d, color, x, y, z, opts) => { const m = paint(new THREE.Mesh(new THREE.BoxGeometry(w, h, d)), color, opts); m.position.set(x, y, z); g.add(m); return m; };
  const cyl = (r, h, color, x, y, z, sides = 8, r2 = r) => { const m = paint(new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, sides)), color); m.position.set(x, y, z); g.add(m); return m; };
  const roof = (w, d, h, color, y) => { const m = paint(new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, h, 4)), color); m.position.y = y; m.rotation.y = Math.PI / 4; m.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); g.add(m); return m; };
  return { box, cyl, roof };
}
// Your house: two storeys, a balcony, and your own flag flying over it.
function buildHouse(g, look) {
  const { box, cyl, roof } = kit(g);
  box(9, 8, 8, 0xfaf0dc, 0, 3, 0);
  roof(10.5, 9.5, 4, 0x2f6f8f, 9);
  box(1.6, 2.8, 0.2, 0x5a3a22, 0, 1.4, 4.05);
  for (const x of [-2.8, 2.8]) for (const y of [2.2, 5.3]) nightLights.push(box(1.3, 1.2, 0.2, 0xffd98a, x, y, 4.05, { glow: true }));
  box(9.4, 0.25, 1.6, 0x8a6a45, 0, 4.1, 4.6);
  cyl(0.08, 7, 0x5a3a22, 3.8, 10.5, -3);
  const flag = box(1.8, 1.1, 0.06, look.flag, 4.75, 13.3, -3);
  flag.userData.paint.part = 'flag';
  return { r: 6.2, door: 5.2, top: 13 };
}
function buildWarehouse(g) {
  const { box } = kit(g);
  box(12, 6, 8, 0xb88a5a, 0, 2, 0);
  const r = box(13, 0.4, 9.2, 0x7a4a2e, 0, 5.4, 0);
  r.rotation.x = 0.06;
  box(4, 4, 0.25, 0x5a3a22, 0, 2, 4.05);
  for (const [x, z, s] of [[-4.6, 5.2, 1.2], [-3.2, 5.4, 1], [4.4, 5.3, 1.3], [5, 6.4, 0.9]]) box(s, s, s, 0x8a6a45, x, s / 2, z);
  return { r: 7, door: 5.8, top: 7.5 };
}
function buildTrophyHall(g) {
  const { box, cyl, roof } = kit(g);
  box(10, 6.5, 8, 0xf4efe2, 0, 2.2, 0);
  roof(11, 9, 3, 0x8f3f2f, 7.3);
  for (const x of [-3.6, -1.2, 1.2, 3.6]) cyl(0.35, 5, 0xffffff, x, 2.5, 4.6, 10);
  box(10, 0.4, 1.8, 0xe8e0cc, 0, 5.2, 4.6);
  box(1.8, 3, 0.2, 0x5a3a22, 0, 1.5, 4.05);
  // A flag for every pirate lord beaten, flying in a row out front.
  ZONES.forEach((zone, i) => {
    if (!lordState(zone).beaten) return;
    const x = -4.5 + i * 3;
    cyl(0.07, 6, 0x5a3a22, x, 3, 7.4);
    box(1.4, 0.9, 0.06, LORDS[i].look.flag, x + 0.75, 5.4, 7.4);
  });
  return { r: 6.4, door: 6.4, top: 9 };
}
function buildSmokehouse(g) {
  const { box, cyl, roof } = kit(g);
  box(6, 4, 5, 0x6b5440, 0, 1.5, 0);
  roof(6.8, 5.8, 2.2, 0x3a2a20, 4.6);
  cyl(0.5, 3, 0x5a4a40, 1.8, 5.5, -1);
  box(1.3, 2.4, 0.2, 0x3a2418, 0, 1.2, 2.55);
  // Fish hanging on a rack outside.
  box(4, 0.12, 0.12, 0x5a3a22, 0, 2.1, 3.6);
  for (let i = 0; i < 5; i++) box(0.25, 0.8, 0.12, 0xc9a35a, -1.6 + i * 0.8, 1.6, 3.6);
  return { r: 4.2, door: 3.6, top: 6.5, smoke: { x: 1.8, y: 7, z: -1 } };
}
function buildPlantation(g) {
  const { box, cyl } = kit(g);
  box(3.5, 3, 3, 0xd9b98a, -5, 1.2, -4);
  const leaf = new THREE.ConeGeometry(0.6, 1.4, 6);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const m = paint(new THREE.Mesh(leaf), (r + c) % 2 ? 0x4f9a3a : 0x5fae48);
    m.position.set(-3.5 + c * 1.6, 0.7, -1.5 + r * 1.7);
    g.add(m);
  }
  for (const x of [-4.6, 5.2]) cyl(0.06, 1.2, 0x8a6a45, x, 0.6, 4.4);
  box(9.8, 0.08, 0.08, 0x8a6a45, 0.3, 1.0, 4.4);
  return { r: 3, door: 5, top: 4.5 };
}
function buildDistillery(g) {
  const { box, cyl, roof } = kit(g);
  box(8, 5, 6, 0xe8d4b0, 0, 1.8, 0);
  roof(9, 7, 2.6, 0x7a4a2e, 5.6);
  box(1.6, 2.6, 0.2, 0x5a3a22, 0, 1.3, 3.05);
  cyl(1.1, 2.4, 0xc0763a, -2.6, 1.2, 4.2, 12); // the copper still
  const top = paint(new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.2, 12)), 0xc0763a);
  top.position.set(-2.6, 3, 4.2);
  g.add(top);
  for (const [x, z] of [[2.4, 4.2], [3.4, 4.3], [2.9, 5.2]]) cyl(0.5, 1.1, 0x7a5233, x, 0.55, z, 10);
  return { r: 5, door: 4.6, top: 7.5 };
}
const BUILDERS = { house: buildHouse, warehouse: buildWarehouse, trophy: buildTrophyHall, smokehouse: buildSmokehouse, plantation: buildPlantation, distillery: buildDistillery };

// `getLook()` gives the player's colours, for the house flag and the moored ships.
export function createHome(waves, getLook) {
  const group = new THREE.Group();
  const doors = []; // { id, label, x, z, y }
  const moored = []; // { model, x, z, heading, bob }
  const smoke = [];
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x9a948c, transparent: true, opacity: 0.45, depthWrite: false });
  const puffGeo = new THREE.SphereGeometry(1, 8, 6);

  function clear() {
    for (let i = obstacles.length - 1; i >= 0; i--) if (obstacles[i].home) obstacles.splice(i, 1);
    for (const l of [...nightLights]) if (l.userData.home) nightLights.splice(nightLights.indexOf(l), 1);
    group.clear();
    doors.length = moored.length = smoke.length = 0;
  }

  // Put up everything that has been built, in the home port. Call after any change.
  function rebuild() {
    clear();
    const isl = homeIsland();
    if (!isl) return;
    const lots = isl.portInfo.lots, look = getLook();
    const ids = ['house', ...Object.keys(BUILDERS).filter((id) => id !== 'house' && has(id))];
    for (const id of ids) {
      const lot = lots[id === 'house' ? 0 : BUILDINGS[id].lot];
      if (!lot) continue;
      const g = new THREE.Group();
      g.position.set(lot.x, terrainHeight(lot.x, lot.z) - 0.4, lot.z);
      g.rotation.y = lot.face;
      const before = nightLights.length;
      const size = BUILDERS[id](g, look);
      for (let i = before; i < nightLights.length; i++) nightLights[i].userData.home = true;
      group.add(g);
      obstacles.push({ x: lot.x, z: lot.z, r: size.r, home: true });
      const dx = Math.sin(lot.face) * size.door, dz = Math.cos(lot.face) * size.door;
      doors.push({ id, label: LABELS[id], action: DOORS[id], x: lot.x + dx, z: lot.z + dz, y: g.position.y + size.top });
      if (size.smoke) {
        for (let i = 0; i < 5; i++) {
          const puff = new THREE.Mesh(puffGeo, smokeMat);
          group.add(puff);
          const local = new THREE.Vector3(size.smoke.x, size.smoke.y, size.smoke.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), lot.face);
          smoke.push({ puff, phase: i / 5, x: lot.x + local.x, y: g.position.y + local.y, z: lot.z + local.z });
        }
      }
    }
    // Ships lying at your moorings: the ships you own but are not sailing, and any laid up from the fleet.
    if (has('moorings')) {
      const spots = isl.portInfo.moorings;
      const ships = [...save.ships.filter((id) => id !== save.shipType).map((type) => ({ type })), ...save.home.moored];
      ships.slice(0, spots.length).forEach((m, i) => {
        const model = buildNpcModel(m.type, look);
        group.add(model.group);
        moored.push({ model: model.group, x: spots[i].x, z: spots[i].z, heading: spots[i].heading + (i % 2 ? 0.3 : -0.3), bob: i * 1.7 });
      });
      for (const s of spots) {
        const buoy = paint(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6)), 0xd9453c);
        buoy.position.set(s.x + 8, 0, s.z);
        group.add(buoy);
        moored.push({ model: buoy, x: s.x + 8, z: s.z, heading: 0, bob: 0, buoy: true });
      }
    }
    applyPaint(group);
  }

  return {
    group, doors,
    rebuild,
    // Ships bob at their moorings and the smokehouse chimney smokes.
    update(dt, time, wind) {
      if (!save.home.port) return;
      for (const m of moored) {
        const y = waveHeight(waves, m.x, m.z, time);
        m.model.position.set(m.x, y * (m.buoy ? 1 : 0.5) + (m.buoy ? 0.1 : 0.3), m.z);
        m.model.rotation.set(Math.sin(time * 0.5 + m.bob) * 0.03, m.heading, Math.sin(time * 0.37 + m.bob) * 0.04);
      }
      for (const s of smoke) {
        const k = (time * 0.12 + s.phase) % 1;
        s.puff.position.set(s.x + wind.dx * k * 14, s.y + k * 12, s.z + wind.dz * k * 14);
        s.puff.scale.setScalar((0.7 + 2.4 * k) * (k > 0.8 ? (1 - k) / 0.2 : 1));
      }
    },
    // The door you are standing at, if any.
    doorAt(x, z) {
      return doors.find((d) => Math.hypot(x - d.x, z - d.z) < 4.5) || null;
    },
  };
}

// Buy a house here (or move your home here). Your buildings and stored goods come with you.
export function settle(isl) {
  const moving = !!save.home.port;
  save.coins -= moving ? MOVE_PRICE : HOME_PRICE;
  save.home.port = isl.name;
  persist();
  return moving;
}
export function build(id) {
  save.coins -= BUILDINGS[id].cost;
  save.home.built[id] = true;
  persist();
}
// Move crates between the hold and the warehouse. `n` > 0 stores, < 0 takes out. Returns how many moved.
export function shift(good, n, holdRoom) {
  if (n > 0) n = Math.min(n, save.cargo[good] || 0, WAREHOUSE_SPACE - storeCount());
  else n = -Math.min(-n, save.home.store[good] || 0, holdRoom);
  if (!n) return 0;
  save.cargo[good] = (save.cargo[good] || 0) - n;
  save.home.store[good] = (save.home.store[good] || 0) + n;
  if (!save.cargo[good]) delete save.cargo[good];
  if (!save.home.store[good]) delete save.home.store[good];
  persist();
  return n;
}
export { cargoCount };
