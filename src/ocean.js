// The sea: one large sheet of triangles that follows the camera. The graphics
// card bends it into waves every frame using the same maths as waves.js.

import * as THREE from 'three';
import { WAVE_COUNT, sea } from './waves.js';
import { MAX_ISLANDS } from './islands.js';

const CELL = 2.5; // metres between grid points near the ship
const N = 220;
const INNER = 70; // grid is evenly spaced out to here, then stretches to the horizon

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uSea;
uniform vec4 uWaves[${WAVE_COUNT}];   // dir.x, dir.z, steepness, wavelength
uniform vec4 uIslands[${MAX_ISLANDS}];     // x, z, radius, stretch
uniform vec4 uIslandShape[${MAX_ISLANDS}]; // wobble 1, wobble 2, rotation, inner edge of a ring (0 = solid)
uniform vec4 uIslandGap[${MAX_ISLANDS}];   // direction of a ring's opening, its half-width, its sharpness, 1 for a reef
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vHeight;
varying float vCoast;

// The same "coast coordinate" as rawCoast() in islands.js: positive on land, 0 at the shore, negative at sea.
float coast(vec2 p) {
  float best = -1.0;
  for (int i = 0; i < ${MAX_ISLANDS}; i++) {
    vec4 I = uIslands[i];
    if (I.z <= 0.0) continue;
    vec2 d = p - I.xy;
    if (length(d) > I.z * 2.6 * I.w) continue;
    vec4 S = uIslandShape[i];
    float cr = cos(S.z), sr = sin(S.z);
    vec2 l = vec2((d.x * cr + d.y * sr) / I.w, -d.x * sr + d.y * cr); // into the island's own frame
    float th = atan(l.y, l.x);
    float u = length(l) / (I.z * (1.0 + 0.18 * sin(3.0 * th + S.x) + 0.10 * sin(5.0 * th + S.y)));
    float c = 1.0 - u;
    vec4 G = uIslandGap[i];
    if (S.w > 0.0) {
      c = min(c, u - S.w);
      float da = atan(sin(th - G.x), cos(th - G.x));
      c = min(c, (abs(da) - G.y) * G.z);
    }
    if (G.w > 0.5) c = min(c, -0.08); // a reef never breaks the surface
    best = max(best, c);
  }
  return best;
}

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 p = wp.xz;
  float dist = distance(p, cameraPosition.xz);
  float c = coast(p);
  float shallow = 1.0 - smoothstep(0.0, 1.0, -c);
  float calm = (1.0 - 0.8 * shallow) * uSea;

  vec3 disp = vec3(0.0);
  vec3 dPdx = vec3(1.0, 0.0, 0.0);
  vec3 dPdz = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;
  float total = 0.0;
  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec4 w = uWaves[i];
    float k = 6.2831853 / w.w;
    float speed = sqrt(9.81 / k);
    float fade = 1.0 - smoothstep(w.w * 8.0, w.w * 25.0, dist);
    float s = w.z * calm * fade;
    float a = s / k;
    float f = k * (dot(w.xy, p) - speed * uTime);
    float sn = sin(f), cs = cos(f);
    disp.x += w.x * a * cs;
    disp.z += w.y * a * cs;
    disp.y += a * sn;
    dPdx += vec3(-w.x * w.x * s * sn, w.x * s * cs, -w.x * w.y * s * sn);
    dPdz += vec3(-w.x * w.y * s * sn, w.y * s * cs, -w.y * w.y * s * sn);
    crest += s * sn;
    total += w.z;
  }
  wp.xyz += disp;
  vWorld = wp.xyz;
  vNormal = normalize(cross(dPdz, dPdx));
  vCrest = crest / total;
  vHeight = disp.y;
  vCoast = c;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep, uMid, uShallow, uFoam;
