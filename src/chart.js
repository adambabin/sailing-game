// The sea chart and logbook. Islands are inked in as you discover them.

import { ISLANDS, MINOR_FEATURES, REGIONS, WORLD, islandGrid } from './islands.js';
import { save, cargoCount } from './save.js';
import { GOODS } from './trade.js';
import { SHELLS_PER_ISLAND } from './finds.js';
import { SHIP_TYPES } from './ship.js';
import { ZONES, wanted, lordsBeaten } from './factions.js';
import * as jobs from './jobs.js';
import { FISH } from './fishing.js';
import { DEEP, CREATURES } from './creatures.js';

const NM = 1852;
const NEAR_SPAN = 2400; // metres across when zoomed in around the ship

// Paint one island's shape onto a small canvas of its own, once, to be stamped onto the chart.
function sprite(isl) {
  if (isl.sprite) return isl.sprite;
  const grid = islandGrid(isl), n = grid.n, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  const land = isl.type === 'volcano' || isl.type === 'dark' ? [128, 118, 108] : isl.type === 'cliff' ? [170, 166, 156] : isl.type === 'sand' ? [233, 217, 166] : [176, 192, 128];
  const high = isl.type === 'volcano' ? [92, 84, 78] : isl.type === 'cliff' ? [140, 150, 120] : [142, 158, 104];
  const at = (i, j) => (i < 0 || j < 0 || i >= n || j >= n ? 0 : grid.cells[j * n + i]);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = grid.cells[j * n + i], k = (j * n + i) * 4;
      if (v === 0) continue;
      let rgb = v === 1 ? [150, 205, 190] : v === 2 ? [233, 217, 166] : v === 3 ? land : high, alpha = v === 1 ? 130 : 255;
      // Ink the shoreline: any land cell that touches water.
      if (v >= 2 && (at(i - 1, j) < 2 || at(i + 1, j) < 2 || at(i, j - 1) < 2 || at(i, j + 1) < 2)) rgb = [96, 72, 44];
      img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; img.data[k + 3] = alpha;
    }
  }
  g.putImageData(img, 0, 0);
  return (isl.sprite = c);
}

