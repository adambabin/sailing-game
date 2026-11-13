// Time of day and weather. Each frame this works out the colours of the sky,
// sea and light from the clock and from how hard the wind is blowing.

import * as THREE from 'three';

const DAY_MINUTES = 20; // real minutes for one full day (nights pass twice as fast)

// Colour "keyframes" through the day; the game blends smoothly between them.
const NIGHT = { zenith: 0x070d24, horizon: 0x1b2a4e, glow: 0x6f86c8, light: 0x9db4e8, deep: 0x06162a, mid: 0x12304f, shallow: 0x1f5f6e, foam: 0x8fa3c8, cloud: 0x2a3555, hemiSky: 0x3b4f85, hemiGround: 0x141a2a, glowPower: 30, glowStrength: 0.25, hemi: 0.55 };
const DAWN = { zenith: 0x4a5fa0, horizon: 0xffb48c, glow: 0xff8f5a, light: 0xffb98a, deep: 0x1a3f66, mid: 0x3a6f92, shallow: 0x58bfb6, foam: 0xffe9da, cloud: 0xf2b8b0, hemiSky: 0xa9b5e0, hemiGround: 0x7a6470, glowPower: 5, glowStrength: 0.7, hemi: 1.2 };
const DAY = { zenith: 0x3f8ce0, horizon: 0xd3eaf3, glow: 0xfff4dc, light: 0xfff2dc, deep: 0x1c5d92, mid: 0x3d9bc2, shallow: 0x5fdccb, foam: 0xffffff, cloud: 0xffffff, hemiSky: 0xcfe6ff, hemiGround: 0x7f9a92, glowPower: 10, glowStrength: 0.35, hemi: 1.4 };
const GOLDEN = { zenith: 0x4466a8, horizon: 0xffc79a, glow: 0xff9d5c, light: 0xffc98f, deep: 0x1c4a70, mid: 0x3a7d9c, shallow: 0x5fcfc0, foam: 0xfff3e2, cloud: 0xffd9c9, hemiSky: 0xaebfe8, hemiGround: 0x8a6f7a, glowPower: 5, glowStrength: 0.75, hemi: 1.5 };
const DUSK = { zenith: 0x2b3570, horizon: 0xe8806a, glow: 0xff6a48, light: 0xff9a78, deep: 0x12304f, mid: 0x2c557c, shallow: 0x4a9fa6, foam: 0xe8c8c8, cloud: 0xb9788a, hemiSky: 0x6f78b8, hemiGround: 0x4a3a50, glowPower: 6, glowStrength: 0.6, hemi: 0.9 };
const KEYS = [[0, NIGHT], [4.8, NIGHT], [6.2, DAWN], [8.5, DAY], [15.5, DAY], [17.6, GOLDEN], [19.2, DUSK], [20.4, NIGHT], [24, NIGHT]];
const COLOR_FIELDS = ['zenith', 'horizon', 'glow', 'light', 'deep', 'mid', 'shallow', 'foam', 'cloud', 'hemiSky', 'hemiGround'];
const NUMBER_FIELDS = ['glowPower', 'glowStrength', 'hemi'];
for (const [, k] of KEYS) for (const f of COLOR_FIELDS) if (!k[f].isColor) k[f] = new THREE.Color(k[f]);

const SUNRISE = 6, SUNSET = 19.2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const grey = new THREE.Color();

// Weather "moods". w runs from 0 (flat calm) to 1 (gale).
export const WEATHERS = [
  { name: 'Calm', w: 0.08, chance: 0.15 },
  { name: 'Fair', w: 0.3, chance: 0.4 },
  { name: 'Fresh', w: 0.6, chance: 0.3 },
  { name: 'Gale', w: 0.93, chance: 0.15 },
];

