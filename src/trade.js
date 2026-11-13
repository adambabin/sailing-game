// Trade goods and what they cost at each port. Every port makes something
// cheaply and pays well for something else, so there is always a worthwhile run.

export const GOODS = [
  { id: 'mango', name: 'Mangoes', base: 8 },
  { id: 'timber', name: 'Timber', base: 14 },
  { id: 'rum', name: 'Rum', base: 22 },
  { id: 'spice', name: 'Spice', base: 35 },
  { id: 'pearl', name: 'Pearls', base: 60 },
  { id: 'salt', name: 'Salt', base: 10 },
  { id: 'obsidian', name: 'Obsidian', base: 45 },
];

// Price multipliers per port, in the same order as GOODS (below 1 = cheap here).
const FACTORS = {
  'Port Marigold': [1.0, 1.2, 0.65, 1.3, 1.1, 1.2, 1.3],
  'Isla Hibiscus': [1.2, 0.6, 1.2, 0.7, 1.2, 1.3, 1.2],
  'Mango Key': [0.5, 1.4, 1.3, 1.1, 0.85, 1.1, 1.4],
  'Saint Avelle': [1.4, 1.0, 1.4, 1.3, 1.35, 1.4, 1.5],
  'Lantern Isle': [1.3, 1.3, 1.0, 1.2, 0.6, 1.0, 1.2],
  // The far ports. Long runs between them and home pay best.
  'Cinder Harbour': [1.5, 1.5, 1.3, 1.2, 1.3, 1.3, 0.5],
  'Ringtown': [1.3, 1.5, 1.2, 1.3, 0.5, 1.1, 1.45],
  'Driftwood Landing': [1.1, 0.9, 1.3, 1.4, 1.2, 0.45, 1.3],
  'Anchor Hold': [1.5, 0.7, 0.8, 1.5, 1.5, 1.5, 1.1],
  'Santa Brisa': [0.7, 0.8, 1.5, 0.6, 1.5, 1.6, 1.6],
};
export const PORT_NAMES = Object.keys(FACTORS);

export const TAVERNS = {
  'Port Marigold': 'The Gilded Marigold',
  'Isla Hibiscus': 'The Red Hibiscus',
  'Mango Key': 'The Sleepy Pelican',
  'Saint Avelle': 'The Saint’s Rest',
  'Lantern Isle': 'The Lamp & Anchor',
  'Cinder Harbour': 'The Smoking Kettle',
  'Ringtown': 'The Oyster Bed',
  'Driftwood Landing': 'The Stranded Whale',
  'Anchor Hold': 'The Iron Ring',
  'Santa Brisa': 'The Three Parrots',
};

// Who minds each place, port by port.
export const KEEPERS = {
  'Port Marigold': { tavern: 'Old Tomas', market: 'Marisol', shipwright: 'Henri' },
  'Isla Hibiscus': { tavern: 'Rosalind', market: 'Bas', shipwright: 'Ines' },
  'Mango Key': { tavern: 'Pelly', market: 'Auntie Jo', shipwright: 'Mateo' },
  'Saint Avelle': { tavern: 'Father Luc', market: 'Celeste', shipwright: 'Anselm' },
  'Lantern Isle': { tavern: 'Wick', market: 'Odile', shipwright: 'Corwin' },
  'Cinder Harbour': { tavern: 'Ember Sal', market: 'Tobias', shipwright: 'Greta' },
  'Ringtown': { tavern: 'Nacre', market: 'Old Benno', shipwright: 'Pilar' },
  'Driftwood Landing': { tavern: 'Jonah', market: 'Wren', shipwright: 'Silas' },
  'Anchor Hold': { tavern: 'Hobb', market: 'Maud', shipwright: 'Fergus' },
  'Santa Brisa': { tavern: 'Doña Inés', market: 'Rafael', shipwright: 'Catalina' },
};

function wobble(port, i, day) {
  const s = Math.sin(port.length * 12.9 + i * 78.2 + day * 37.7) * 43758.5453;
  return 0.92 + 0.16 * (s - Math.floor(s)); // prices drift a little from day to day
}

// What a crate costs to buy at a port today.
export function buyPrice(port, good, day) {
  const i = GOODS.indexOf(good);
  return Math.max(1, Math.round(good.base * FACTORS[port][i] * wobble(port, i, day)));
}
// Merchants pay a little less than they charge.
export const sellPrice = (port, good, day) => Math.max(1, Math.floor(buyPrice(port, good, day) * 0.92));

// The best place to buy and to sell a good, going by the usual prices.
export function bestRoute(good) {
  const i = GOODS.indexOf(good);
  let cheap = PORT_NAMES[0], dear = PORT_NAMES[0];
  for (const p of PORT_NAMES) {
    if (FACTORS[p][i] < FACTORS[cheap][i]) cheap = p;
    if (FACTORS[p][i] > FACTORS[dear][i]) dear = p;
  }
  return { cheap, dear };
}
