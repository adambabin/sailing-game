// The sea chart and logbook. Islands are inked in as you discover them.

import { ISLANDS, coastRadius } from './islands.js';
import { save, cargoCount } from './save.js';
import { GOODS } from './trade.js';
import { SHELLS_PER_ISLAND } from './finds.js';
import { SHIP_TYPES } from './ship.js';
import { ZONES, wanted } from './factions.js';

const WORLD = { x0: -1250, x1: 1850, z0: -2050, z1: 1450 }; // area the chart covers, in metres
const NM = 1852;

export function createChart() {
  const panel = document.getElementById('chart'), canvas = document.getElementById('chart-canvas'), log = document.getElementById('chart-log');
  const g = canvas.getContext('2d');
  const W = 310, H = Math.round((W * (WORLD.z1 - WORLD.z0)) / (WORLD.x1 - WORLD.x0));
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * scale;
  canvas.height = H * scale;
  canvas.style.aspectRatio = `${W} / ${H}`;
  const X = (x) => ((x - WORLD.x0) / (WORLD.x1 - WORLD.x0)) * W, Z = (z) => ((z - WORLD.z0) / (WORLD.z1 - WORLD.z0)) * H;
  const serif = "'IM Fell English', Georgia, serif";

  function draw(ship, wind, vessels = []) {
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.fillStyle = '#ecdcb4';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(90, 62, 38, 0.13)';
    g.lineWidth = 1;
    for (let x = -1000; x <= 1500; x += 500) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
    for (let z = -2000; z <= 1000; z += 500) { g.beginPath(); g.moveTo(0, Z(z)); g.lineTo(W, Z(z)); g.stroke(); }

    // Pirate waters, hatched in red.
    for (const zone of ZONES) {
      g.beginPath();
      g.arc(X(zone.x), Z(zone.z), (zone.r / (WORLD.x1 - WORLD.x0)) * W, 0, 7);
      g.fillStyle = 'rgba(176, 58, 46, 0.13)';
      g.fill();
      g.setLineDash([4, 3]);
      g.strokeStyle = 'rgba(176, 58, 46, 0.8)';
      g.lineWidth = 1;
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#8f2c22';
      g.font = `italic 10px ${serif}`;
      g.textAlign = 'center';
      g.fillText(zone.name, X(zone.x), Z(zone.z) + 3);
    }
    // Sails in sight: tan for merchants, blue for the navy, black for pirates.
    for (const v of vessels) {
      if (v.gone || Math.hypot(v.x - ship.x, v.z - ship.z) > 900) continue;
      g.fillStyle = v.faction === 'pirate' ? '#1d1d22' : v.faction === 'navy' ? '#2a5fa8' : '#a07a3c';
      g.beginPath();
      g.arc(X(v.x), Z(v.z), 2.4, 0, 7);
      g.fill();
    }
    for (const isl of ISLANDS) {
      const known = save.discovered.includes(isl.name);
      if (!known && !save.rumoured.includes(isl.name)) continue;
      g.beginPath();
      for (let i = 0; i <= 48; i++) {
        const th = (i / 48) * Math.PI * 2, r = coastRadius(isl, th);
        g.lineTo(X(isl.x + Math.cos(th) * r), Z(isl.z + Math.sin(th) * r));
      }
      g.closePath();
      g.lineWidth = 1.2;
      g.strokeStyle = '#5a3e26';
      if (known) {
        g.fillStyle = '#b9c48a';
        g.fill();
        g.setLineDash([]);
      } else g.setLineDash([3, 3]); // only heard of: a dotted outline
      g.stroke();
      g.setLineDash([]);
      if (known && isl.portInfo) {
        g.fillStyle = save.visited.includes(isl.name) ? '#b03a2e' : '#5a3e26';
        g.beginPath();
        g.arc(X(isl.dock.x), Z(isl.dock.z), 2.6, 0, 7);
        g.fill();
      }
      if (save.finds.includes(isl.name)) { // a little star where you found something
        g.fillStyle = '#b03a2e';
        g.font = '11px serif';
        g.textAlign = 'center';
        g.fillText('★', X(isl.findSpot.x), Z(isl.findSpot.z) + 4);
      }
      g.fillStyle = known ? '#3d2a1a' : 'rgba(61, 42, 26, 0.65)';
      g.font = `${known ? '' : 'italic '}11px ${serif}`;
      g.textAlign = 'center';
      g.fillText(isl.name, Math.min(W - 40, Math.max(40, X(isl.x))), Z(isl.z + isl.R) + 13);
    }

    // Compass rose with the wind.
    g.save();
    g.translate(30, H - 30);
    g.strokeStyle = g.fillStyle = '#5a3e26';
    g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, 17, 0, 7); g.stroke();
    g.font = `11px ${serif}`;
    g.fillText('N', 0, -21);
    g.rotate(Math.atan2(wind.dx, -wind.dz)); // arrow points where the wind blows to
    g.beginPath(); g.moveTo(0, -13); g.lineTo(4.5, 9); g.lineTo(0, 5); g.lineTo(-4.5, 9); g.closePath();
    g.fillStyle = '#b03a2e';
    g.fill();
    g.restore();

    // Your ship.
    g.save();
    g.translate(X(ship.x), Z(ship.z));
    g.rotate(Math.atan2(Math.sin(ship.heading), -Math.cos(ship.heading)));
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath();
    g.fillStyle = '#1f2f45';
    g.fill();
    g.strokeStyle = '#ecdcb4';
    g.stroke();
    g.restore();
  }

  function writeLog() {
    const ports = ISLANDS.filter((i) => i.portInfo).length;
    const cargo = GOODS.filter((x) => save.cargo[x.id]).map((x) => `${save.cargo[x.id]} ${x.name.toLowerCase()}`).join(', ');
    const rows = [
      ['Ship', (SHIP_TYPES[save.shipType] ? SHIP_TYPES[save.shipType].name : 'Sloop') + (save.ship.hull < 0.995 ? `, hull at ${Math.round(save.ship.hull * 100)}%` : '')],
      ['Day', save.days],
      ['Sailed', (save.distance / NM).toFixed(1) + ' nautical miles'],
      ['Islands found', `${save.discovered.length} of ${ISLANDS.length}`],
      ['Ports visited', `${save.visited.length} of ${ports}`],
      ['Curiosities', `${save.finds.length} of ${ISLANDS.length}`],
      ['Shells', `${save.shells.length} of ${ISLANDS.length * SHELLS_PER_ISLAND}`],
      ['Standing', wanted() >= 1 ? `Wanted (${Math.floor(wanted())} of 5)` : save.piratesSunk ? `Honest sailor, ${save.piratesSunk} ${save.piratesSunk === 1 ? 'pirate' : 'pirates'} sunk` : 'Honest sailor'],
      ['Treasure', `${save.treasures} dug up, ${save.maps.length} ${save.maps.length === 1 ? 'map' : 'maps'} in hand`],
      ['Purse', save.coins + ' coins'],
      ['Hold', `${cargoCount()} of ${save.hold} crates` + (cargo ? ` (${cargo})` : '')],
    ];
    log.replaceChildren(...rows.flatMap(([k, v]) => [Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v })]));
  }

  let timer = 0;
  return {
    get isOpen() { return !panel.hidden; },
    toggle(ship, wind, vessels) {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { draw(ship, wind, vessels); writeLog(); }
      return !panel.hidden;
    },
    update(dt, ship, wind, vessels) {
      if (panel.hidden || (timer -= dt) > 0) return;
      timer = 0.5;
      draw(ship, wind, vessels);
      writeLog();
    },
  };
}
