// Cannon fire. Any ship can fire a broadside from one side; this file flies the
// cannonballs, works out what they hit, and makes the smoke and splashes.

import * as THREE from 'three';
import { waveHeight } from './waves.js';

export const RANGE = 170; // metres a gun can usefully reach
const ARC = 0.72; // how far either side of straight out a gun can be trained (radians)
const SPEED = 78, GRAVITY = 14, DAMAGE = 9;
const BALLS = 96, PUFFS = 220;

const rand = (a, b) => a + Math.random() * (b - a);

// Is `target` off this side of `shooter`, within range and within the guns' arc?
// side: 1 = port, -1 = starboard. Returns the distance, or 0 if not.
export function inArc(shooter, side, target) {
  const dx = target.x - shooter.x, dz = target.z - shooter.z, dist = Math.hypot(dx, dz);
  if (dist > RANGE || dist < 1) return 0;
  const ox = Math.cos(shooter.heading) * side, oz = -Math.sin(shooter.heading) * side; // straight out from that side
  return (dx * ox + dz * oz) / dist > Math.cos(ARC) ? dist : 0;
}

export function createCombat(waves, fx) {
  const group = new THREE.Group();
  const ballMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 8, 6), new THREE.MeshBasicMaterial({ color: 0x15161a }), BALLS);
  const puffMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), PUFFS);
  ballMesh.frustumCulled = puffMesh.frustumCulled = false;
  group.add(ballMesh, puffMesh);
  const balls = Array.from({ length: BALLS }, () => ({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: null }));
  const puffs = Array.from({ length: PUFFS }, () => ({ age: 9, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1 }));
  const pending = []; // shots waiting their turn in a rippling broadside
  let nextBall = 0, nextPuff = 0, splashQuiet = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < PUFFS; i++) puffMesh.setColorAt(i, col.set(0xffffff));

  function puff(x, y, z, color, size, life, vx = 0, vy = 0.6, vz = 0) {
    const i = nextPuff++ % PUFFS;
    Object.assign(puffs[i], { age: 0, life, x, y, z, vx, vy, vz, size });
    puffMesh.setColorAt(i, col.set(color));
    puffMesh.instanceColor.needsUpdate = true;
  }

  function shoot(shot) {
    const s = shot.shooter, g = shot.gun, side = shot.side;
    if (s.sinking) return;
    const ch = Math.cos(s.heading), sh = Math.sin(s.heading);
    // Muzzle position in the world (ignoring the ship's small pitch and roll).
    const lx = side * (g.x + 0.9), mx = s.x + lx * ch + g.z * sh, mz = s.z - lx * sh + g.z * ch, my = s.y + g.y + 0.3;
    let dx = ch * side, dz = -sh * side, elev = 0.05;
    const t = shot.target;
    if (t && !t.sinking) {
      // Lay the gun on the target, leading her a little and lifting the barrel for the range.
      const flat = Math.hypot(t.x - mx, t.z - mz), time = flat / SPEED;
      const ax = t.x + (t.vx - s.vx) * time * 0.8 - mx, az = t.z + (t.vz - s.vz) * time * 0.8 - mz, d = Math.hypot(ax, az) || 1;
      dx = ax / d;
      dz = az / d;
      elev = 0.5 * Math.asin(Math.min(1, (GRAVITY * d) / (SPEED * SPEED))) + (t.y + 1.2 - my) / d;
    }
    const spread = rand(-0.045, 0.045) * (s.aim || 1), ca = Math.cos(spread), sa = Math.sin(spread);
    const hx = dx * ca - dz * sa, hz = dx * sa + dz * ca;
    elev += rand(-0.012, 0.012);
    const b = balls[nextBall++ % BALLS];
    Object.assign(b, { live: true, x: mx, y: my, z: mz, vx: hx * SPEED * Math.cos(elev) + s.vx, vy: SPEED * Math.sin(elev), vz: hz * SPEED * Math.cos(elev) + s.vz, owner: s });
    puff(mx + hx, my, mz + hz, 0xffd27a, 0.9, 0.12, hx * 6, 0, hz * 6); // flash
    for (let i = 0; i < 3; i++) puff(mx + hx * (1 + i), my + rand(-0.2, 0.3), mz + hz * (1 + i), 0xdedede, rand(0.8, 1.4), rand(1.6, 2.8), hx * rand(2, 6) + s.vx * 0.5, rand(0.3, 1), hz * rand(2, 6) + s.vz * 0.5);
    fx.boom(Math.hypot(mx - fx.ear.x, mz - fx.ear.z));
  }

  return {
    group,
    // Fire every gun on one side of `shooter`, rippling from bow to stern. Returns false if still reloading.
    fire(shooter, side, targets) {
      const key = side > 0 ? 'port' : 'stbd';
      if (shooter.reload[key] > 0 || shooter.sinking) return false;
      shooter.reload[key] = shooter.reloadTime;
      let best = null, bd = Infinity;
      for (const t of targets) {
        if (t === shooter || t.sinking) continue;
        const d = inArc(shooter, side, t);
        if (d && d < bd) { bd = d; best = t; }
      }
      shooter.guns.forEach((gun, i) => pending.push({ shooter, gun, side, target: best, wait: (shooter.guns.length - 1 - i) * 0.09 + rand(0, 0.05) }));
      return true;
    },
    update(dt, time, targets) {
      for (let i = pending.length - 1; i >= 0; i--) if ((pending[i].wait -= dt) <= 0) shoot(pending.splice(i, 1)[0]);
      splashQuiet -= dt;
      for (const t of targets) {
        t.reload.port = Math.max(0, t.reload.port - dt);
        t.reload.stbd = Math.max(0, t.reload.stbd - dt);
        // Smoke pours from a badly damaged ship.
        if (t.hull < 0.5 && !t.gone && Math.random() < dt * (3 - 4 * t.hull)) puff(t.x + rand(-1, 1), t.y + 2.5, t.z + rand(-2, 2), t.hull < 0.25 ? 0x3a3532 : 0x77726c, rand(1, 1.8), rand(2.5, 4), rand(-0.5, 0.5), rand(1.5, 3), rand(-0.5, 0.5));
      }
      balls.forEach((b, i) => {
        if (!b.live) { ballMesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); return; }
        b.vy -= GRAVITY * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        for (const t of targets) {
          if (t === b.owner || t.sinking || t.gone) continue;
          const dx = b.x - t.x, dz = b.z - t.z;
          if (Math.abs(dx) + Math.abs(dz) > 60) continue;
          const ch = Math.cos(t.heading), sh = Math.sin(t.heading);
          const across = dx * ch - dz * sh, along = dx * sh + dz * ch; // the ball in the ship's own frame
          if (Math.abs(across) < t.size.half + 0.5 && along > t.size.stern - 0.5 && along < t.size.bow + 0.5 && b.y > t.y - 1.5 && b.y < t.y + t.top) {
            b.live = false;
            for (let k = 0; k < 5; k++) puff(b.x, b.y, b.z, k < 3 ? 0x7a5233 : 0xcfc9bd, rand(0.25, 0.6), rand(0.5, 1.1), rand(-4, 4), rand(2, 6), rand(-4, 4));
            fx.crunch(Math.hypot(b.x - fx.ear.x, b.z - fx.ear.z));
            t.hit(DAMAGE, b.owner);
            break;
          }
        }
        if (b.live && b.y < waveHeight(waves, b.x, b.z, time)) {
          b.live = false;
          fx.foam(b.x, b.z, 0.9);
          puff(b.x, 0.6, b.z, 0xffffff, 0.7, 0.7, 0, 5, 0);
          if (splashQuiet <= 0) { splashQuiet = 0.12; fx.splash(Math.hypot(b.x - fx.ear.x, b.z - fx.ear.z)); }
        }
        ballMesh.setMatrixAt(i, m4.makeTranslation(b.x, b.y, b.z));
      });
      ballMesh.instanceMatrix.needsUpdate = true;
      puffs.forEach((p, i) => {
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) { puffMesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); return; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
        const s = p.size * (0.6 + 1.8 * k) * (k > 0.6 ? (1 - k) / 0.4 : 1);
        puffMesh.setMatrixAt(i, m4.compose(v.set(p.x, p.y, p.z), q, sc.set(s, s, s)));
      });
      puffMesh.instanceMatrix.needsUpdate = true;
    },
    liveBalls: () => balls.filter((b) => b.live).length,
  };
}
