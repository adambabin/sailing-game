// Other ships at sea: merchants, the navy, pirates, and the ships of your own
// fleet. Each is a real ship that sails, fights with her own guns, takes damage,
// can strike her colours (surrender), and sinks.

import * as THREE from 'three';
import { buildNpcModel } from './ship.js';
import { applyPaint } from './materials.js';
import { waveHeight } from './waves.js';
import { islandCoast, nearestIsland, nightLights } from './islands.js';
import { inArc } from './combat.js';
import { FACTIONS, ZONES, newCaptain, BOUNTY } from './factions.js';

const rand = (a, b) => a + Math.random() * (b - a);
const HANDLING = { sloop: { cruise: 4.6, turn: 0.34 }, brig: { cruise: 4.0, turn: 0.24 }, galleon: { cruise: 3.6, turn: 0.17 } };
const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
const STRIKES_AT = { merchant: 0.3, navy: 0.16, pirate: 0.18 }; // hull at which a ship gives up the fight
const STRUCK_FOR = 150; // seconds a surrendered ship waits to be boarded before slipping away

// A random spot of open water, clear of every island, of `avoid`, and (unless told otherwise) of pirate waters.
function openWater(avoid, far = 0, zone = null) {
  for (let i = 0; i < 80; i++) {
    let x, z;
    if (zone) { const a = rand(0, 6.28), r = zone.r * Math.sqrt(Math.random()) * 0.85; x = zone.x + Math.cos(a) * r; z = zone.z + Math.sin(a) * r; }
    else { x = rand(-1700, 2000); z = rand(-2200, 1600); }
    if (islandCoast(x, z) > -0.95) continue;
    if (!zone && ZONES.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + 120)) continue; // honest ships give pirate waters a wide berth
    if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < far) continue;
    return { x, z };
  }
  return zone ? { x: zone.x, z: zone.z } : { x: 0, z: 300 };
}

