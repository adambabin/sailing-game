// What happens inside the places you can visit in port: tavern, market, shipwright.

import { save, persist, cargoCount } from './save.js';
import { GOODS, TAVERNS, buyPrice, sellPrice, bestRoute } from './trade.js';
import { ISLANDS } from './islands.js';
import { SHIP_TYPES } from './ship.js';

const PAINT_COST = 25, CLOTH_COST = 60;
const PART_LABELS = { hull: 'Hull', trim: 'Trim', sail: 'Sails', flag: 'Flag', pattern: 'Sail cloth' };
// Always available, for free.
const BASIC = {
  hull: [0x2f6f8f, 0x1f2f45, 0x7a2f2a],
  trim: [0xf2d9a0, 0xffffff, 0xf0c05a],
  sail: [0xf6efdc, 0xffffff, 0xd9b98a],
  flag: [0xd9453c, 0xf0c05a, 0x3a78c9],
  pattern: ['plain'],
};
// Sold by shipwrights; each port stocks a different few.
const SPECIAL = {
  hull: [0x2f6b4a, 0x2b2b30, 0xe9e2cf, 0xd9a441],
  trim: [0xd9453c, 0x23252b, 0x8fd0e8],
  sail: [0xc94a3a, 0x33486b, 0x34343a],
  flag: [0x3aa66a, 0x1d1d22, 0xffffff],
  pattern: ['stripes', 'bands'],
};
const UPGRADES = [
  { id: 'hold', name: 'Bigger hold', detail: 'Carry 10 more crates', cost: 150 },
  { id: 'sails', name: 'Finer sailcloth', detail: 'About a tenth faster in any wind', cost: 250 },
];
export const ALL_LOOK_VALUES = Object.fromEntries(Object.keys(BASIC).map((k) => [k, [...BASIC[k], ...SPECIAL[k]]]));

