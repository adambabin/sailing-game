// Visible weather: pale ribbons that show strong wind streaming past, and rain.

import * as THREE from 'three';

const N = 44, SEG = 18;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createWindFx() {
  // ---- Wind ribbons
  const verts = N * (SEG + 1) * 2;
  const pos = new Float32Array(verts * 3), alpha = new Float32Array(verts);
  const idx = [];
  for (let s = 0; s < N; s++) {
    for (let i = 0; i < SEG; i++) {
      const a = (s * (SEG + 1) + i) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffffff) } },
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA); \n#include <colorspace_fragment>\n }',
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const ribbons = new THREE.Mesh(geo, mat);
  ribbons.frustumCulled = false;
  const streaks = Array.from({ length: N }, () => ({ t: 99, life: 1, p0: new THREE.Vector3(), phase: 0, amp: 1, curlAt: -1 }));
  const p = new THREE.Vector3(), prev = new THREE.Vector3(), side = new THREE.Vector3(), view = new THREE.Vector3(), tan = new THREE.Vector3();

  function pathPoint(s, d, wind, out) {
    const px = -wind.dz, pz = wind.dx; // across the wind
    const sway = s.amp * Math.sin(d * 0.07 + s.phase);
    out.set(s.p0.x + wind.dx * d + px * sway, s.p0.y + s.amp * 0.5 * Math.sin(d * 0.05 + s.phase * 2), s.p0.z + wind.dz * d + pz * sway);
    if (s.curlAt >= 0 && d > s.curlAt) { // a little loop-the-loop
      const L = 9, a = Math.min(1, (d - s.curlAt) / L) * Math.PI * 2, r = 1.6;
      out.x -= wind.dx * r * Math.sin(a);
      out.z -= wind.dz * r * Math.sin(a);
      out.y += r * (1 - Math.cos(a));
    }
    return out;
  }

  // ---- Rain
  const RAIN = 900, BOX = 70, TOP = 36;
  const rainPos = new Float32Array(RAIN * 6);
  const drops = Array.from({ length: RAIN }, () => new THREE.Vector3((Math.random() - 0.5) * BOX, Math.random() * TOP, (Math.random() - 0.5) * BOX));
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xd5deee, transparent: true, opacity: 0, depthWrite: false }));
  rain.frustumCulled = false;

  return {
    ribbons, rain,
    update(dt, camera, ship, wind, env) {
      // Ribbons appear above about 15 knots and thicken as it blows harder.
      const strength = smooth(13, 25, wind.speed);
      const active = Math.round(N * strength);
      const v = wind.speed * 0.5144 * 2.4;
      mat.uniforms.uColor.value.copy(env.foam);
      ribbons.visible = strength > 0.01 || streaks.some((s) => s.t < s.life);
      streaks.forEach((s, n) => {
        s.t += dt;
        if (s.t >= s.life && n < active && Math.random() < dt * 3) {
          s.t = 0;
          s.life = 1.3 + Math.random() * 1.2;
          const along = -55 + Math.random() * 75, across = (Math.random() - 0.5) * 90;
          s.p0.set(ship.x + wind.dx * along - wind.dz * across, 1.5 + Math.random() * 11, ship.z + wind.dz * along + wind.dx * across);
          s.phase = Math.random() * 6.28;
          s.amp = 0.6 + Math.random() * 1.6;
          s.curlAt = Math.random() < 0.35 ? v * s.life * (0.3 + Math.random() * 0.3) : -1;
        }
        const base = n * (SEG + 1) * 2;
        const live = s.t < s.life;
        const fade = live ? Math.sin((Math.PI * s.t) / s.life) * (0.4 + 0.4 * strength) : 0;
        view.subVectors(s.p0, camera.position);
        for (let i = 0; i <= SEG; i++) {
          const d = Math.max(0, (s.t - i * 0.03) * v);
          pathPoint(s, d, wind, p);
          if (i === 0) pathPoint(s, d + 0.5, wind, prev);
          tan.subVectors(prev, p);
          side.crossVectors(tan, view).normalize().multiplyScalar(0.2 * Math.sin((Math.PI * (i + 0.5)) / (SEG + 1)));
          const k = (base + i * 2) * 3;
          pos[k] = p.x + side.x; pos[k + 1] = p.y + side.y; pos[k + 2] = p.z + side.z;
          pos[k + 3] = p.x - side.x; pos[k + 4] = p.y - side.y; pos[k + 5] = p.z - side.z;
          alpha[base + i * 2] = alpha[base + i * 2 + 1] = fade * Math.sin((Math.PI * i) / SEG);
          prev.copy(p);
        }
      });
      geo.attributes.position.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;

      rain.visible = env.rain > 0.01;
      if (rain.visible) {
        rain.material.opacity = env.rain * 0.4;
        const vx = wind.dx * 9, vy = -32, vz = wind.dz * 9;
        const cx = camera.position.x, cz = camera.position.z;
        drops.forEach((d, i) => {
          d.x += vx * dt; d.y += vy * dt; d.z += vz * dt;
          if (d.y < 0) d.y += TOP;
          if (d.x - cx > BOX / 2) d.x -= BOX; else if (d.x - cx < -BOX / 2) d.x += BOX;
          if (d.z - cz > BOX / 2) d.z -= BOX; else if (d.z - cz < -BOX / 2) d.z += BOX;
          const k = i * 6;
          rainPos[k] = d.x; rainPos[k + 1] = d.y; rainPos[k + 2] = d.z;
          rainPos[k + 3] = d.x + vx * 0.03; rainPos[k + 4] = d.y + vy * 0.03; rainPos[k + 5] = d.z + vz * 0.03;
        });
        rainGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
