// Trade goods and what they cost at each port. Every port makes something
// cheaply and pays well for something else, so there is always a worthwhile run.

export const GOODS = [
  { id: 'mango', name: 'Mangoes', base: 8 },
  { id: 'timber', name: 'Timber', base: 14 },
  { id: 'rum', name: 'Rum', base: 22 },
  { id: 'spice', name: 'Spice', base: 35 },
  { id: 'pearl', name: 'Pearls', base: 60 },
];

// Price multipliers per port, in the same order as GOODS (below 1 = cheap here).
const FACTORS = {
  'Port Marigold': [1.0, 1.2, 0.65, 1.3, 1.1],
  'Isla Hibiscus': [1.2, 0.6, 1.2, 0.7, 1.2],
  'Mango Key': [0.5, 1.4, 1.3, 1.1, 0.85],
  'Saint Avelle': [1.4, 1.0, 1.4, 1.3, 1.35],
  'Lantern Isle': [1.3, 1.3, 1.0, 1.2, 0.6],
};
export const PORT_NAMES = Object.keys(FACTORS);

export const TAVERNS = {
  'Port Marigold': 'The Gilded Marigold',
  'Isla Hibiscus': 'The Red Hibiscus',
  'Mango Key': 'The Sleepy Pelican',
  'Saint Avelle': 'The Saint’s Rest',
  'Lantern Isle': 'The Lamp & Anchor',
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
