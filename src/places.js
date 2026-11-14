// What happens inside the places you can visit in port: tavern, market, shipwright.

import { save, persist, cargoCount } from './save.js';
import { GOODS, TAVERNS, buyPrice, sellPrice, bestRoute } from './trade.js';
import { ISLANDS } from './islands.js';
import { SHIP_TYPES } from './ship.js';
import { MAP_PRICE, MAX_MAPS } from './treasure.js';
import { isWanted, wanted, fine, payFine, priceUp, priceDown, ZONES, LORD_AFTER, LORD_BOUNTY, lordState, lordOf } from './factions.js';
import * as jobs from './jobs.js';
import { REWARDS, EARNED_LOOKS, hasReward } from './rewards.js';
import { FISH, cargoKey, fishPrice } from './fishing.js';
import * as home from './home.js';

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
export const ALL_LOOK_VALUES = Object.fromEntries(Object.keys(BASIC).map((k) => [k, [...BASIC[k], ...SPECIAL[k], ...EARNED_LOOKS[k]]]));

const LORE = [
  'Wind on your beam and she flies. Wind on your nose and she sulks. That is all there is to sailing, friend.',
  'When the sky goes grey and the ribbons start streaming, take in sail. She will ride easier for it.',
  'A ship at anchor always swings to face the wind. Handy, when you have lost track of it.',
  'Nights pass quicker than days out here. Something in the rum, I expect.',
  'More canvas, more speed. But a gale with full sail will have your rail in the water.',
  'Prices shift a little every morning. The patient trader checks twice.',
  'There is a stretch of water west of The Twins we call The Deep. Black as ink, and something lives down there. Arms like masts, they say.',
  'Old sailors swear a serpent rises in the worst storms, far out where no one can help you. I never believed it. Then I met one who had seen it.',
  'Watch for spouts on the horizon. Sail close while a whale is up and you will remember it all your life.',
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
    const washed = game.treasure.bottleIsland();
    if (washed) lines.push(`A fisherman swears he saw a bottle wash up on ${washed.name} this morning. Could be a letter. Could be a map.`);
    lines.push('A treasure map never names its island. Learn the shapes on your chart, and you will know it when you see it.');
    const pick = lines[(lineIndex * 7) % lines.length];
    lineIndex++;
    const text = typeof pick === 'string' ? pick : pick.text;
    if (pick.island && !save.discovered.includes(pick.island) && !save.rumoured.includes(pick.island)) {
      save.rumoured.push(pick.island);
      persist();
    }
    // Now and then somebody in the corner has a map to sell.
    const T = game.treasure, full = !T.canHoldMore();
    const buyMap = h('button', {
      id: 'tavern-map', className: 'close', disabled: full || save.coins < MAP_PRICE,
      onclick: () => {
        const m = T.gainMap();
        if (!m) return;
        save.coins -= MAP_PRICE;
        persist();
        game.audio.coin();
        game.toast(T.tierName(m) + ' is yours. Find it in your chart.');
        tavern(isl);
      },
    }, full ? `You are carrying ${MAX_MAPS} maps already` : `Buy a treasure map · ${MAP_PRICE} coins`);
    // The bounty board: pirate captains at large, and what the navy owes you.
    const atLarge = game.vessels.list.filter((v) => v.faction === 'pirate' && !v.gone && !v.sinking);
    const board = [h('h3', {}, 'Bounties'),
      ...atLarge.map((v) => h('div', { className: 'trade-row' }, h('div', { className: 'ship-info' }, h('b', {}, v.captain), h('div', { className: 'muted' }, `${v.type.name} · ${v.zone.name}`)), h('span', { className: 'purse' }, `${v.bounty} coins`))),
      ...(atLarge.length ? [] : [h('p', { className: 'muted' }, 'No pirate captain is known to be at large today.')]),
      ...(save.bountyDue > 0 ? [h('div', { className: 'trade-row' },
        h('div', { className: 'ship-info' }, h('b', {}, 'Owed to you'), h('div', { className: 'muted' }, isWanted() ? 'The navy pays no bounty to a wanted captain. Clear your name first.' : 'For pirates sent to the bottom.')),
        h('button', { id: 'collect-bounty', disabled: isWanted(), onclick: () => { save.coins += save.bountyDue; save.bountyPaid += save.bountyDue; save.bountyDue = 0; persist(); game.audio.coin(); game.toast('Bounty paid in full.'); tavern(isl); } }, `Collect ${save.bountyDue} coins`))] : [])];
    // Work: what you have in hand, and what this tavern is offering today.
    const done = (job) => () => {
      const reward = jobs.finish(job);
      game.applyUpgrades();
      game.audio.coin();
      game.toast(`Paid ${job.pay} coins.` + (reward ? ` And for good service: ${reward.toLowerCase()}.` : ''), reward ? 8 : 3.2);
      tavern(isl);
    };
    const inHand = save.jobs.map((job, i) => {
      const lost = jobs.freightLost(job), ready = !lost && jobs.canFinish(job, isl);
      return h('div', { className: 'trade-row' },
        h('div', { className: 'ship-info' }, h('b', {}, job.title), h('div', { className: 'muted' }, lost ? 'The freight is lost. There is nothing to deliver.' : ready ? `Done. ${job.pay} coins are waiting for you.` : jobs.status(job, isl))),
        h('div', { className: 'trade-buttons' },
          ...(ready ? [h('button', { id: 'job-done-' + i, onclick: done(job) }, `Collect ${job.pay}`)] : []),
          ...(ready ? [] : [h('button', { id: 'job-drop-' + i, onclick: () => { jobs.abandon(job); tavern(isl); } }, 'Give it up')])));
    });
    const onOffer = jobs.offers(isl, save.days).map((o, i) => {
      const why = jobs.cannotTake(o);
      return h('div', { className: 'trade-row' },
        h('div', { className: 'ship-info' }, h('b', {}, o.title), h('div', { className: 'muted' }, o.detail)),
        h('button', { id: 'job-take-' + i, disabled: !!why, onclick: () => { jobs.take(o, save.days); game.toast('Agreed. It is noted in your logbook.'); tavern(isl); } }, why || `Take it · ${o.pay} coins`));
    });
    // A house of your own: buy one here, or move your home here.
    const H = save.home, here = H.port === isl.name;
    const homeRow = here ? [h('p', { className: 'muted' }, 'This is your home port. Your house stands in the village.')]
      : [h('div', { className: 'trade-row' },
        h('div', { className: 'ship-info' }, h('b', {}, H.port ? 'Move your home here' : 'A house for sale'), h('div', { className: 'muted' }, H.port ? `Your home is at ${H.port}. Move here and your buildings, stores and ships come with you.` : 'Make this your home port: a house of your own, and land to build a warehouse, moorings, businesses and a trophy hall.')),
        h('button', { id: 'buy-home', disabled: save.coins < (H.port ? home.MOVE_PRICE : home.HOME_PRICE), onclick: () => { const moved = home.settle(isl); game.homeChanged(); game.audio.coin(); game.toast(moved ? `Your home is now ${isl.name}.` : `The house is yours. Welcome home to ${isl.name}.`, 5); tavern(isl); } }, `${H.port ? home.MOVE_PRICE : home.HOME_PRICE} coins`))];
    const toGo = jobs.nextRewardIn();
    const work = [h('h3', {}, 'Work'),
      ...inHand,
      ...onOffer,
      ...(onOffer.length ? [] : [h('p', { className: 'muted' }, 'Nothing more on offer here today. Try again tomorrow, or another tavern.')]),
      h('p', { className: 'muted' }, `You have done ${save.jobsDone} ${save.jobsDone === 1 ? 'job' : 'jobs'} for the taverns.` + (toGo ? ` The harbours reward good service: ${toGo} more for something that cannot be bought.` : ''))];
    // The four pirate lords: where each keeps, and how you stand with them.
    const lords = [h('h3', {}, 'The pirate lords'), ...ZONES.map((zone) => {
      const L = lordState(zone), lord = lordOf(zone), out = game.vessels.list.some((v) => v.lord && v.zone === zone && !v.gone);
      const prize = lord.rewards.map((id) => REWARDS[id].name.toLowerCase()).join(' and ');
      const state = L.beaten ? `Beaten by you. You won ${prize}.`
        : out ? 'Out in a great galleon, looking for you.'
        : L.sunk >= LORD_AFTER ? `Will come out for you when you next sail into ${zone.name}.`
        : `Keeps out of sight. Sink or take ${LORD_AFTER - L.sunk} more of their ships in ${zone.name} to draw them out.`;
      return h('div', { className: 'trade-row' }, h('div', { className: 'ship-info' }, h('b', {}, lord.name), h('div', { className: 'muted' }, `${zone.name}, ${jobs.whereabouts(isl, zone)}. ${state}`)), h('span', { className: 'purse' }, L.beaten ? 'Beaten' : `${LORD_BOUNTY} coins`));
    })];
    body.replaceChildren(
      h('p', { className: 'muted' }, `${keeper(isl, 'tavern')} leans over and says:`),
      h('p', { className: 'quote' }, '“' + text + '”'),
      h('div', { className: 'trade-buttons' }, h('button', { id: 'tavern-more', className: 'go', onclick: () => tavern(isl) }, 'Hear another'), buyMap),
      h('p', { className: 'muted', style: 'margin-top:12px' }, `A sailor in the corner sells old maps, no questions asked. You have ${save.coins} coins.`),
      ...work,
      h('h3', {}, 'Home'),
      ...homeRow,
      ...board,
      ...lords
    );
  }

  function market(isl) {
    title.textContent = isl.name + ' market';
    const day = save.days;
    const rows = GOODS.map((good) => {
      const buy = Math.ceil(buyPrice(isl.name, good, day) * priceUp()), sell = Math.max(1, Math.floor(sellPrice(isl.name, good, day) * priceDown()));
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
    // A wanted captain gets poor prices until the fine is paid (or a few quiet days pass).
    const notice = !isWanted() ? [] : [h('div', { className: 'trade-row warn' },
      h('div', { className: 'ship-info' }, h('b', {}, 'You are a wanted captain'), h('div', { className: 'muted' }, `${keeper(isl, 'market')} will deal with you, at a price. The navy will not. It fades by a star each day, or the harbour will take a fine.`)),
      h('button', { id: 'pay-fine', disabled: save.coins < fine(), onclick: () => { payFine(); game.audio.coin(); game.toast('Fine paid. You are an honest sailor again.'); market(isl); } }, `Pay ${fine()} coins`))];
    // Fish from your hold. The market buys them but does not sell them: you catch your own.
    const fishRows = FISH.filter((f) => save.cargo[cargoKey(f)]).map((f) => {
      const have = save.cargo[cargoKey(f)], price = Math.max(1, Math.floor(fishPrice(isl.name, f, day) * priceDown()));
      const sell = (n) => () => { save.cargo[cargoKey(f)] = have - n; if (!save.cargo[cargoKey(f)]) delete save.cargo[cargoKey(f)]; save.coins += n * price; persist(); game.audio.coin(); market(isl); };
      return h('div', { className: 'trade-row' },
        h('div', {}, h('b', {}, f.name), h('span', { className: 'muted' }, ` you have ${have}`)),
        h('div', { className: 'trade-buttons' },
          h('button', { id: 'sellfish-' + f.id, onclick: sell(1) }, `Sell ${price}`),
          h('button', { id: 'sellallfish-' + f.id, disabled: have < 2, onclick: sell(have) }, 'All')));
    });
    const fishPart = fishRows.length ? [h('h3', {}, 'Fish'), h('p', { className: 'muted' }, 'Every market pays a different price for each kind.'), ...fishRows] : [];
    body.replaceChildren(h('p', { className: 'muted' }, `${keeper(isl, 'market')} keeps the stall. Prices are per crate, in coins.`), purse(), ...notice, ...rows, ...fishPart);
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
      const values = [...BASIC[key], ...specials.filter((v) => owns(v) || stock.includes(v)), ...EARNED_LOOKS[key].filter((v) => owns(v))];
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
    // Mending battle damage.
    const st = game.ship.state, cost = Math.ceil((1 - st.hull) * game.ship.type.hullMax * 0.6);
    const repair = h('div', { className: 'trade-row' },
      h('div', {}, h('b', {}, 'Repair the hull'), h('span', { className: 'muted' }, cost ? ` she is at ${Math.round(st.hull * 100)}%` : ' she is sound')),
      h('button', {
        id: 'repair', disabled: !cost || save.coins < cost,
        onclick: () => { save.coins -= cost; st.hull = 1; game.audio.coin(); persist(); shipwright(isl); },
      }, cost ? `${cost} coins` : 'No damage'));
    // The ships sailing in company with you: mend them, or pay them off.
    const fleetRows = game.vessels.fleet().map((v, i) => {
      const fix = Math.ceil((1 - v.hull) * v.type.hullMax * 0.6), worth = game.shipValue(v.typeId, v.hull);
      return h('div', { className: 'trade-row' },
        h('div', { className: 'ship-info' }, h('b', {}, v.label), h('span', { className: 'muted' }, ` hull ${Math.round(v.hull * 100)}% · ${game.wages[v.typeId]} coins a day`)),
        h('div', { className: 'trade-buttons' },
          h('button', { id: 'fleet-repair-' + i, disabled: !fix || save.coins < fix, onclick: () => { save.coins -= fix; v.hull = 1; game.audio.coin(); game.syncFleet(); shipwright(isl); } }, fix ? `Repair ${fix}` : 'Sound'),
          h('button', { id: 'fleet-sell-' + i, onclick: () => { save.coins += worth; game.vessels.remove(v); game.audio.coin(); shipwright(isl); } }, `Sell ${worth}`)));
    });
    const fleetPart = fleetRows.length ? [h('h3', {}, 'Your fleet'), ...fleetRows] : [];
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
    // Fittings that were earned, not bought. They go with you from ship to ship.
    const fitted = Object.keys(REWARDS).filter((id) => REWARDS[id].fit && hasReward(id));
    const earned = fitted.length ? [h('h3', {}, 'Earned fittings'), ...fitted.map((id) => h('div', { className: 'trade-row' }, h('div', {}, h('b', {}, REWARDS[id].name), h('span', { className: 'muted' }, ' ' + REWARDS[id].detail)), h('span', { className: 'purse' }, 'Fitted')))] : [];
    body.replaceChildren(
      h('p', { className: 'muted' }, `${keeper(isl, 'shipwright')} wipes their hands and shows you what is in stock.`),
      purse(),
      repair,
      h('h3', {}, 'Ships'),
      ...ships,
      h('p', { className: 'muted' }, 'Ships you own are kept for you at every shipwright. Your paint goes with you.'),
      ...fleetPart,
      h('h3', {}, 'Paint and fittings'),
      h('div', { className: 'look-rows' }, ...rows),
      h('p', { className: 'muted' }, `Ringed paints cost ${PAINT_COST} coins, once. Every shipwright stocks different ones.`),
      ...upgrades,
      ...earned
    );
  }

  // Your house: collect what your businesses have made, use the warehouse and moorings, and build more.
  function house(isl) {
    title.textContent = 'Your house at ' + isl.name;
    const room = () => save.hold - cargoCount();
    const goodName = (id) => (GOODS.find((g) => g.id === id) || FISH.find((f) => cargoKey(f) === id) || { name: id }).name;
    const parts = [h('p', { className: 'muted' }, 'The housekeeper has kept things tidy, and the kettle is on.'), purse()];
    parts.push(h('div', { className: 'trade-row' },
      h('div', { className: 'ship-info' }, h('b', {}, 'Sleep until morning'), h('div', { className: 'muted' }, 'A night in your own bed. The hours pass quickly.')),
      h('button', { id: 'home-sleep', onclick: () => { game.sleep(); api.close(); } }, 'Sleep')));
    // What the businesses have made.
    const business = Object.keys(home.BUILDINGS).filter((id) => home.BUILDINGS[id].makes && home.has(id));
    if (business.length) {
      const waiting = home.pendingText();
      parts.push(h('h3', {}, 'Your businesses'),
        h('div', { className: 'trade-row' },
          h('div', { className: 'ship-info' }, h('b', {}, business.map((id) => home.BUILDINGS[id].name).join(', ')), h('div', { className: 'muted' }, waiting ? 'Waiting for you: ' + waiting + '.' : 'Nothing waiting yet. They make their goods each morning, and hold up to five days of it.')),
          h('button', { id: 'home-collect', disabled: !waiting, onclick: () => { game.toast(home.collect(room()), 5); game.audio.coin(); house(isl); } }, 'Collect')));
    }
    // The warehouse: move cargo between the hold and the store.
    if (home.has('warehouse')) {
      const ids = [...new Set([...Object.keys(save.cargo), ...Object.keys(save.home.store)])].filter((id) => id !== 'freight' && ((save.cargo[id] || 0) + (save.home.store[id] || 0)) > 0);
      const move = (id, n) => () => { home.shift(id, n, room()); house(isl); };
      parts.push(h('h3', {}, 'Warehouse'), h('p', { className: 'muted' }, `${home.storeCount()} of ${home.WAREHOUSE_SPACE} crates stored · hold ${cargoCount()} of ${save.hold}.`),
        ...ids.map((id, i) => h('div', { className: 'trade-row' },
          h('div', {}, h('b', {}, goodName(id)), h('span', { className: 'muted' }, ` aboard ${save.cargo[id] || 0}, stored ${save.home.store[id] || 0}`)),
          h('div', { className: 'trade-buttons' },
            h('button', { id: 'store-' + i, disabled: !save.cargo[id], onclick: move(id, 1) }, 'Store 1'),
            h('button', { id: 'storeall-' + i, disabled: !save.cargo[id], onclick: move(id, 999) }, 'All'),
            h('button', { id: 'take-' + i, disabled: !save.home.store[id] || room() < 1, onclick: move(id, -1) }, 'Take 1'),
            h('button', { id: 'takeall-' + i, disabled: !save.home.store[id] || room() < 1, onclick: move(id, -999) }, 'All')))),
        ...(ids.length ? [] : [h('p', { className: 'muted' }, 'Nothing aboard or in store.')]));
    }
    // The moorings: ships laid up here, and fleet ships that could be.
    if (home.has('moorings')) {
      const spare = save.ships.filter((id) => id !== save.shipType);
      parts.push(h('h3', {}, 'Moorings'),
        h('p', { className: 'muted' }, (spare.length ? `Lying here: your ${spare.map((id) => SHIP_TYPES[id].name.toLowerCase()).join(' and ')}. ` : '') + 'Ships laid up here cost no wages, and are mended while they wait.'),
        ...save.home.moored.map((m, i) => h('div', { className: 'trade-row' },
          h('div', { className: 'ship-info' }, h('b', {}, `Laid up: ${SHIP_TYPES[m.type].name.toLowerCase()}`), h('div', { className: 'muted' }, `hull ${Math.round(m.hull * 100)}% · ${game.wages[m.type]} coins a day once she sails`)),
          h('button', { id: 'recall-' + i, disabled: game.vessels.fleet().length >= 3, onclick: () => { game.recallShip(i); house(isl); } }, 'Join the fleet'))),
        ...game.vessels.fleet().map((v, i) => h('div', { className: 'trade-row' },
          h('div', { className: 'ship-info' }, h('b', {}, v.label), h('div', { className: 'muted' }, `in your fleet · hull ${Math.round(v.hull * 100)}% · ${game.wages[v.typeId]} coins a day`)),
          h('button', { id: 'layup-' + i, onclick: () => { game.layUp(v); house(isl); } }, 'Lay her up'))));
    }
    // What is left to build.
    const todo = Object.entries(home.BUILDINGS).filter(([id]) => !home.has(id));
    if (todo.length) parts.push(h('h3', {}, 'Build'), ...todo.map(([id, b]) => h('div', { className: 'trade-row' },
      h('div', { className: 'ship-info' }, h('b', {}, b.name), h('div', { className: 'muted' }, b.detail)),
      h('button', { id: 'build-' + id, disabled: save.coins < b.cost, onclick: () => { home.build(id); game.homeChanged(); game.audio.coin(); game.toast(`Your ${b.name.toLowerCase()} is built.`); house(isl); } }, `${b.cost} coins`))));
    if (home.has('trophy')) parts.push(h('div', { className: 'trade-buttons', style: 'margin-top:12px' }, h('button', { id: 'home-trophies', className: 'close', onclick: () => game.openTrophies() }, 'Visit the trophy hall')));
    body.replaceChildren(...parts);
  }

  const builders = { tavern, market, shipwright, house };
  // Show the sheet, scrolled to the top, with the right word on its close buttons.
  const closeHead = document.getElementById('place-close'), closeFoot = document.getElementById('place-close-foot');
  function reveal(word) {
    closeHead.textContent = closeFoot.textContent = word;
    body.scrollTop = 0;
    panel.hidden = false;
  }
  const api = {
    get isOpen() { return !!open; },
    open(isl, kind) {
      open = { isl, kind };
      builders[kind](isl);
      reveal('Leave');
    },
    // A simple card of text, used for curiosities found on the islands.
    show(heading, paragraphs) {
      open = { kind: 'card' };
      title.textContent = heading;
      body.replaceChildren(...paragraphs.map((t, i) => h('p', { className: i ? '' : 'quote' }, t)));
      reveal('Close');
    },
    // A card holding any content (used for treasure maps).
    card(heading, ...nodes) {
      open = { kind: 'card' };
      title.textContent = heading;
      body.replaceChildren(...nodes);
      reveal('Close');
    },
    close() {
      open = null;
      panel.hidden = true;
    },
  };
  document.getElementById('place-close').addEventListener('click', api.close);
  document.getElementById('place-close-foot').addEventListener('click', api.close);
  return api;
}
