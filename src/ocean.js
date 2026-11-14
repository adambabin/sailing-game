// The sea: one large sheet of triangles that follows the camera. The graphics
// card bends it into waves every frame using the same maths as waves.js, then
// colours every pixel: fine wind chop, reflections, sun glitter, foam and wakes.

import * as THREE from 'three';
import { WAVE_COUNT, sea } from './waves.js';
import { WORLD, coastAt } from './islands.js';

const CELL = 2.5; // metres between grid points near the ship
const INNER_FRAC = 70 / 110; // the grid is evenly spaced out to this share of its half-width, then stretches to the horizon

// Smaller wind chop that is only drawn (it tilts the light on the surface, pixel by pixel) and
// never moves the ship, so waves.js does not need to know about it.
// Each: direction offset from the wind (radians), wavelength (m). Shortest last, so the light
// graphics setting can simply use fewer of them.
const DETAIL_SPECS = [
  [0.4, 4.6],
  [-0.9, 3.1],
  [1.45, 2.2],
  [-0.25, 1.55],
  [-1.7, 1.1],
  [0.95, 0.8],
  [-0.6, 0.6],
  [1.9, 0.45],
];

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uSea;
uniform vec4 uWaves[${WAVE_COUNT}];   // dir.x, dir.z, steepness, wavelength
uniform vec2 uWaveK[${WAVE_COUNT}];   // wave number, how fast its phase turns
uniform sampler2D uCoast;             // the coast map: see buildCoastMap() below
uniform vec4 uCoastBox;               // its corner (x, z) and 1 / its width and depth
varying vec3 vWorld;
varying vec2 vP;
varying float vCalm;
varying float vHeight;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 p = wp.xz;
  float dist = distance(p, cameraPosition.xz);
  float c = texture2D(uCoast, (p - uCoastBox.xy) * uCoastBox.zw).r;
  float shallow = 1.0 - smoothstep(0.0, 1.0, -c);
  float calm = (1.0 - 0.8 * shallow) * uSea;

  vec3 disp = vec3(0.0);
  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec4 w = uWaves[i];
    vec2 kw = uWaveK[i];
    float fade = 1.0 - smoothstep(w.w * 8.0, w.w * 25.0, dist);
    float a = w.z * calm * fade / kw.x;
    float f = kw.x * dot(w.xy, p) - kw.y * uTime;
    float cs = cos(f);
    disp.x += w.x * a * cs;
    disp.z += w.y * a * cs;
    disp.y += a * sin(f);
  }
  wp.xyz += disp;
  vWorld = wp.xyz;
  vP = p;
  vCalm = calm;
  vHeight = disp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// DETAIL is how many of the small chop waves to draw; LIGHT trims a few extras for phones.