const LORE = [
  'Wind on your beam and she flies. Wind on your nose and she sulks. That is all there is to sailing, friend.',
  'When the sky goes grey and the ribbons start streaming, take in sail. She will ride easier for it.',
  'A ship at anchor always swings to face the wind. Handy, when you have lost track of it.',
  'Nights pass quicker than days out here. Something in the rum, I expect.',
  'More canvas, more speed. But a gale with full sail will have your rail in the water.',
  'Prices shift a little every morning. The patient trader checks twice.',
];

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function bearing(from, to) {
  const deg = (Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI;
  return POINTS[Math.round(((deg + 360) % 360) / 45) % 8];
}

const h = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

// `game` supplies: env (for the day), look + applyLook(), audio, toast(), applyUpgrades().
export function createPlaces(game) {
  const panel = document.getElementById('place'), title = document.getElementById('place-title'), body = document.getElementById('place-body');
  let open = null; // { island, kind }
  let lineIndex = Math.floor(Math.random() * 100);
  const portIndex = (isl) => ISLANDS.filter((i) => i.portInfo).indexOf(isl);
  const purse = () => h('p', { className: 'purse' }, `${save.coins} coins · hold ${cargoCount()} of ${save.hold} crates`);

  const keeper = (isl, kind) => isl.portInfo.places.find((p) => p.kind === kind).keeperName;

  function tavern(isl) {
    title.textContent = TAVERNS[isl.name] || 'The Tavern';
    const lines = [];
    for (const good of GOODS) {
      const r = bestRoute(good);
      if (r.cheap !== r.dear) lines.push(`${good.name}? Cheapest at ${r.cheap}. They pay best for it at ${r.dear}.`);
    }
    for (const other of ISLANDS) {
      if (other === isl) continue;
      const what = other.portInfo ? 'a harbour and a market' : other.lighthouse ? 'a light to steer by' : 'nothing but palms and quiet';
      lines.push({ text: `${other.name} lies to the ${bearing(isl, other)} of here. There is ${what}.`, island: other.name });
    }
    lines.push(...LORE);
    const pick = lines[(lineIndex * 7) % lines.length];
    lineIndex++;
    const text = typeof pick === 'string' ? pick : pick.text;
    if (pick.island && !save.discovered.includes(pick.island) && !save.rumoured.includes(pick.island)) {
      save.rumoured.push(pick.island);
      persist();
    }
    body.replaceChildren(
      h('p', { className: 'muted' }, `${keeper(isl, 'tavern')} leans over and says:`),
      h('p', { className: 'quote' }, '“' + text + '”'),
      h('button', { id: 'tavern-more', className: 'go', onclick: () => tavern(isl) }, 'Hear another')
    );
  }

  function market(isl) {
    title.textContent = isl.name + ' market';
    const day = save.days;
    const rows = GOODS.map((good) => {
      const buy = buyPrice(isl.name, good, day), sell = sellPrice(isl.name, good, day);
      const have = save.cargo[good.id] || 0;
      const room = save.hold - cargoCount();
      const trade = (n, price) => () => {
        save.cargo[good.id] = have + n;
        save.coins -= n * price;
        persist();
        game.audio.coin();
        market(isl);
      };
      const canBuy = Math.min(room, Math.floor(save.coins / buy));
      const btn = (id, label, n, price, enabled) => h('button', { id: `${id}-${good.id}`, disabled: !enabled, onclick: trade(n, price) }, label);
      return h('div', { className: 'trade-row' },
        h('div', {}, h('b', {}, good.name), h('span', { className: 'muted' }, ` you have ${have}`)),
        h('div', { className: 'trade-buttons' },
          btn('buy', `Buy ${buy}`, 1, buy, canBuy >= 1),
          btn('buy5', '×5', 5, buy, canBuy >= 5),
          btn('sell', `Sell ${sell}`, -1, sell, have >= 1),
          btn('sellall', 'All', -have, sell, have >= 2)));
    });
    body.replaceChildren(h('p', { className: 'muted' }, `${keeper(isl, 'market')} keeps the stall. Prices are per crate, in coins.`), purse(), ...rows);
  }

  function shipwright(isl) {
    title.textContent = isl.name + ' shipwright';
    const pi = Math.max(0, portIndex(isl));
    const rows = [];
    for (const key in BASIC) {
      const specials = SPECIAL[key];
      const stock = key === 'hull' ? [specials[pi % 4], specials[(pi + 1) % 4]] : key === 'pattern' ? [specials[pi % 2]] : [specials[(pi + (key === 'flag' ? 1 : 0)) % 3]];
      const cost = key === 'pattern' ? CLOTH_COST : PAINT_COST;
      const owns = (v) => BASIC[key].includes(v) || save.owned.includes(`${key}:${v}`) || game.look[key] === v;
      const values = [...BASIC[key], ...specials.filter((v) => owns(v) || stock.includes(v))];
      const row = h('div', { className: 'swatches' });
      for (const v of values) {
        const owned = owns(v);
        const b = h('button', { id: `look-${key}-${v}` });
        b.setAttribute('aria-pressed', String(game.look[key] === v));
        if (typeof v === 'number') {
          b.style.background = '#' + v.toString(16).padStart(6, '0');
          b.setAttribute('aria-label', `${PART_LABELS[key]} colour${owned ? '' : `, ${cost} coins`}`);
        } else {
          b.className = 'text';
          b.textContent = v[0].toUpperCase() + v.slice(1);
        }
        if (!owned) {
          b.classList.add('locked');
          b.dataset.cost = cost;
          if (typeof v !== 'number') b.textContent += ` · ${cost}`;
        }
        b.onclick = () => {
          if (!owned) {
            if (save.coins < cost) return game.toast(`That costs ${cost} coins`);
            save.coins -= cost;
            save.owned.push(`${key}:${v}`);
            game.audio.coin();
          }
          game.look[key] = v;
          game.applyLook();
          persist();
          shipwright(isl);
        };
        row.append(b);
      }
      rows.push(h('span', { className: 'label' }, PART_LABELS[key]), row);
    }
    // The ships themselves: buy a bigger one, or change back to one you already own.
    const ships = Object.entries(SHIP_TYPES).map(([id, t]) => {
      const owned = save.ships.includes(id), current = game.ship.typeId === id;
      const tooFull = cargoCount() > t.hold + (save.upgrades.hold ? 10 : 0);
      return h('div', { className: 'trade-row' },
        h('div', { className: 'ship-info' }, h('b', {}, t.name), h('span', { className: 'muted' }, ` holds ${t.hold} crates`), h('div', { className: 'muted' }, t.blurb)),
        h('button', {
          id: 'ship-' + id, disabled: current || tooFull || (!owned && save.coins < t.price),
          onclick: () => {
            if (!owned) { save.coins -= t.price; game.audio.coin(); }
            game.setShip(id);
            game.toast(owned ? `You take the ${t.name.toLowerCase()} out` : `The ${t.name.toLowerCase()} is yours`);
            shipwright(isl);
          },
        }, current ? 'Your ship' : tooFull ? 'Hold too full' : owned ? 'Sail her' : `${t.price} coins`));
    });
    const upgrades = UPGRADES.map((u) => {
      const has = !!save.upgrades[u.id];
      return h('div', { className: 'trade-row' },
        h('div', {}, h('b', {}, u.name), h('span', { className: 'muted' }, ' ' + u.detail)),
        h('button', {
          id: 'upgrade-' + u.id, disabled: has || save.coins < u.cost,
          onclick: () => {
            save.coins -= u.cost;
            save.upgrades[u.id] = true;
            game.applyUpgrades();
            game.audio.coin();
            persist();
            shipwright(isl);
          },
        }, has ? 'Fitted' : `${u.cost} coins`));
    });
    body.replaceChildren(
      h('p', { className: 'muted' }, `${keeper(isl, 'shipwright')} wipes their hands and shows you what is in stock.`),
      purse(),
      h('h3', {}, 'Ships'),
      ...ships,
      h('p', { className: 'muted' }, 'Ships you own are kept for you at every shipwright. Your paint goes with you.'),
      h('h3', {}, 'Paint and fittings'),
      h('div', { className: 'look-rows' }, ...rows),
      h('p', { className: 'muted' }, `Ringed paints cost ${PAINT_COST} coins, once. Every shipwright stocks different ones.`),
      ...upgrades
    );
  }

  const builders = { tavern, market, shipwright };
  const api = {
    get isOpen() { return !!open; },
    open(isl, kind) {
      open = { isl, kind };
      builders[kind](isl);
      panel.hidden = false;
    },
    // A simple card of text, used for curiosities found on the islands.
    show(heading, paragraphs) {
      open = { kind: 'card' };
      title.textContent = heading;
      body.replaceChildren(...paragraphs.map((t, i) => h('p', { className: i ? '' : 'quote' }, t)));
      panel.hidden = false;
    },
    close() {
      open = null;
      panel.hidden = true;
    },
  };
  document.getElementById('place-close').addEventListener('click', api.close);
  return api;
}
