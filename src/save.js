// The player's progress: coins, cargo, discoveries and purchases. It is kept
// in the browser's local storage so it survives closing the page.

const KEY = 'tradewind-save';

export const save = {
  coins: 100,
  cargo: {}, // good id -> number of crates
  hold: 20, // crates the ship can carry
  discovered: ['Port Marigold'], // islands seen up close
  rumoured: [], // islands heard about in a tavern
  visited: [], // ports where you have gone ashore
  maps: [], // treasure maps held: { id, island, x, z, tier, coins }
  treasures: 0, // chests dug up
  bottleDay: 0, // the last day a washed-up bottle was collected
  finds: [], // curiosities found, by island name
  shells: [], // shells picked up
  owned: [], // paints and sail cloth bought, as "part:value"
  upgrades: {},
  wanted: 0, // 0 = an honest sailor, up to 5 = hunted by the navy
  piratesSunk: 0,
  bountyDue: 0, // coins the navy owes you for pirates sunk, to collect at any harbour
  bountyPaid: 0,
  fleet: [], // ships sailing in company with you: { type, hull }
  prizes: 0, // ships captured
  jobs: [], // tavern work in hand
  jobsTaken: [], // today's offers already accepted, so they are not offered twice
  jobsDone: 0,
  lords: {}, // pirate lords, by the name of their waters: { sunk, beaten }
  creatures: {}, // sea creatures seen, by kind: how many times
  legends: {}, // legendary monsters beaten: { kraken: true, ... }
  fishLog: {},
  // Your home port, once you have bought a house: its port, what is built, the warehouse's stock,
  // ships laid up at the moorings, and what the businesses have made since you last collected.
  home: { port: '', built: {}, store: {}, moored: [], pending: { coins: 0, goods: {} } }, // fish caught, by kind: { n: how many, best: heaviest in kg }
  earned: [], // rewards that cannot be bought (see rewards.js)
  ships: ['sloop'], // kinds of ship you own
  shipType: 'sloop', // the one you are sailing
  ship: {}, // where the ship was left: position, heading, sail, anchor, time of day
  distance: 0, // metres sailed
  days: 1,
};

try {
  const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const k in save) if (typeof stored[k] === typeof save[k] && Array.isArray(stored[k]) === Array.isArray(save[k])) save[k] = stored[k];
} catch {}

let wiped = false;
export function persist() {
  if (wiped) return;
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch {}
}

export const cargoCount = () => Object.values(save.cargo).reduce((a, n) => a + n, 0);

// Forget all progress. Nothing more is saved until the page reloads.
export function wipe() {
  wiped = true;
  try { localStorage.removeItem(KEY); localStorage.removeItem('tradewind-look'); } catch {}
}
