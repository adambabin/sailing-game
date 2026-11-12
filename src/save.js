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