const fragmentShader = (DETAIL, LIGHT) => /* glsl */ `
uniform float uTime;
uniform vec4 uWaves[${WAVE_COUNT}];
uniform vec2 uWaveK[${WAVE_COUNT}];
uniform vec4 uDetail[${DETAIL}];      // dir.x, dir.z, wave number, how fast its phase turns
uniform sampler2D uNoise, uCoast, uWake;
uniform vec4 uCoastBox;
uniform vec3 uWakeBox;                // centre (x, z) of the wake picture and 1 / its width
uniform vec3 uDeep, uMid, uShallow, uFoam;
uniform vec3 uSunDir, uSunColor, uZenith, uHorizon;
uniform float uFresnel, uSpec, uShine, uRipple, uFoamAmt, uFogNear, uFogFar;
varying vec3 vWorld;
varying vec2 vP;
varying float vCalm;
varying float vHeight;

// Soft blotchy noise read from a small picture made in code (cheaper on a phone than computing it).
// One unit of p is one blotch. The four channels are four different patterns.
vec4 noise4(vec2 p) { return texture2D(uNoise, p * 0.03125); }
// Two turns, so that layers of noise laid over each other never line up.
const mat2 TURN_A = mat2(0.8, 0.6, -0.6, 0.8);
const mat2 TURN_B = mat2(0.28, -0.96, 0.96, 0.28);

void main() {
  float dist = distance(vWorld, cameraPosition);
  float distP = distance(vP, cameraPosition.xz);

  // The five big waves again, this time worked out for every pixel, so the light catches each
  // crest crisply however coarse the grid of triangles is.
  vec3 dPdx = vec3(1.0, 0.0, 0.0);
  vec3 dPdz = vec3(0.0, 0.0, 1.0);
  float crest = 0.0, lag = 0.0, total = 0.0;
  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec4 w = uWaves[i];
    vec2 kw = uWaveK[i];
    float fade = 1.0 - smoothstep(w.w * 8.0, w.w * 25.0, distP);
    float s = w.z * vCalm * fade;
    float f = kw.x * dot(w.xy, vP) - kw.y * uTime;
    float sn = sin(f), cs = cos(f);
    dPdx += vec3(-w.x * w.x * s * sn, w.x * s * cs, -w.x * w.y * s * sn);
    dPdz += vec3(-w.x * w.y * s * sn, w.y * s * cs, -w.y * w.y * s * sn);
    crest += s * sn;
    lag += s * (sn * 0.62 + cs * 0.78); // the same wave a moment after its crest has passed
    total += w.z;
  }
  vec3 N = normalize(cross(dPdz, dPdx));

  // Wind chop: small waves that only tilt the surface. Slow noise bends each one differently so
  // they never line up into a regular pattern, and each fades out before it would shimmer in the distance.
  vec4 bendA = noise4(vP * 0.07 + uTime * 0.01) * 5.5;
  ${DETAIL > 4 ? 'vec4 bendB = noise4(TURN_A * vP * 0.11 - uTime * 0.012) * 5.5;' : ''}
  vec4 gusts = (noise4(TURN_A * vP * 0.17 + uTime * 0.04) + noise4(TURN_B * vP * 0.29 - uTime * 0.03).gbar) * 0.95; // chop comes in patches, not endless rows
  vec2 chop = vec2(0.0);
  for (int j = 0; j < ${DETAIL}; j++) {
    vec4 d = uDetail[j];
    float lam = 6.2831853 / d.z;
    float fd = 1.0 - smoothstep(lam * 22.0, lam * 65.0, dist);
    float f = d.z * dot(d.xy, vP) - d.w * uTime + ${DETAIL > 4 ? '(j < 4 ? bendA[j] : bendB[j - 4])' : 'bendA[j]'};
    chop += d.xy * (cos(f) * fd * gusts[j - (j / 4) * 4]);
  }
  chop *= 0.085 * clamp(vCalm, 0.0, 1.7);
  float fadeR = 1.0 - smoothstep(60.0, 500.0, dist);
  vec2 rip = noise4(TURN_B * vWorld.xz * 2.1 + vec2(uTime * 0.7, uTime * 0.3)).rg - 0.5;
  ${LIGHT ? '' : 'rip += (noise4(TURN_A * vWorld.xz * 4.3 - vec2(uTime * 0.5, uTime * 0.8)).ba - 0.5) * 0.7;'}
  N = normalize(N + vec3(-chop.x + rip.x * uRipple * (0.3 + fadeR), 0.0, -chop.y + rip.y * uRipple * (0.3 + fadeR)));

  vec3 V = normalize(cameraPosition - vWorld);
  float ndl = max(dot(N, uSunDir), 0.0);
  float ndv = max(dot(N, V), 0.0);

  // Body colour: deeper in the troughs, lighter on sunlit crests.
  float t = clamp(0.42 + 0.3 * vHeight + 0.55 * (ndl - 0.5), 0.0, 1.0);
  float c = texture2D(uCoast, (vWorld.xz - uCoastBox.xy) * uCoastBox.zw).r;
  float shallow = 1.0 - smoothstep(0.0, 0.9, -c);
  vec3 col = mix(uDeep, uMid, t);
  col = mix(col, uShallow, shallow * 0.9);

  // Light glowing through the thin top of a wave when you look toward the sun.
  vec3 sunFlat = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 0.0001);
  float through = pow(max(dot(V, -sunFlat), 0.0), 3.0) * smoothstep(-0.1, 1.3, vHeight) * (1.0 - N.y * N.y) * 14.0;
  col += uShallow * uSunColor * min(through, 1.0) * uSpec * 0.9;

  // Churned-up water left behind a ship is paler and greener.
  vec2 wuv = (vWorld.xz - uWakeBox.xy) * uWakeBox.z + 0.5;
  vec4 wk = texture2D(uWake, wuv);
  wk *= 1.0 - smoothstep(0.42, 0.5, max(abs(wuv.x - 0.5), abs(wuv.y - 0.5)));
  col = mix(col, mix(uShallow, uFoam, 0.25), min(wk.g, 1.0) * 0.6);

  // Sky reflection, strongest at glancing angles, with a broad sheen under the sun.
  float fres = uFresnel * (0.03 + 0.97 * pow(1.0 - ndv, 5.0));
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sky = mix(uHorizon, uZenith, pow(R.y, 0.6));
  sky += uSunColor * pow(max(dot(R, uSunDir), 0.0), 10.0) * uSpec * 0.5;
  col = mix(col, sky, clamp(fres, 0.0, 1.0));

  // Sun glitter: tight sparkles close by, a wider shimmering path far away.
  vec3 H = normalize(uSunDir + V);
  float shine = mix(uShine, uShine * 0.3, smoothstep(40.0, 700.0, dist));
  float sp = pow(max(dot(N, H), 0.0), shine);
  col += uSunColor * sp * uSpec * 0.6;

  // Foam. Whitecaps break on the crests and leave streaks behind them that the wind draws out;
  // surf rolls in to the beaches; and ships leave their wakes (the wake picture's red channel).
  vec4 n4 = noise4(vWorld.xz * 0.7 + uTime * 0.15);
  float n = n4.r;
  float lace = noise4(TURN_A * vWorld.xz * 1.5 + vec2(uTime * 0.05, -uTime * 0.04)).g;
  ${LIGHT ? '' : 'lace = lace * 0.6 + noise4(TURN_B * vWorld.xz * 3.7 - uTime * 0.06).b * 0.4;'}
  lace = clamp((lace - 0.5) * 1.9 + 0.5, 0.0, 1.0);
  vec2 wd = uWaves[0].xy;
  float streak = noise4(vec2(dot(vP, wd) * 0.2, dot(vP, vec2(-wd.y, wd.x)) * 0.7) + n4.gb * 1.5 + uTime * 0.05).a;
  crest /= total;
  lag /= total;
  float cap = smoothstep(1.0 - uFoamAmt, 1.0 - uFoamAmt * 0.4, crest + (n - 0.5) * 0.25);
  float trail = smoothstep(1.0 - uFoamAmt * 1.1, 1.0 - uFoamAmt * 0.3, lag + (streak - 0.5) * 0.4) * 0.55;
  float foam = max(cap, trail);
  foam = smoothstep(0.3, 0.75, foam * (0.3 + 1.4 * lace)); // lacy where it is thin, nearly solid where it is thick

  float off = -c; // how far offshore, as a share of the island's size
  float lap = 0.035 + 0.02 * sin(uTime * 0.8 + vWorld.x * 0.15 + vWorld.z * 0.11);
  float shore = 1.0 - smoothstep(lap, lap + 0.03, off + (n - 0.5) * 0.02);
  float roll = sin(off * 75.0 + uTime * 1.3 + n4.g * 5.0);
  float surf = smoothstep(0.55, 0.95, roll) * (1.0 - smoothstep(0.06, 0.24, off)) * smoothstep(0.25, 0.6, lace + 0.15);
  foam = max(foam, max(shore * 0.85, surf * 0.6));
  foam *= 1.0 - smoothstep(300.0, 900.0, dist);

  float wf = smoothstep(0.25, 0.7, wk.r * (0.3 + 1.4 * lace));
  foam = max(foam, wf);
  col = mix(col, uFoam * (0.86 + 0.14 * ndl), foam * 0.95);

  float fog = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uHorizon, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

// The coast map: one large picture of the whole sea in which every dot holds the "coast
// coordinate" there (positive on land, 0 at the shore, negative at sea: the same number that
// islandCoast() in islands.js gives). The graphics card looks a point up in it in one step,
// instead of measuring against every island for every point of the sea, every frame.
const COAST_SIZE = 2048, COAST_PAD = 300;
function buildCoastMap(features) {
  const x0 = WORLD.x0 - COAST_PAD, z0 = WORLD.z0 - COAST_PAD;
  const w = WORLD.x1 - WORLD.x0 + COAST_PAD * 2, h = WORLD.z1 - WORLD.z0 + COAST_PAD * 2;
  const S = COAST_SIZE, sx = w / S, sz = h / S;
  const val = new Float32Array(S * S).fill(-1);
  for (const f of features) {
    const reach = f.R * 2.6 * f.stretch; // rawCoast() gives -1 beyond this
    const i0 = Math.max(0, Math.floor((f.x - reach - x0) / sx)), i1 = Math.min(S - 1, Math.ceil((f.x + reach - x0) / sx));
    const j0 = Math.max(0, Math.floor((f.z - reach - z0) / sz)), j1 = Math.min(S - 1, Math.ceil((f.z + reach - z0) / sz));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = coastAt(f, x0 + (i + 0.5) * sx, z0 + (j + 0.5) * sz);
        if (c > val[j * S + i]) val[j * S + i] = c;
      }
    }
  }
  const data = new Uint16Array(S * S);
  for (let i = 0; i < data.length; i++) data[i] = THREE.DataUtils.toHalfFloat(val[i]);
  const tex = new THREE.DataTexture(data, S, S, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, box: new THREE.Vector4(x0, z0, 1 / w, 1 / h) };
}

// A small repeating picture of soft blotches, four different patterns in its four channels.
function buildNoise() {
  const S = 512, CELLS = 32, step = S / CELLS;
  const data = new Uint8Array(S * S * 4);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let ch = 0; ch < 4; ch++) {
    const g = Array.from({ length: CELLS * CELLS }, rnd);
    const at = (i, j) => g[(j % CELLS) * CELLS + (i % CELLS)];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const gx = x / step, gy = y / step, i = Math.floor(gx), j = Math.floor(gy);
        let fx = gx - i, fy = gy - j;
        fx = fx * fx * (3 - 2 * fx);
        fy = fy * fy * (3 - 2 * fy);
        const v = (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
        data[(y * S + x) * 4 + ch] = Math.round(v * 255);
      }
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// `N` is how many squares the sea is made of along each side: fewer is lighter work for a phone.
// `light` is the lighter graphics setting: fewer of the small extras.
export function createOcean(waves, features, N = 220, light = false) {
  const half = N / 2;
  const positions = new Float32Array((N + 1) * (N + 1) * 3);
  let k = 0;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const gi = i - half, gj = j - half;
      const m = Math.max(Math.abs(gi), Math.abs(gj));
      let s = 1;
      const INNER = Math.round(half * INNER_FRAC);
      if (m > INNER) {
        const d = (m - INNER) / (half - INNER);
        s = 1 + d * d * d * 36;
      }
      positions[k++] = gi * CELL * s;
      positions[k++] = 0;
      positions[k++] = gj * CELL * s;
    }
  }
  const indices = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);

  const coast = buildCoastMap(features);
  const detail = DETAIL_SPECS.slice(0, light ? 4 : 8).map(([off, length]) => {
    const a = Math.atan2(waves[0].dz, waves[0].dx) + off, k = (2 * Math.PI) / length;
    return new THREE.Vector4(Math.cos(a), Math.sin(a), k, Math.sqrt(9.81 * k) * 1.25); // a little quicker than nature, to look lively
  });

  const uniforms = {
    uTime: { value: 0 },
    uSea: { value: 1 },
    uWaves: { value: waves.map((w) => new THREE.Vector4(w.dx, w.dz, w.steep, w.length)) },
    uWaveK: { value: waves.map((w) => new THREE.Vector2(w.k, w.k * w.speed)) },
    uDetail: { value: detail },
    uNoise: { value: buildNoise() },
    uCoast: { value: coast.tex },
    uCoastBox: { value: coast.box },
    uWake: { value: null },
    uWakeBox: { value: new THREE.Vector3(0, 0, 0) },
    uDeep: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color() },
    uFoam: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uFresnel: { value: 0.9 },
    uSpec: { value: 0.5 },
    uShine: { value: 150 },
    uRipple: { value: 0.11 },
    uFoamAmt: { value: 0.2 },
    uFogNear: { value: 500 },
    uFogFar: { value: 5000 },
  };

  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader: fragmentShader(detail.length, light) }));
  mesh.frustumCulled = false;

  return {
    mesh,
    // `wake` is the wake picture from wake.js: { texture, x, z, span }.
    update(time, camera, env, wake) {
      if (wake) {
        uniforms.uWake.value = wake.texture;
        uniforms.uWakeBox.value.set(wake.x, wake.z, 1 / wake.span);
      }
      uniforms.uTime.value = time;
      uniforms.uSea.value = sea.state;
      uniforms.uDeep.value.copy(env.deep);
      uniforms.uMid.value.copy(env.mid);
      uniforms.uShallow.value.copy(env.shallow);
      uniforms.uFoam.value.copy(env.foam);
      uniforms.uSunDir.value.copy(env.lightDir);
      uniforms.uSunColor.value.copy(env.light);
      uniforms.uZenith.value.copy(env.zenith);
      uniforms.uHorizon.value.copy(env.horizon);
      uniforms.uSpec.value = 0.5 * env.lightIntensity;
      uniforms.uFoamAmt.value = env.foamAmt;
      uniforms.uFogNear.value = env.fogNear;
      uniforms.uFogFar.value = env.fogFar;
      // Snap to the grid so the facets do not "swim" as the camera moves.
      mesh.position.x = Math.round(camera.position.x / CELL) * CELL;
      mesh.position.z = Math.round(camera.position.z / CELL) * CELL;
    },
  };
}
