// Sky dome, sun and clouds.

import * as THREE from 'three';
import { paint } from './materials.js';

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uZenith, uHorizon, uGlow, uSunDir, uSunColor;
uniform float uGlowPower, uGlowStrength, uDiscSize, uDiscSoft;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  float s = max(dot(d, uSunDir), 0.0);
  col += uGlow * pow(s, uGlowPower) * uGlowStrength;
  col = mix(col, uSunColor * 1.15, smoothstep(uDiscSize, uDiscSize + uDiscSoft, s));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function createSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uGlowPower: { value: 8 },
    uGlowStrength: { value: 0.3 },
    uDiscSize: { value: 0.9994 },
    uDiscSoft: { value: 0.0003 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(9000, 32, 16),
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  dome.frustumCulled = false;
  dome.renderOrder = -10;

  // Clouds are clusters of squashed blobs, repainted per art style.
  const clouds = new THREE.Group();
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const r = rng(11);
  for (let i = 0; i < 16; i++) {
    const cluster = new THREE.Group();
    const ang = r() * Math.PI * 2;
    const dist = 700 + r() * 2600;
    cluster.position.set(Math.cos(ang) * dist, 260 + r() * 220, Math.sin(ang) * dist);
    const size = 40 + r() * 50;
    const n = 4 + Math.floor(r() * 4);
    for (let j = 0; j < n; j++) {
      const m = paint(new THREE.Mesh(blob), 0xffffff, { cloud: true });
      const s = size * (0.6 + r() * 0.6);
      m.scale.set(s * 1.5, s * 0.55, s);
      m.position.set((j - n / 2) * size * 0.9 + r() * 20, r() * size * 0.25, (r() - 0.5) * size * 0.8);
      cluster.add(m);
    }
    clouds.add(cluster);
  }

  return {
    dome,
    clouds,
    setStyle(style) {
      const s = style.sky;
      uniforms.uZenith.value.set(s.zenith);
      uniforms.uHorizon.value.set(s.horizon);
      uniforms.uGlow.value.set(s.glow);
      uniforms.uSunDir.value.set(...style.sunDir).normalize();
      uniforms.uSunColor.value.set(style.sunColor);
      uniforms.uGlowPower.value = s.glowPower;
      uniforms.uGlowStrength.value = s.glowStrength;
      uniforms.uDiscSize.value = s.discSize;
      uniforms.uDiscSoft.value = s.discSoft;
      clouds.traverse((o) => {
        if (o.userData.paint) o.userData.paint.color = style.cloud;
      });
    },
    update(camera, dt) {
      dome.position.copy(camera.position);
      for (const c of clouds.children) {
        c.position.x += dt * 2.2; // drift with the trade wind
        if (c.position.x - camera.position.x > 3600) c.position.x -= 7200;
      }
    },
  };
}