// `fx` supplies foam(), struck(), sunk(), surrendered() and left(). `fire(shooter, side, target)` looses a broadside.
export function createVessels(waves, fx, fire) {
  const group = new THREE.Group();
  const list = [];

  function add(typeId, faction, zone = null, look = null) {
    const looks = FACTIONS[faction] ? FACTIONS[faction].look : [look], model = buildNpcModel(typeId, look || looks[list.length % looks.length]);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), lampMat);
    lamp.position.set(0, 5.5, model.type.size.stern + 0.5);
    nightLights.push(lamp);
    model.group.add(lamp);
    group.add(model.group);
    const start = openWater(null, 0, zone), h = HANDLING[typeId];
    const v = {
      faction, typeId, type: model.type, model: model.group, guns: model.guns, size: model.type.size, top: model.type.top,
      label: faction === 'player' ? `Your ${model.type.name.toLowerCase()}` : `${FACTIONS[faction].name} ${model.type.name.toLowerCase()}`,
      zone, x: start.x, z: start.z, y: 0, heading: rand(0, 6.28), speed: h.cruise, cruise: h.cruise, turn: h.turn, vx: 0, vz: 0,
      hull: 1, sinking: 0, gone: false, away: 0, goal: openWater(null, 0, zone), bob: rand(0, 6),
      aim: 2.1, power: 0.55, // other ships' gunnery is looser and lighter than yours, so a fight is winnable
      alarm: 0, // seconds she will keep running from whoever fired on her
      provoked: 0, // seconds she will keep fighting the player for having been fired on
      struck: 0, // seconds left to board her after she has struck her colours (0 = still flying them)
      fleet: faction === 'player', slot: 0,
      leader: null, // the ship she sails in company with (a squadron, patrol or convoy), if any
      escort: false, // a warship guarding a convoy
      raidZone: null, raidFor: 0, // pirate waters the navy is sweeping, and for how much longer
      assist: 0, // seconds since you last hit her, for a share of the bounty if someone else finishes her
      attacker: null, enemy: null, think: rand(0, 1),
      reload: { port: 0, stbd: 0 }, reloadTime: model.type.reload * 1.5,
      // A cannonball has struck her.
      hit(damage, by) {
        if (v.sinking) return;
        v.hull = Math.max(0, v.hull - damage / v.type.hullMax);
        v.attacker = by;
        if (by.faction === 'player') v.assist = 90;
        if (v.faction === 'merchant') {
          // The whole convoy scatters when one of them is fired on.
          for (const o of list) if (o.faction === 'merchant') { o.alarm = 45; o.attacker = by; }
        }
        else if (by.faction === 'player' && !v.fleet) v.provoked = 90;
        else if (!v.fleet || by.faction !== 'player') v.enemy = by;
        fx.struck(v, by);
        if (v.hull <= 0) { v.struck = 0; v.sinking = 0.001; fx.sunk(v, by); }
        else if (!v.fleet && !v.struck && by.faction === 'player' && v.hull < STRIKES_AT[v.faction]) {
          // Beaten by you, she hauls down her flag and waits to be boarded.
          v.struck = STRUCK_FOR;
          v.enemy = null;
          fx.surrendered(v);
        }
      },
    };
    if (faction === 'pirate') { v.captain = newCaptain(); v.bounty = BOUNTY[typeId]; }
    list.push(v);
    return v;
  }
  // Ships sail in company. A follower keeps station on her leader and fights her leader's fights.
  const company = (leader, ...followers) => followers.forEach((f, i) => { f.leader = leader; f.slot = i; f.x = leader.x + 40 * (i + 1); f.z = leader.z + 30; });
  // A merchant convoy of three, with a navy sloop as escort.
  const convoy = add('brig', 'merchant');
  const guard = add('sloop', 'navy');
  guard.escort = true;
  company(convoy, add('sloop', 'merchant'), add('brig', 'merchant'), guard);
  // A navy patrol of two brigs.
  const patrol = add('brig', 'navy');
  company(patrol, add('brig', 'navy'));
  // A pirate squadron in each stretch of pirate waters: a brig, with a sloop in company.
  for (const zone of ZONES) company(add('brig', 'pirate', zone), add('sloop', 'pirate', zone));
  let raidWait = rand(200, 380); // seconds until the navy next sweeps pirate waters
  const leading = (v) => (v.leader && !v.leader.gone && !v.leader.sinking && !v.leader.struck ? v.leader : null);

  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const nearest = (v, faction, within) => {
    let best = null, bd = within;
    for (const o of list) if (o.faction === faction && !o.sinking && !o.gone && !o.struck) { const d = dist(v, o); if (d < bd) { bd = d; best = o; } }
    return best;
  };
  // Of the player and the ships of their fleet, whichever is closest to `v`.
  const nearestOfYours = (v, player) => {
    let best = player, bd = dist(v, player);
    for (const o of list) if (o.fleet && !o.sinking && !o.gone) { const d = dist(v, o); if (d < bd) { bd = d; best = o; } }
    return best;
  };

  // Decide who, if anyone, this ship wants to fight. `world`: { player, ashore, wanted, fleetEnemy }.
  function chooseEnemy(v, world) {
    const p = world.player, canSeePlayer = !world.ashore && !p.sinking;
    if (v.fleet) return world.fleetEnemy && dist(v, world.fleetEnemy) < 600 ? world.fleetEnemy : null;
    const own = ownQuarrel(v, world, p, canSeePlayer);
    if (own) return own;
    // An escort goes for whoever has frightened her convoy. Otherwise a follower backs her leader.
    const lead = leading(v);
    if (v.escort && lead && lead.alarm > 0 && lead.attacker && !lead.attacker.sinking && (lead.attacker !== p || canSeePlayer) && dist(v, lead.attacker) < 700) return lead.attacker === p ? nearestOfYours(v, p) : lead.attacker;
    return lead && lead.enemy && !lead.enemy.struck ? lead.enemy : null;
  }
  function ownQuarrel(v, world, p, canSeePlayer) {
    if (v.faction === 'pirate') {
      // Pirates go for you inside their own waters, or anywhere for a while if you fired on them.
      const inWaters = Math.hypot(p.x - v.zone.x, p.z - v.zone.z) < v.zone.r;
      if (canSeePlayer && (inWaters || v.provoked > 0) && dist(v, p) < 700) return nearestOfYours(v, p);
      return nearest(v, 'navy', 320);
    }
    if (v.faction === 'navy') {
      if (canSeePlayer && (world.wanted || v.provoked > 0) && dist(v, p) < 650) return nearestOfYours(v, p);
      return nearest(v, 'pirate', 450);
    }
    return null;
  }

  function remove(v) {
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    group.remove(v.model);
    v.model.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    fx.left(v);
  }

  // The navy sails into pirate waters to clear them out. A battle follows, which you may join or avoid.
  function raid() {
    const flag = list.find((v) => v.faction === 'navy' && !v.escort && !v.leader && !v.gone && !v.sinking && !v.struck);
    if (!flag) return null;
    flag.raidZone = ZONES[Math.floor(Math.random() * ZONES.length)];
    flag.raidFor = 260;
    flag.goal = { x: flag.raidZone.x, z: flag.raidZone.z };
    return flag.raidZone;
  }

  function update(dt, time, world) {
    const player = world.player;
    if ((raidWait -= dt) <= 0) { raidWait = rand(360, 600); raid(); }
    for (let n = list.length - 1; n >= 0; n--) {
      const v = list[n];
      if (v.gone) {
        // After a while another ship of her kind comes over the horizon.
        if ((v.away -= dt) <= 0) {
          const p = openWater(player, 1000, v.zone);
          Object.assign(v, { x: p.x, z: p.z, hull: 1, sinking: 0, gone: false, alarm: 0, provoked: 0, struck: 0, enemy: null, goal: openWater(null, 0, v.zone), heading: rand(0, 6.28) });
          if (v.faction === 'pirate') v.captain = newCaptain(); // a new captain takes over these waters
        }
        v.model.visible = false;
        continue;
      }
      let speedWant = v.cruise;
      if (v.sinking) {
        v.sinking += dt;
        v.speed *= 1 - Math.min(1, dt * 0.8);
        if (Math.random() < dt * 4) fx.foam(v.x + rand(-4, 4), v.z + rand(-6, 6), rand(0.6, 1.4));
        if (v.sinking > 9) {
          if (v.fleet) { remove(v); continue; } // one of yours: she is simply gone
          v.gone = true;
          v.away = rand(70, 130);
        }
      } else if (v.struck) {
        // Colours struck: she lies to and waits. Left too long, she makes sail and slips away.
        speedWant = 0;
        if ((v.struck -= dt) <= 0) { v.struck = 0; v.gone = true; v.away = rand(60, 110); }
        v.speed += (0 - v.speed) * Math.min(1, dt * 0.8);
      } else {
        v.alarm = Math.max(0, v.alarm - dt);
        v.provoked = Math.max(0, v.provoked - dt);
        if ((v.think -= dt) <= 0) { v.think = 0.8; v.enemy = chooseEnemy(v, world); }
        if (v.enemy && (v.enemy.sinking || v.enemy.gone || v.enemy.struck)) v.enemy = null;
        v.assist = Math.max(0, v.assist - dt);
        if (v.raidZone && (v.raidFor -= dt) <= 0) v.raidZone = null;
        if (Math.hypot(v.goal.x - v.x, v.goal.z - v.z) < 120) v.goal = openWater(null, 0, v.raidZone || v.zone);
        let want = Math.atan2(v.goal.x - v.x, v.goal.z - v.z);
        const e = v.enemy, lead = v.fleet ? player : leading(v);
        if (v.alarm > 0 && v.attacker) {
          // Run: stern to the danger, every stitch of sail.
          want = Math.atan2(v.x - v.attacker.x, v.z - v.attacker.z);
          speedWant = v.cruise * 1.45;
        } else if (!v.fleet && v.hull < 0.2 && e) {
          want = Math.atan2(v.x - e.x, v.z - e.z);
          speedWant = v.cruise * 1.45;
        } else if (e) {
          // Fight: close to gun range, then turn to bring a broadside to bear and hold it there.
          const d = dist(v, e), bearing = Math.atan2(e.x - v.x, e.z - v.z);
          if (d > 125) want = bearing;
          else {
            const off = d < 55 ? Math.PI / 2 + 0.5 : Math.PI / 2; // too close: open the range a little
            const a = bearing + off, b = bearing - off;
            const da = Math.abs(Math.atan2(Math.sin(a - v.heading), Math.cos(a - v.heading))), db = Math.abs(Math.atan2(Math.sin(b - v.heading), Math.cos(b - v.heading)));
            want = da < db ? a : b;
          }
          speedWant = v.cruise * (v.fleet ? 1.6 : 1.25);
          for (const side of [1, -1]) if (v.reload[side > 0 ? 'port' : 'stbd'] <= 0 && inArc(v, side, e)) fire(v, side, e);
        } else if (lead) {
          // In company with nobody to fight: keep station astern of the leader, on alternate quarters.
          const ph = lead.heading, back = 42 + 30 * Math.floor(v.slot / 2) + 14 * (v.slot % 2), out = (v.slot % 2 ? -1 : 1) * 30;
          const sx = lead.x - Math.sin(ph) * back + Math.cos(ph) * out, sz = lead.z - Math.cos(ph) * back - Math.sin(ph) * out;
          const gap = Math.hypot(sx - v.x, sz - v.z), pspeed = Math.hypot(lead.vx, lead.vz);
          if (v.fleet && gap > 1100) { v.x = sx; v.z = sz; v.heading = ph; } // hopelessly left behind: she catches up out of sight
          want = gap > 18 ? Math.atan2(sx - v.x, sz - v.z) : ph;
          speedWant = gap > 18 ? Math.min(Math.max(v.cruise * 1.9, pspeed * 1.1), pspeed + gap * 0.09) : pspeed;
        }
        // Whatever she is doing, she will not run herself ashore.
        const ax = v.x + Math.sin(v.heading) * 150, az = v.z + Math.cos(v.heading) * 150;
        if (islandCoast(ax, az) > -0.75) want = v.heading - 1.3;
        else if (!e && !v.alarm && !lead && Math.hypot(player.x - ax, player.z - az) < 100) want = v.heading - 1.2; // and gives you room
        if (v.fleet && islandCoast(v.x, v.z) > -0.45) speedWant = Math.min(speedWant, 1.5); // close inshore, she creeps
        let diff = want - v.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const turn = v.turn * (v.fleet ? 1.6 : 1);
        v.heading += THREE.MathUtils.clamp(diff, -turn * dt, turn * dt);
        v.speed += (speedWant * (v.fleet && !e ? 1 : 0.55 + 0.45 * v.hull) - v.speed) * Math.min(1, dt * (v.fleet ? 0.9 : 0.4));
      }
      v.vx = Math.sin(v.heading) * v.speed;
      v.vz = Math.cos(v.heading) * v.speed;
      v.x += v.vx * dt;
      v.z += v.vz * dt;
      // A last resort in the heat of a fight: the shallows shoulder her back out to sea.
      if (!v.sinking && islandCoast(v.x, v.z) > -0.3) {
        const isl = nearestIsland(v.x, v.z), ox = v.x - isl.x, oz = v.z - isl.z, ol = Math.hypot(ox, oz) || 1;
        v.x += (ox / ol) * 5 * dt;
        v.z += (oz / ol) * 5 * dt;
      }
      v.y = waveHeight(waves, v.x, v.z, time) * 0.5;
      // Ships a long way off are not drawn at all, which keeps things smooth.
      v.model.visible = Math.hypot(v.x - world.eye.x, v.z - world.eye.z) < 2600;
      const low = (1 - v.hull) * 0.6 + v.sinking * v.sinking * 0.2;
      v.model.position.set(v.x, v.y + 0.3 - low, v.z);
      v.model.rotation.set(Math.sin(time * 0.5 + v.bob) * 0.03 - Math.min(0.4, v.sinking * 0.05), v.heading, Math.sin(time * 0.37 + v.bob) * 0.05 + Math.min(1.2, v.sinking * 0.15));
    }
  }

  return {
    group, list, update, remove, raid,
    fleet: () => list.filter((v) => v.fleet),
    // Add a ship to your fleet, painted in your colours, at a given place.
    addFleet(typeId, hull, look, at) {
      const v = add(typeId, 'player', null, look);
      const mine = list.filter((o) => o.fleet);
      Object.assign(v, { x: at.x, z: at.z, heading: at.heading || 0, hull, speed: 0, slot: mine.length - 1 });
      return v;
    },
    // Repaint the fleet when you repaint the flagship.
    repaintFleet(look) {
      for (const v of list) {
        if (!v.fleet) continue;
        v.model.traverse((o) => { const p = o.userData.paint; if (p && p.part && look[p.part] !== undefined) p.color = look[p.part]; });
        applyPaint(v.model);
      }
    },
    // Close up the stations after a ship leaves the fleet.
    renumber() { list.filter((v) => v.fleet).forEach((v, i) => (v.slot = i)); },
  };
}