export function createEnvironment() {
  const env = {
    hour: 16.8,
    skip: 0, // hours still to fast-forward (from the Time button)
    w: 0.3, target: 0.3, hold: 50, forced: -1, // weather state
    windSpeed: 12, overcast: 0, rain: 0, night: 0, sea: 0.85,
    storm: 0, // 0 = no storm here, 1 = the heart of one (set by storms.js)
    flash: 0, // a lightning flash, 1 at its brightest (set by storms.js)
    sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), lightDir: new THREE.Vector3(),
    lightIntensity: 1, discStrength: 1, fogNear: 250, fogFar: 4200, foamAmt: 0.14,
  };
  for (const f of COLOR_FIELDS) env[f] = new THREE.Color();

  env.update = (dt, time) => {
    // --- Clock
    const isNight = env.hour > 20.4 || env.hour < 4.8;
    let advance = (dt * 24) / (DAY_MINUTES * 60) * (isNight ? 2 : 1);
    if (env.skip > 0) { const s = Math.min(env.skip, dt * 2.5); env.skip -= s; advance += s; }
    env.hour = (env.hour + advance) % 24;

    // --- Weather drifts between moods
    if (env.forced < 0) {
      env.hold -= dt;
      if (env.hold <= 0) {
        let r = Math.random();
        for (const m of WEATHERS) { if ((r -= m.chance) <= 0) { env.target = m.w + (Math.random() - 0.5) * 0.1; break; } }
        env.hold = 80 + Math.random() * 90;
      }
    } else env.target = WEATHERS[env.forced].w;
    const rate = env.forced < 0 ? 0.02 : 0.09;
    env.w += THREE.MathUtils.clamp(env.target - env.w, -rate * dt, rate * dt);
    // In a storm the weather is at least a full gale, and wilder still at its heart.
    const s = env.storm, W = Math.max(env.w, s);
    const gust = 1 + 0.07 * Math.sin(time * 0.21) + 0.05 * Math.sin(time * 0.53 + 2) * (0.5 + W) + 0.12 * s * Math.sin(time * 1.3);
    env.windSpeed = (4 + 28 * W + 5 * s) * gust;
    env.overcast = Math.max(smooth(0.5, 0.9, env.w), smooth(0, 0.5, s));
    env.rain = Math.max(smooth(0.78, 0.95, env.w), smooth(0.15, 0.6, s));
    // The sea takes a while to build up and to settle after the wind changes (a storm whips it up faster).
    const seaRate = rate * 1.5 + 0.08 * s;
    env.sea += THREE.MathUtils.clamp(0.5 + 1.15 * W + 0.5 * s - env.sea, -seaRate * dt, seaRate * dt);
    env.foamAmt = 0.1 + 0.3 * smooth(0.15, 1, W) + 0.1 * s;

    // --- Blend the colour keyframes for this hour
    let i = 1;
    while (KEYS[i][0] < env.hour) i++;
    const [h0, a] = KEYS[i - 1], [h1, b] = KEYS[i];
    const t = smooth(0, 1, (env.hour - h0) / (h1 - h0));
    for (const f of COLOR_FIELDS) env[f].copy(a[f]).lerp(b[f], t);
    for (const f of NUMBER_FIELDS) env[f] = a[f] + (b[f] - a[f]) * t;

    // --- Sun and moon
    const sa = ((env.hour - SUNRISE) / (SUNSET - SUNRISE)) * Math.PI;
    const sunEl = Math.sin(sa) * 1.13, sunAz = sa - 0.5;
    env.sunDir.set(Math.cos(sunAz) * Math.cos(sunEl), Math.sin(sunEl), -Math.sin(sunAz) * Math.cos(sunEl));
    const mh = env.hour < 12 ? env.hour + 24 : env.hour;
    const ma = ((mh - 18.6) / 12) * Math.PI;
    const moonEl = Math.max(0.12, Math.sin(ma) * 0.9), moonAz = ma + 0.7;
    env.moonDir.set(Math.cos(moonAz) * Math.cos(moonEl), Math.sin(moonEl), -Math.sin(moonAz) * Math.cos(moonEl));
    const sy = env.sunDir.y;
    env.night = 1 - smooth(-0.22, 0.04, sy);
    const dayLight = smooth(-0.08, 0.03, sy), moonLight = smooth(-0.08, -0.22, sy);
    if (dayLight > 0) {
      env.lightDir.copy(env.sunDir);
      env.lightDir.y = Math.max(env.lightDir.y, 0.05);
      env.lightDir.normalize();
      env.lightIntensity = 2.7 * dayLight;
    } else {
      env.lightDir.copy(env.moonDir);
      env.lightIntensity = 0.7 * moonLight;
    }

    // --- Heavy weather greys everything out and closes in the horizon
    const o = env.overcast;
    if (o > 0) {
      for (const f of ['zenith', 'horizon', 'deep', 'mid', 'shallow', 'cloud', 'hemiSky', 'glow']) {
        const c = env[f];
        const l = (0.3 * c.r + 0.55 * c.g + 0.15 * c.b) * (f === 'cloud' ? 0.45 : 0.75);
        c.lerp(grey.setRGB(l, l * 1.02, l * 1.08), o * 0.8);
      }
    }
    env.lightIntensity *= 1 - 0.65 * o;
    env.discStrength = 1 - o;
    env.glowStrength *= 1 - 0.8 * o;
    env.fogNear = 250 - 170 * env.rain;
    env.fogFar = 4200 - 1400 * o - 1200 * env.rain - 900 * s;
    // Inside a storm it is darker still; a lightning flash lights everything up for a moment.
    if (s > 0) for (const f of ['zenith', 'horizon', 'deep', 'mid', 'cloud', 'hemiSky']) env[f].multiplyScalar(1 - 0.35 * s);
    env.lightIntensity *= 1 - 0.4 * s;
    if (env.flash > 0) {
      for (const f of ['zenith', 'horizon', 'cloud', 'hemiSky']) env[f].lerp(grey.setRGB(0.85, 0.88, 1), env.flash * 0.6);
      env.hemi += env.flash * 2.5;
    }
  };

  env.clock = () => {
    const m = Math.floor(env.hour * 6) * 10; // to the nearest ten minutes
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  env.windName = () => (env.windSpeed < 8 ? 'Light air' : env.windSpeed < 16 ? 'Fair breeze' : env.windSpeed < 25 ? 'Fresh breeze' : 'Gale');
  return env;
}