uniform vec3 uSunDir, uSunColor, uZenith, uHorizon;
uniform float uFlat, uBands, uFresnel, uSpec, uShine, uRipple, uFoamAmt, uFogNear, uFogFar;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vHeight;
varying float vCoast;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec3 N = normalize(vNormal);
  if (uFlat > 0.5) {
    N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (N.y < 0.0) N = -N;
  }
  float dist = distance(vWorld, cameraPosition);
  if (uRipple > 0.0) {
    float fadeR = 1.0 - smoothstep(60.0, 500.0, dist);
    vec2 q = vWorld.xz * 0.9;
    float n1 = noise(q + vec2(uTime * 0.6, uTime * 0.2)) - 0.5;
    float n2 = noise(q * 1.7 - vec2(uTime * 0.3, uTime * 0.5)) - 0.5;
    N = normalize(N + vec3(n1, 0.0, n2) * uRipple * (0.3 + fadeR));
  }
  vec3 V = normalize(cameraPosition - vWorld);
  float ndl = max(dot(N, uSunDir), 0.0);

  // Body colour: deeper in the troughs, lighter on sunlit crests.
  float t = clamp(0.45 + 0.3 * vHeight + 0.5 * (ndl - 0.5), 0.0, 1.0);
  float shallow = 1.0 - smoothstep(0.0, 0.9, -vCoast);
  if (uBands > 0.0) {
    t = floor(t * uBands + 0.5) / uBands;
    shallow = floor(shallow * 3.0 + 0.5) / 3.0;
  }
  vec3 col = mix(uDeep, uMid, t);
  col = mix(col, uShallow, shallow * 0.9);

  // Sky reflection, strongest at glancing angles.
  float fres = uFresnel * pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizon, uZenith, pow(abs(R.y), 0.6));
  col = mix(col, sky, clamp(fres, 0.0, 1.0));

  // Sun glitter.
  vec3 H = normalize(uSunDir + V);
  float sp = pow(max(dot(N, H), 0.0), uShine);
  if (uBands > 0.0) sp = step(0.5, sp);
  col += uSunColor * sp * uSpec;

  // Foam on wave crests and where the sea meets the beach.
  float n = noise(vWorld.xz * 0.7 + uTime * 0.15);
  float foam = smoothstep(1.0 - uFoamAmt, 1.0 - uFoamAmt * 0.4, vCrest + (n - 0.5) * 0.25);
  float lap = 0.035 + 0.02 * sin(uTime * 0.8 + vWorld.x * 0.15 + vWorld.z * 0.11);
  float shore = 1.0 - smoothstep(lap, lap + 0.03, -vCoast + (n - 0.5) * 0.02);
  foam = max(foam, shore * 0.85);
  if (uBands > 0.0) foam = step(0.5, foam);
  foam *= 1.0 - smoothstep(300.0, 900.0, dist);
  col = mix(col, uFoam, foam);

  float fog = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uHorizon, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function createOcean(waves, islands) {
  const half = N / 2;
  const positions = new Float32Array((N + 1) * (N + 1) * 3);
  let k = 0;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const gi = i - half, gj = j - half;
      const m = Math.max(Math.abs(gi), Math.abs(gj));
      let s = 1;
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

  const islandU = [], shapeU = [], gapU = [];
  for (let i = 0; i < MAX_ISLANDS; i++) {
    const isl = islands[i];
    islandU.push(isl ? new THREE.Vector4(isl.x, isl.z, isl.R, isl.stretch) : new THREE.Vector4(0, 0, 0, 1));
    gapU.push(isl ? new THREE.Vector4(isl.gap || 0, isl.gapHalf || 0, isl.gapK, isl.reef ? 1 : 0) : new THREE.Vector4());
    shapeU.push(isl ? new THREE.Vector4(isl.p1, isl.p2, isl.rot, isl.inner) : new THREE.Vector4());
  }

  const uniforms = {
    uTime: { value: 0 },
    uSea: { value: 1 },
    uWaves: { value: waves.map((w) => new THREE.Vector4(w.dx, w.dz, w.steep, w.length)) },
    uIslands: { value: islandU },
    uIslandShape: { value: shapeU },
    uIslandGap: { value: gapU },
    uDeep: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color() },
    uFoam: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uFlat: { value: 0 },
    uBands: { value: 0 },
    uFresnel: { value: 0.85 },
    uSpec: { value: 0.5 },
    uShine: { value: 90 },
    uRipple: { value: 0.16 },
    uFoamAmt: { value: 0.2 },
    uFogNear: { value: 500 },
    uFogFar: { value: 5000 },
  };

  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader }));
  mesh.frustumCulled = false;

  return {
    mesh,
    update(time, camera, env) {
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