export function createChart() {
  const panel = document.getElementById('chart'), canvas = document.getElementById('chart-canvas'), log = document.getElementById('chart-log');
  const zoomBtn = document.getElementById('chart-zoom');
  const g = canvas.getContext('2d');
  const aspect = (WORLD.x1 - WORLD.x0) / (WORLD.z1 - WORLD.z0);
  const serif = "'IM Fell English', Georgia, serif";
  let W = 320, H = 330, near = false, last = null;

  // Fit the chart to the screen: as large as will go, on any device.
  function size() {
    const sideways = window.innerWidth > window.innerHeight && window.innerHeight <= 520; // a phone held sideways
    const wide = window.innerWidth >= 860 || sideways;
    const room = wide ? Math.min(window.innerWidth - (sideways ? 360 : 420), 760) : window.innerWidth - 64;
    W = Math.round(Math.max(200, Math.min(room, (window.innerHeight - (sideways ? 112 : wide ? 120 : 210)) * aspect)));
    H = Math.round(W / aspect);
    const scale = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * scale;
    canvas.height = H * scale;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    g.setTransform(scale, 0, 0, scale, 0, 0);
  }

  let storm = () => null; // set by main.js: the storm at sea, if any
  function draw(ship, wind, vessels = []) {
    last = { ship, wind, vessels };
    // The stretch of sea in view: all of it, or a window around the ship.
    let x0 = WORLD.x0, z0 = WORLD.z0, span = WORLD.x1 - WORLD.x0;
    if (near) {
      span = NEAR_SPAN;
      x0 = Math.min(WORLD.x1 - span, Math.max(WORLD.x0, ship.x - span / 2));
      z0 = Math.min(WORLD.z1 - span / aspect, Math.max(WORLD.z0, ship.z - span / aspect / 2));
    }
    const k = W / span, X = (x) => (x - x0) * k, Z = (z) => (z - z0) * k;
    const small = W < 420 && !near;

    g.fillStyle = '#ecdcb4';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(90, 62, 38, 0.12)';
    g.lineWidth = 1;
    for (let x = Math.ceil(x0 / 500) * 500; x < x0 + span; x += 500) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
    for (let z = Math.ceil(z0 / 500) * 500; z < z0 + span / aspect; z += 500) { g.beginPath(); g.moveTo(0, Z(z)); g.lineTo(W, Z(z)); g.stroke(); }

    // The names of the regions, written large and faint across the sea.
    g.textAlign = 'center';
    g.fillStyle = 'rgba(90, 62, 38, 0.3)';
    g.font = `${near ? 17 : small ? 10 : 13}px ${serif}`;
    for (const r of REGIONS) g.fillText(r.name.toUpperCase().split('').join(near || !small ? '  ' : ''), X(r.x), Z(r.z));

    // Pirate waters, hatched in red.
    for (const zone of ZONES) {
      g.beginPath();
      g.arc(X(zone.x), Z(zone.z), zone.r * k, 0, 7);
      g.fillStyle = 'rgba(176, 58, 46, 0.13)';
      g.fill();
      g.setLineDash([4, 3]);
      g.strokeStyle = 'rgba(176, 58, 46, 0.8)';
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#8f2c22';
      g.font = `italic ${small ? 8 : 10}px ${serif}`;
      g.fillText(zone.name, X(zone.x), Z(zone.z) + 3);
    }

    // The Deep, where the kraken lives: a dark ring, as the old charts drew it.
    g.beginPath();
    g.arc(X(DEEP.x), Z(DEEP.z), DEEP.r * k, 0, 7);
    g.fillStyle = save.legends.kraken ? 'rgba(40, 60, 90, 0.08)' : 'rgba(30, 40, 70, 0.16)';
    g.fill();
    g.setLineDash([2, 3]);
    g.strokeStyle = 'rgba(30, 40, 70, 0.7)';
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#1e2846';
    g.font = `italic ${small ? 8 : 10}px ${serif}`;
    g.fillText(DEEP.name, X(DEEP.x), Z(DEEP.z) + 3);
    if (!small && !save.legends.kraken) { g.font = `italic ${near ? 10 : 8}px ${serif}`; g.fillText('here be monsters', X(DEEP.x), Z(DEEP.z) + 14); }

    // Islands you have found are inked in full; ones you have only heard of are a ghost and a name.
    g.imageSmoothingEnabled = true;
    for (const isl of ISLANDS) {
      const known = save.discovered.includes(isl.name);
      if (!known && !save.rumoured.includes(isl.name)) continue;
      if (X(isl.x) < -60 || X(isl.x) > W + 60 || Z(isl.z) < -60 || Z(isl.z) > H + 60) continue; // off the sheet
      const grid = islandGrid(isl);
      g.globalAlpha = known ? 1 : 0.3;
      g.drawImage(sprite(isl), X(isl.x - grid.half), Z(isl.z - grid.half), grid.half * 2 * k, grid.half * 2 * k);
      g.globalAlpha = 1;
      if (known && isl.portInfo) {
        g.fillStyle = save.visited.includes(isl.name) ? '#b03a2e' : '#3d2a1a';
        g.beginPath();
        g.arc(X(isl.dock.x), Z(isl.dock.z), near ? 3.4 : 2.2, 0, 7);
        g.fill();
      }
      if (save.home.port === isl.name) { // your home port: a little house
        const hx = X(isl.dock.x), hz = Z(isl.dock.z) - (near ? 12 : 9), s = near ? 6 : 4.5;
        g.fillStyle = '#2f6f8f';
        g.beginPath(); g.moveTo(hx - s, hz); g.lineTo(hx, hz - s); g.lineTo(hx + s, hz); g.closePath(); g.fill();
        g.fillRect(hx - s * 0.7, hz, s * 1.4, s * 0.9);
      }
      if (save.finds.includes(isl.name)) { // a little star where you found something
        g.fillStyle = '#b03a2e';
        g.font = `${near ? 13 : 9}px serif`;
        g.fillText('★', X(isl.findSpot.x), Z(isl.findSpot.z) + 4);
      }
      g.fillStyle = known ? '#3d2a1a' : 'rgba(61, 42, 26, 0.6)';
      g.font = `${known ? '' : 'italic '}${near ? 13 : small ? 8 : 10}px ${serif}`;
      // On a small sheet showing the whole sea, only ports and the big islands are named; zoom in for the rest.
      if (!small || isl.portInfo || isl.span > 150) g.fillText(isl.name, Math.min(W - 30, Math.max(30, X(isl.x))), Z(isl.z + isl.span) + (near ? 15 : 10));
    }
    // Rocks, cays and reefs appear once you know the island they lie off.
    for (const f of MINOR_FEATURES) {
      if (!save.discovered.includes(f.near)) continue;
      const grid = islandGrid(f);
      if (f.reef) {
        // A reef: a pale patch ringed with little crosses, the old sign for danger under water.
        g.save();
        g.translate(X(f.x), Z(f.z));
        g.rotate(f.rot);
        g.fillStyle = 'rgba(150, 205, 190, 0.55)';
        g.beginPath(); g.ellipse(0, 0, f.R * f.stretch * k, f.R * k, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(90, 62, 38, 0.75)';
        g.font = `${near ? 10 : 6}px serif`;
        for (let i = 0; i < 6; i++) g.fillText('+', Math.cos(i * 1.05) * f.R * f.stretch * k * 0.6, Math.sin(i * 1.05) * f.R * k * 0.6 + 2);
        g.restore();
      } else g.drawImage(sprite(f), X(f.x - grid.half), Z(f.z - grid.half), Math.max(2.5, grid.half * 2 * k), Math.max(2.5, grid.half * 2 * k));
    }

    // A storm in sight: a dark, ragged patch with lightning scratched across it.
    const sk = storm();
    if (sk && Math.hypot(sk.x - ship.x, sk.z - ship.z) < 3200) {
      g.save();
      g.translate(X(sk.x), Z(sk.z));
      g.fillStyle = 'rgba(52, 58, 72, 0.32)';
      for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(Math.cos(i * 0.7) * sk.r * k * 0.45, Math.sin(i * 1.3) * sk.r * k * 0.45, sk.r * k * 0.55, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(40, 44, 56, 0.85)';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-4, -9); g.lineTo(2, -1); g.lineTo(-2, 1); g.lineTo(4, 9); g.stroke();
      g.fillStyle = '#2c3140';
      g.font = `italic ${small ? 8 : 11}px ${serif}`;
      g.fillText('Storm', 0, sk.r * k * 0.9 + 10);
      g.restore();
    }

    // Sails in sight: tan for merchants, blue for the navy, black for pirates, green for your own.
    for (const v of vessels) {
      if (v.gone || Math.hypot(v.x - ship.x, v.z - ship.z) > 900) continue;
      g.fillStyle = v.fleet ? '#2f8a45' : v.faction === 'pirate' ? '#1d1d22' : v.faction === 'navy' ? '#2a5fa8' : '#a07a3c';
      g.beginPath();
      g.arc(X(v.x), Z(v.z), near ? 3.2 : 2, 0, 7);
      g.fill();
    }

    // A scale bar, and the compass rose with the wind.
    const mile = NM * k;
    g.strokeStyle = g.fillStyle = '#5a3e26';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(14, 20); g.lineTo(14 + mile, 20); g.moveTo(14, 16); g.lineTo(14, 24); g.moveTo(14 + mile, 16); g.lineTo(14 + mile, 24); g.stroke();
    g.font = `10px ${serif}`;
    g.fillText('1 sea mile', 14 + mile / 2, 14);
    g.save();
    g.translate(W - 30, 38);
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
    g.lineWidth = 1.2;
    g.stroke();
    g.restore();
  }

  zoomBtn.addEventListener('click', () => {
    near = !near;
    zoomBtn.textContent = near ? 'Whole sea' : 'Around the ship';
    if (last) draw(last.ship, last.wind, last.vessels);
  });
  window.addEventListener('resize', () => { if (!panel.hidden && last) { size(); draw(last.ship, last.wind, last.vessels); } });

  function writeLog(ship = last && last.ship) {
    const ports = ISLANDS.filter((i) => i.portInfo).length;
    const cargo = [...GOODS.filter((x) => save.cargo[x.id]).map((x) => `${save.cargo[x.id]} ${x.name.toLowerCase()}`), ...(save.cargo.freight ? [`${save.cargo.freight} freight`] : []), ...FISH.filter((f) => save.cargo['fish_' + f.id]).map((f) => `${save.cargo['fish_' + f.id]} ${f.name.toLowerCase()}`)].join(', ');
    const rows = [
      ['Ship', (SHIP_TYPES[save.shipType] ? SHIP_TYPES[save.shipType].name : 'Sloop') + (save.ship.hull < 0.995 ? `, hull at ${Math.round(save.ship.hull * 100)}%` : '')],
      ...(save.fleet.length ? [['Fleet', save.fleet.map((f) => `${SHIP_TYPES[f.type].name.toLowerCase()} ${Math.round(f.hull * 100)}%`).join(', ')]] : []),
      ['Day', save.days],
      ...(save.home.port ? [['Home port', save.home.port]] : []),
      ['Sailed', (save.distance / NM).toFixed(1) + ' nautical miles'],
      ['Islands found', `${save.discovered.length} of ${ISLANDS.length}`],
      ['Ports visited', `${save.visited.length} of ${ports}`],
      ['Curiosities', `${save.finds.length} of ${ISLANDS.length}`],
      ['Shells', `${save.shells.length} of ${ISLANDS.length * SHELLS_PER_ISLAND}`],
      ['Standing', wanted() >= 1 ? `Wanted (${Math.floor(wanted())} of 5)` : save.piratesSunk ? `Honest sailor, ${save.piratesSunk} ${save.piratesSunk === 1 ? 'pirate' : 'pirates'} sunk` + (save.bountyDue ? `, ${save.bountyDue} coins bounty to collect` : '') : 'Honest sailor'],
      ['Sea life', `${CREATURES.filter((c) => save.creatures[c.id]).length} of ${CREATURES.length} kinds seen`],
      ['Fish', `${Object.keys(save.fishLog).length} of ${FISH.length} kinds caught`],
      ['Tavern work', `${save.jobsDone} ${save.jobsDone === 1 ? 'job' : 'jobs'} done`],
      ...save.jobs.map((j) => ['Job', jobs.summary(j, ship || { x: 0, z: 0 })]),
      ['Pirate lords', `${lordsBeaten()} of ${ZONES.length} beaten`],
      ['Treasure', `${save.treasures} dug up, ${save.maps.length} ${save.maps.length === 1 ? 'map' : 'maps'} in hand`],
      ['Purse', save.coins + ' coins'],
      ['Hold', `${cargoCount()} of ${save.hold} crates` + (cargo ? ` (${cargo})` : '')],
    ];
    log.replaceChildren(...rows.flatMap(([k, v]) => [Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v })]));
  }

  let timer = 0;
  return {
    get isOpen() { return !panel.hidden; },
    showStorm(fn) { storm = fn; },
    toggle(ship, wind, vessels) {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { size(); draw(ship, wind, vessels); writeLog(); }
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
