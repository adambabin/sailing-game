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
  owned: [], // paints and sail cloth bought, as "part:value"
  upgrades: {},
  distance: 0, // metres sailed
  days: 1,
};

try {
  const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const k in save) if (typeof stored[k] === typeof save[k] && Array.isArray(stored[k]) === Array.isArray(save[k])) save[k] = stored[k];
} catch {}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch {}
}

export const cargoCount = () => Object.values(save.cargo).reduce((a, n) => a + n, 0);
