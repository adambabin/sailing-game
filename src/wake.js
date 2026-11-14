// Wakes and spray.
//
// Foam on the water is not made of separate objects floating on the sea. Instead there is a
// "wake picture": a square image, looking straight down on the sea around the camera, that is
// redrawn every frame from a few hundred soft blobs. Its red channel is white foam and its green
// channel is churned, paler water. The sea (ocean.js) reads this picture for every pixel it
// draws, breaks the foam up with noise, and paints it as part of the water, so wakes ride over
// the waves exactly and cost almost nothing however many blobs there are.
//
// Spray is different: real droplets thrown into the air at the bow, drawn as soft dots.

import * as THREE from 'three';

const SPAN = 440; // metres of sea the wake picture covers, centred on the camera

export function createWake(renderer, { light = false } = {}) {
  const MAX = light ? 700 : 1200; // most blobs alive at once
  const SIZE = 512; // the picture is SIZE × SIZE dots

  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: false });
  // One flat square per blob. `aBlob` is its place and size, `aInk` how much foam and churn it adds.
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const blob = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  const ink = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
  blob.setUsage(THREE.DynamicDrawUsage);
  ink.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aBlob', blob);
  geo.setAttribute('aInk', ink);
  const centre = new THREE.Vector2();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCentre: { value: centre } },
    vertexShader: /* glsl */ `
      attribute vec3 aBlob; // x, z, radius
      attribute vec2 aInk;  // foam, churn
      uniform vec2 uCentre;
      varying vec2 vAt;
      varying vec2 vInk;
      void main() {
        vAt = position.xy;
        vInk = aInk;
        vec2 world = aBlob.xy + position.xy * aBlob.z;
        gl_Position = vec4((world - uCentre) / ${(SPAN / 2).toFixed(1)}, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vAt;
      varying vec2 vInk;
      void main() {
        float a = 1.0 - smoothstep(0.15, 1.0, length(vAt));
        gl_FragColor = vec4(vInk * a, 0.0, 1.0);
      }`,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, // blobs add up
    depthTest: false, depthWrite: false, transparent: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); // not really used: the blobs place themselves

  // Each blob: where it is, how it drifts, how big it is and grows, how long its foam and churn last.
  const blobs = Array.from({ length: MAX }, () => ({ x: 0, z: 0, vx: 0, vz: 0, age: 99, r: 1, grow: 0, foam: 0, foamLife: 1, churn: 0, churnLife: 1 }));
  let next = 0;
  function add(x, z, o) {
    const b = blobs[next++ % MAX];
    b.x = x; b.z = z; b.vx = o.vx || 0; b.vz = o.vz || 0; b.age = 0;
    b.r = o.r; b.grow = o.grow || 0;
    b.foam = o.foam || 0; b.foamLife = o.foamLife || 1;
    b.churn = o.churn || 0; b.churnLife = o.churnLife || 1;
  }

  // ---- Spray: droplets in the air ---------------------------------------------------------
  const DROPS = light ? 120 : 260;
  const drops = Array.from({ length: DROPS }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 99, life: 1, size: 1 }));
  let nextDrop = 0;
  const dropPos = new THREE.BufferAttribute(new Float32Array(DROPS * 3), 3);
  const dropSize = new THREE.BufferAttribute(new Float32Array(DROPS), 1);
  dropPos.setUsage(THREE.DynamicDrawUsage);
  dropSize.setUsage(THREE.DynamicDrawUsage);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', dropPos);
  dropGeo.setAttribute('aSize', dropSize);
  const dropMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      uniform float uScale;
      varying float vShow;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale / max(1.0, -mv.z);
        vShow = aSize > 0.0 ? 1.0 : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vShow;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.3, 1.0, d)) * 0.7 * vShow;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const spray = new THREE.Points(dropGeo, dropMat);
  spray.frustumCulled = false;

  // Throw `n` droplets up from (x, y, z). `out` is a sideways direction (x, z) they favour; `power` how hard; `big` scales their size.
  function splash(x, y, z, n, power, outX = 0, outZ = 0, big = 1) {
    for (let i = 0; i < n; i++) {
      const d = drops[nextDrop++ % DROPS];
      const a = Math.random() * 6.283, s = Math.random() * power * 0.5;
      d.x = x + (Math.random() - 0.5) * 0.8; d.y = y; d.z = z + (Math.random() - 0.5) * 0.8;
      d.vx = Math.cos(a) * s + outX * power * (0.4 + Math.random() * 0.6);
      d.vz = Math.sin(a) * s + outZ * power * (0.4 + Math.random() * 0.6);
      d.vy = power * (0.5 + Math.random() * 0.7);
      d.age = 0;
      d.life = 0.7 + Math.random() * 0.8;
      d.size = (0.24 + Math.random() * 0.4) * big;
    }
  }

  // ---- Ships' wakes ------------------------------------------------------------------------
  // Call once a frame for each moving ship. `v` needs x, z, heading and speed; `size` is
  // { bow, stern, half } in metres; `memo` is any object kept for that ship (it remembers how far
  // she has gone since her last blobs); `detail` 1 is the full wake, lower is sparser.
  function trail(v, size, memo, dt, detail = 1) {
    const sp = v.speed;
    if (!(sp > 0.7)) return;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading); // forward
    const sx = fz, sz = -fx; // to one side
    const beam = size.half, fast = Math.min(1, sp / 7);
    memo.run = (memo.run || 0) + sp * dt;
    const gap = (0.55 + beam * 0.22) / detail; // metres sailed between blobs
    let guard = 0;
    while (memo.run > gap && guard++ < 6) {
      memo.run -= gap;
      const j = () => Math.random() - 0.5;
      // Astern: a churned, foamy lane the width of the hull that spreads and slowly fades.
      const ax = v.x + fx * (size.stern + 0.6) + sx * j() * beam * 0.7, az = v.z + fz * (size.stern + 0.6) + sz * j() * beam * 0.7;
      add(ax, az, {
        r: beam * (0.55 + Math.random() * 0.3), grow: 0.16 + beam * 0.05,
        foam: 0.22 + 0.34 * fast, foamLife: 2.5 + Math.random() * 3 + fast * 2,
        churn: 0.3 + 0.35 * fast, churnLife: 9 + Math.random() * 6 + beam * 2,
        vx: sx * j() * 0.3, vz: sz * j() * 0.3,
      });
      // At the bow: foam curls off each side and is carried outward, drawing the V.
      for (const side of [-1, 1]) {
        const along = size.bow * (0.72 + Math.random() * 0.2);
        const bx = v.x + fx * along + sx * side * beam * 0.35, bz = v.z + fz * along + sz * side * beam * 0.35;
        const push = side * sp * (0.3 + Math.random() * 0.12);
        add(bx, bz, {
          r: 0.6 + beam * 0.3 + Math.random() * 0.3, grow: 0.34,
          foam: 0.24 + 0.4 * fast, foamLife: 3 + Math.random() * 2.5 + fast * 3,
          churn: 0.12, churnLife: 5,
          vx: sx * push + fx * sp * 0.12, vz: sz * push + fz * sp * 0.12,
        });
      }
      // Along her sides: a thin line of foam where the hull cuts the water.
      if (detail >= 1 && Math.random() < 0.7) {
        const side = Math.random() < 0.5 ? -1 : 1, along = size.stern + Math.random() * (size.bow * 0.7 - size.stern);
        add(v.x + fx * along + sx * side * beam * 0.95, v.z + fz * along + sz * side * beam * 0.95, {
          r: 0.5 + Math.random() * 0.4, grow: 0.2, foam: 0.2 + 0.2 * fast, foamLife: 1.6 + Math.random() * 1.5,
          vx: sx * side * 0.5, vz: sz * side * 0.5,
        });
      }
    }
  }

  return {
    spray,
    span: SPAN,
    texture: target.texture,
    x: 0, z: 0,
    add, trail, splash,
    // A round patch of foam (a dolphin's splash, a fish taking the bait, a cannonball).
    foamAt(x, z, size) {
      add(x, z, { r: size * 1.3, grow: size * 0.5, foam: 0.9, foamLife: 2.4, churn: 0.3, churnLife: 4 });
    },
    get count() { return blobs.filter((b) => b.age < Math.max(b.foamLife, b.churnLife)).length; },

    // Move everything on by `dt` seconds. Cheap: no drawing happens here.
    update(dt) {
      for (const b of blobs) {
        if (b.age > 90) continue;
        b.age += dt;
        const slow = Math.exp(-b.age * 0.32); // a blob's push dies away
        b.x += b.vx * slow * dt;
        b.z += b.vz * slow * dt;
        if (b.age > b.foamLife && b.age > b.churnLife) b.age = 99;
      }
      for (const d of drops) {
        if (d.age > 90) continue;
        d.age += dt;
        d.vy -= 9.8 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        if (d.age > d.life || d.y < -1.5) d.age = 99;
      }
    },

    // Redraw the wake picture, centred on (cx, cz), and hand the droplets to the graphics card.
    draw(cx, cz, foamColor) {
      this.x = cx; this.z = cz;
      centre.set(cx, cz);
      let n = 0;
      const reach = SPAN / 2 + 12;
      for (const b of blobs) {
        if (b.age > 90 || Math.abs(b.x - cx) > reach || Math.abs(b.z - cz) > reach) continue;
        // Foam comes in quickly and fades; a blob keeps spreading as it ages, and thins as it spreads.
        const r = b.r + b.grow * b.age;
        const thin = (b.r / r) * Math.min(1, b.age * 5 + 0.25);
        const kf = b.age / b.foamLife, kc = b.age / b.churnLife;
        blob.array[n * 3] = b.x; blob.array[n * 3 + 1] = b.z; blob.array[n * 3 + 2] = r;
        ink.array[n * 2] = kf < 1 ? b.foam * (1 - kf * kf) * (0.45 + 0.55 * thin) : 0;
        ink.array[n * 2 + 1] = kc < 1 ? b.churn * (1 - kc) : 0;
        n++;
      }
      geo.instanceCount = n;
      blob.needsUpdate = true;
      ink.needsUpdate = true;
      const old = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, cam);
      renderer.setRenderTarget(old);

      let i = 0;
      for (const d of drops) {
        const live = d.age < 90;
        dropPos.array[i * 3] = d.x; dropPos.array[i * 3 + 1] = live ? d.y : -50; dropPos.array[i * 3 + 2] = d.z;
        dropSize.array[i] = live ? d.size * (1 - 0.6 * (d.age / d.life)) : 0;
        i++;
      }
      dropPos.needsUpdate = true;
      dropSize.needsUpdate = true;
      dropMat.uniforms.uColor.value.copy(foamColor);
      dropMat.uniforms.uScale.value = renderer.domElement.height * 0.9;
    },
  };
}
