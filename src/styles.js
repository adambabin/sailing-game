// The three art styles. Every colour and lighting choice lives here, so a style
// can be tuned (or a new one added) without touching the rest of the game.

export const STYLES = {
  lowpoly: {
    id: 'lowpoly',
    name: 'Low-poly',
    material: 'flat', // faceted, flat-coloured surfaces
    outline: false,
    sunDir: [0.45, 0.8, 0.4],
    sunColor: 0xfff6e0,
    sunIntensity: 2.4,
    hemiSky: 0xcfe8ff,
    hemiGround: 0x6a8f8a,
    hemiIntensity: 1.3,
    sky: { zenith: 0x4a9fe3, horizon: 0xd3ecf5, glow: 0xffffff, glowPower: 12, glowStrength: 0.25, discSize: 0.9994, discSoft: 0.0003 },
    water: {
      deep: 0x1f6fa5, mid: 0x3aa0c8, shallow: 0x57dcc8, foam: 0xffffff,
      flat: 1, bands: 0, fresnel: 0.45, spec: 0.25, shine: 40, ripple: 0, foamAmt: 0.2,
    },
    fog: { near: 500, far: 5200 },
    cloud: 0xffffff,
  },

  cartoon: {
    id: 'cartoon',
    name: 'Cartoon',
    material: 'toon', // banded light and shadow, with ink outlines
    outline: true,
    sunDir: [-0.4, 0.75, 0.5],
    sunColor: 0xffffff,
    sunIntensity: 2.6,
    hemiSky: 0xdff4ff,
    hemiGround: 0x7fb8c9,
    hemiIntensity: 1.5,
    sky: { zenith: 0x2a86f0, horizon: 0xbfeeff, glow: 0xfffbe0, glowPower: 40, glowStrength: 0.2, discSize: 0.9988, discSoft: 0.00003 },
    water: {
      deep: 0x1273cf, mid: 0x25b4ea, shallow: 0x58efd6, foam: 0xffffff,
      flat: 0, bands: 4, fresnel: 0.3, spec: 0.9, shine: 220, ripple: 0, foamAmt: 0.17,
    },
    fog: { near: 600, far: 6000 },
    cloud: 0xffffff,
  },

  painterly: {
    id: 'painterly',
    name: 'Painterly',
    material: 'soft', // smooth gradients, golden-hour light
    outline: false,
    sunDir: [-0.52, 0.17, -0.84],
    sunColor: 0xffc98f,
    sunIntensity: 2.6,
    hemiSky: 0xaebfe8,
    hemiGround: 0x8a6f7a,
    hemiIntensity: 1.5,
    sky: { zenith: 0x4466a8, horizon: 0xffc79a, glow: 0xff9d5c, glowPower: 5, glowStrength: 0.75, discSize: 0.9992, discSoft: 0.0006 },
    water: {
      deep: 0x1c4a70, mid: 0x3a7d9c, shallow: 0x5fcfc0, foam: 0xfff3e2,
      flat: 0, bands: 0, fresnel: 0.85, spec: 1.3, shine: 90, ripple: 0.16, foamAmt: 0.14,
    },
    fog: { near: 250, far: 4200 },
    cloud: 0xffd9c9,
  },
};

export const STYLE_ORDER = ['lowpoly', 'cartoon', 'painterly'];
