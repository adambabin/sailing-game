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
  { name: 'The Ash Road', x: 1320, z: -2500, r: 290 },
  { name: 'The Graveyard', x: 1450, z: 2750, r: 330 },
];
export const zoneAt = (x, z, pad = 0) => ZONES.find((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.r + pad) || null;

// Pirate captains have names, and prices on their heads.
const CAPTAINS = ['Black Tom Vane', 'Mad Annie Roche', 'Old Scratch', 'Redhand Mercer', 'Silent Jacoby', 'Iron Meg Darrow', 'Calico Finn', 'The Widow Sharpe', 'One-Eyed Lorcan', 'Bloody Bess Calloway', 'Gentleman Rook', 'Saltmouth Hale'];
let nextCaptain = Math.floor(Math.random() * CAPTAINS.length);
export const newCaptain = () => CAPTAINS[nextCaptain++ % CAPTAINS.length];
export const BOUNTY = { sloop: 160, brig: 320, galleon: 700 };

// ---- The pirate lords -----------------------------------------------------------------
// Each stretch of pirate water has a lord, in the same order as ZONES. A lord keeps out of
// sight until you have sunk or taken LORD_AFTER of their ships, then comes out in a big
// galleon to deal with you. Beating one earns a large bounty and the two rewards listed.
export const LORD_AFTER = 3, LORD_BOUNTY = 1500;
export const LORDS = [
  { name: 'Isaura Vane, the Serpent', look: { hull: 0x1e7a5e, trim: 0xd9a441, sail: 0x2b2b30, flag: 0x1e7a5e }, rewards: ['serpent', 'quickmatch'] },
  { name: 'Barnaby Crowe, the Hangman', look: { hull: 0x16161a, trim: 0xe9e2cf, sail: 0x16161a, flag: 0xe9e2cf }, rewards: ['deadman', 'ironwood'] },
  { name: 'Cinder Kate Morrow', look: { hull: 0x3a2a26, trim: 0xd9a441, sail: 0xa8281e, flag: 0xd9a441 }, rewards: ['ash', 'longguns'] },
  { name: 'Mordecai Finch, the Gravedigger', look: { hull: 0x4a4458, trim: 0xcfc9bd, sail: 0xcfc9bd, flag: 0x16161a }, rewards: ['grave', 'stormrig'] },
];
// How you stand with the lord of a stretch of water.
export function lordState(zone) {
  if (!save.lords[zone.name]) save.lords[zone.name] = { sunk: 0, beaten: false };
  return save.lords[zone.name];
}
export const lordOf = (zone) => LORDS[ZONES.indexOf(zone)];
export const lordsBeaten = () => ZONES.filter((z) => lordState(z).beaten).length;

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
