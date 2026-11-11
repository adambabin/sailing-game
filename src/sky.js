// Sky dome, sun, moon, stars and clouds.

import * as THREE from 'three';

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uZenith, uHorizon, uGlow, uSunDir, uMoonDir, uLightDir, uSunColor;
uniform float uGlowPower, uGlowStrength, uDisc, uNight;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  col += uGlow * pow(max(dot(d, uLightDir), 0.0), uGlowPower) * uGlowStrength;
  float s = max(dot(d, uSunDir), 0.0);
  col = mix(col, uSunColor * 1.15, smoothstep(0.9992, 0.9998, s) * uDisc * (1.0 - uNight));
  float m = max(dot(d, uMoonDir), 0.0);
  col = mix(col, vec3(0.93, 0.95, 1.0), smoothstep(0.9994, 0.9996, m) * uDisc * uNight);
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
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlowPower: { value: 8 },
    uGlowStrength: { value: 0.3 },
    uDisc: { value: 1 },
    uNight: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(9000, 32, 16),
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  dome.frustumCulled = false;
  dome.renderOrder = -10;

  const r = rng(11);

  // Stars: points scattered over the upper sky, faded in at night.
  const starPos = [];
  for (let i = 0; i < 700; i++) {
    const th = r() * Math.PI * 2, y = 0.03 + r() * 0.97, rad = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(th) * rad * 8500, y * 8500, Math.sin(th) * rad * 8500);
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })
  );
  stars.frustumCulled = false;
  stars.renderOrder = -9;

  // Clouds are clusters of squashed blobs.
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const clouds = new THREE.Group();
  const blob = new THREE.IcosahedronGeometry(1, 2);
  for (let i = 0; i < 18; i++) {
    const cluster = new THREE.Group();
    const ang = r() * Math.PI * 2;
    const dist = 700 + r() * 2600;
    cluster.position.set(Math.cos(ang) * dist, 280 + r() * 220, Math.sin(ang) * dist);
    const size = 40 + r() * 50;
    const n = 4 + Math.floor(r() * 4);
    for (let j = 0; j < n; j++) {
      const m = new THREE.Mesh(blob, cloudMat);
      const s = size * (0.6 + r() * 0.6);
      m.scale.set(s * 1.5, s * 0.55, s);
      m.position.set((j - n / 2) * size * 0.9 + r() * 20, r() * size * 0.25, (r() - 0.5) * size * 0.8);
      cluster.add(m);
    }
    clouds.add(cluster);
  }

  return {
    dome, stars, clouds,
    update(camera, dt, env, wind) {
      uniforms.uZenith.value.copy(env.zenith);
      uniforms.uHorizon.value.copy(env.horizon);
      uniforms.uGlow.value.copy(env.glow);
      uniforms.uSunColor.value.copy(env.light);
      uniforms.uSunDir.value.copy(env.sunDir);
      uniforms.uMoonDir.value.copy(env.moonDir);
      uniforms.uLightDir.value.copy(env.lightDir);
      uniforms.uGlowPower.value = env.glowPower;
      uniforms.uGlowStrength.value = env.glowStrength;
      uniforms.uDisc.value = env.discStrength;
      uniforms.uNight.value = env.night;
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      stars.material.opacity = env.night * (1 - env.overcast) * 0.9;
      cloudMat.color.copy(env.cloud);
      const grow = 1 + 1.5 * env.overcast; // storm clouds swell to cover the sky
      const drift = wind.speed * 0.25 * dt;
      for (const c of clouds.children) {
        c.scale.setScalar(grow);
        c.position.x += wind.dx * drift;
        c.position.z += wind.dz * drift;
        if (c.position.x - camera.position.x > 3600) c.position.x -= 7200;
        if (c.position.x - camera.position.x < -3600) c.position.x += 7200;
        if (c.position.z - camera.position.z > 3600) c.position.z -= 7200;
        if (c.position.z - camera.position.z < -3600) c.position.z += 7200;
      }
    },
  };
}
