// Wave maths shared by the ocean picture (GPU shader) and the ship physics (CPU).
// The sea is a sum of five "Gerstner" waves: rolling swells that also push the
// water slightly back and forth, which gives peaked crests and round troughs.

import { islandCoast } from './islands.js';

const G = 9.81;

// Each wave: direction offset from the prevailing wind (radians), steepness, wavelength (m)
const WAVE_SPECS = [
  [0.0, 0.1, 60],
  [0.44, 0.1, 34],
  [-0.31, 0.09, 19],
  [0.87, 0.08, 11],
  [-0.7, 0.06, 6.5],
];

export const WAVE_COUNT = WAVE_SPECS.length;

// How rough the sea is right now: about 0.5 in a calm, 1.6 in a gale. Set by the weather.
export const sea = { state: 1 };

export function buildWaves(baseAngle) {
  return WAVE_SPECS.map(([off, steep, length]) => {
    const a = baseAngle + off;
    const k = (2 * Math.PI) / length;
    return { dx: Math.cos(a), dz: Math.sin(a), steep, length, k, speed: Math.sqrt(G / k), amp: steep / k };
  });
}

// How much the swell is calmed at (x, z) by nearby islands (1 = open sea).
function calm(x, z) {
  const t = islandCoast(x, z); // > 0 on land, 0 at the shoreline, negative out to sea
  const shallow = 1 - smooth(0, 1, -t);
  return 1 - 0.8 * shallow;
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Height of the water surface at world position (x, z) at a given time.
export function waveHeight(waves, x, z, time) {
  const c = calm(x, z) * sea.state;
  // Gerstner waves shift points sideways, so walk back to the point that ends up at (x, z).
  let px = x, pz = z;
  for (let it = 0; it < 3; it++) {
    let ox = 0, oz = 0;
    for (const w of waves) {
      const f = w.k * (w.dx * px + w.dz * pz - w.speed * time);
      const a = w.amp * c * Math.cos(f);
      ox += w.dx * a;
      oz += w.dz * a;
    }
    px = x - ox;
    pz = z - oz;
  }
  let y = 0;
  for (const w of waves) {
    const f = w.k * (w.dx * px + w.dz * pz - w.speed * time);
    y += w.amp * c * Math.sin(f);
  }
  return y;
}
