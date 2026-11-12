// Who is who at sea, where the pirates keep, and how the world feels about you.

import { save, persist } from './save.js';

export const FACTIONS = {
  merchant: { name: 'Merchant', look: [{ hull: 0x5a3a2a, trim: 0xe9dcc0, sail: 0xf1e8d2, flag: 0xf0c05a }, { hull: 0x2f6b4a, trim: 0xf2d9a0, sail: 0xe9dcc0, flag: 0xffffff }, { hull: 0x6e2f2a, trim: 0xf2d9a0, sail: 0xf4efe2, flag: 0xf0c05a }] },
  navy: { name: 'Navy', look: [{ hull: 0x1f3a5f, trim: 0xffffff, sail: 0xffffff, flag: 0x3a78c9 }] },
  pirate: { name: 'Pirate', look: [{ hull: 0x1d1d22, trim: 0x8c2a22, sail: 0x3a3a40, flag: 0x111114 }] },
};

// Pirate waters. Stay out of these circles and no pirate will trouble you.
export const ZONES = [
  { name: 'The Serpent’s Run', x: -350, z: 540, r: 300 },
  { name: 'Deadman’s Reach', x: 1210, z: -810, r: 320 },
];
export const zoneAt = (x, z, pad = 0) => ZONES.find((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.r + pad) || null;

// Pirate captains have names, and prices on their heads.
const CAPTAINS = ['Black Tom Vane', 'Mad Annie Roche', 'Old Scratch', 'Redhand Mercer', 'Silent Jacoby', 'Iron Meg Darrow', 'Calico Finn', 'The Widow Sharpe', 'One-Eyed Lorcan', 'Bloody Bess Calloway', 'Gentleman Rook', 'Saltmouth Hale'];
let nextCaptain = Math.floor(Math.random() * CAPTAINS.length);
export const newCaptain = () => CAPTAINS[nextCaptain++ % CAPTAINS.length];
export const BOUNTY = { sloop: 160, brig: 320, galleon: 700 };

// ---- Your standing ------------------------------------------------------------------
// `wanted` runs from 0 (an honest sailor) to 5. It rises when you fire on merchants or
// the navy, and falls by one each day or all at once when you pay the fine.
export const MAX_WANTED = 5, FINE_PER_LEVEL = 120;
export const wanted = () => save.wanted;
export const isWanted = () => save.wanted >= 1;
export function addWanted(n, atLeast = 0) {
  const before = save.wanted;
  save.wanted = Math.min(MAX_WANTED, Math.max(save.wanted + n, atLeast));
  persist();
  return before < 1 && save.wanted >= 1; // true when you have just become wanted
}
export function coolOff() {
  if (save.wanted > 0) { save.wanted = Math.max(0, save.wanted - 1); persist(); }
}
export const fine = () => Math.ceil(save.wanted) * FINE_PER_LEVEL;
export function payFine() {
  save.coins -= fine();
  save.wanted = 0;
  persist();
}
// Honest merchants give a wanted captain worse prices: up to 40% dearer to buy, 40% less to sell.
export const priceUp = () => 1 + Math.min(0.4, Math.floor(save.wanted) * 0.1);
export const priceDown = () => 1 - Math.min(0.4, Math.floor(save.wanted) * 0.1);
