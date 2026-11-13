// Work offered in taverns: freight and passengers for far ports, pirates to hunt,
// curiosities to report on and islands to chart. Every tavern has three jobs a
// day, and the first two are always peaceful.

import { save, persist, cargoCount } from './save.js';
import { ISLANDS } from './islands.js';
import { ZONES } from './factions.js';
import { grant, JOB_REWARDS } from './rewards.js';
import { FISH, fishById, cargoKey, habitat } from './fishing.js';

export const MAX_JOBS = 3;

const FREIGHT = ['lamp oil', 'church candles', 'sailcloth', 'medicine', 'seed corn', 'wine', 'nails and iron', 'books', 'window glass', 'roof tiles'];
const PASSENGERS = ['A priest', 'A doctor', 'A bride and her trunk', 'A surveyor', 'A homesick fisherman', 'Two nuns', 'A fiddler', 'A runaway clerk', 'A schoolmistress', 'An old soldier'];

// Random numbers that come out the same for the same port on the same day.
function seeded(text) {
  let s = 2166136261;
  for (let i = 0; i < text.length; i++) s = Math.imul(s ^ text.charCodeAt(i), 16777619);
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
// "far to the south-east": the only directions a job gives. Finding the place is up to you.
export function whereabouts(from, to) {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  if (d < 260) return 'close by';
  const deg = (Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI;
  const point = POINTS[Math.round(((deg + 360) % 360) / 45) % 8];
  return (d < 1000 ? 'a short sail to the ' : d < 2300 ? 'a fair way to the ' : 'far to the ') + point;
}

const place = (name) => ISLANDS.find((i) => i.name === name) || ZONES.find((z) => z.name === name);
// Where a job takes you: a port, an island, or a stretch of pirate water.
export const target = (job) => place(job.to);

// What is on offer at this port's tavern today (less anything already taken).
export function offers(isl, day) {
  const rnd = seeded(isl.name + ':' + day), pick = (list) => list[Math.floor(rnd() * list.length)];
  const ports = ISLANDS.filter((i) => i.portInfo && i !== isl);
  const far = (to) => Math.hypot(to.x - isl.x, to.z - isl.z);
  const list = [];
  // 1. Freight for another port. It takes up room in the hold until delivered.
  {
    const to = pick(ports), crates = 4 + Math.floor(rnd() * 7), what = pick(FREIGHT);
    list.push({ kind: 'freight', to: to.name, crates, what, pay: Math.round(40 + (crates * far(to)) / 90), title: `${crates} crates of ${what} for ${to.name}`, detail: `${to.name} lies ${whereabouts(isl, to)}. Paid at the tavern there.` });
  }
  // 2. A passenger.
  {
    const to = pick(ports), who = pick(PASSENGERS);
    list.push({ kind: 'passenger', to: to.name, who, pay: Math.round(30 + far(to) / 14), title: `${who}, bound for ${to.name}`, detail: `${to.name} lies ${whereabouts(isl, to)}. Paid when you bring them to the tavern there.` });
  }
  // 3. Something different: a pirate to hunt, a curiosity to report on, or an island to chart.
  {
    const unseen = ISLANDS.filter((i) => !save.finds.includes(i.name) && i !== isl), unknown = ISLANDS.filter((i) => !save.discovered.includes(i.name));
    const kinds = ['hunt', 'fish', 'fish', ...(unseen.length ? ['collector'] : []), ...(unknown.length ? ['survey'] : [])];
    const kind = pick(kinds);
    if (kind === 'hunt') {
      const zone = pick(ZONES);
      list.push({ kind, to: zone.name, pay: Math.round(180 + far(zone) / 25), title: `Sink or take a pirate in ${zone.name}`, detail: `Those waters lie ${whereabouts(isl, zone)}. Any one pirate ship will do. Tell of it at any tavern to be paid, on top of the bounty.` });
    } else if (kind === 'fish') {
      // The cook wants a particular fish, brought back here.
      const fish = pick(FISH.filter((f) => !f.where.storm && f.odds >= 2));
      list.push({ kind, to: isl.name, fishId: fish.id, pay: Math.round(fish.price * 3 + 40), title: `A ${fish.name.toLowerCase()} for the cook`, detail: `Any size, brought back to this tavern. It bites ${habitat(fish)}.` });
    } else if (kind === 'collector') {
      const to = pick(unseen);
      list.push({ kind, to: to.name, pay: Math.round(50 + far(to) / 18), title: `Find what is worth seeing on ${to.name}`, detail: `A collector is paying. ${to.name} lies ${whereabouts(isl, to)}. Go ashore, find its curiosity, and tell any tavern keeper.` });
    } else {
      const to = pick(unknown);
      list.push({ kind, to: to.name, pay: Math.round(40 + far(to) / 22), title: `Chart ${to.name}`, detail: `The harbour master has no chart of it. It lies ${whereabouts(isl, to)}. Sail close enough to sketch it, and report at any tavern.` });
    }
  }
  const portNo = ISLANDS.indexOf(isl);
  list.forEach((o, n) => (o.id = `${day}:${portNo}:${n}`));
  return list.filter((o) => !save.jobsTaken.includes(o.id));
}

// Why an offer cannot be taken just now, or '' if it can.
export function cannotTake(offer) {
  if (save.jobs.length >= MAX_JOBS) return `You have ${MAX_JOBS} jobs in hand`;
  if (offer.kind === 'freight' && cargoCount() + offer.crates > save.hold) return 'No room in the hold';
  return '';
}
export function take(offer, day) {
  save.jobsTaken = save.jobsTaken.filter((id) => id.startsWith(day + ':')); // forget earlier days' offers
  save.jobsTaken.push(offer.id);
  save.jobs.push({ ...offer, done: false });
  if (offer.kind === 'freight') save.cargo.freight = (save.cargo.freight || 0) + offer.crates;
  persist();
}

// Has the work been done (wherever it has to be reported)?
export function isDone(job) {
  if (job.kind === 'collector') return save.finds.includes(job.to);
  if (job.kind === 'survey') return save.discovered.includes(job.to);
  if (job.kind === 'hunt') return job.done;
  if (job.kind === 'fish') return (save.cargo[cargoKey(fishById(job.fishId))] || 0) > 0;
  return true; // freight and passengers only need bringing to the right port
}
// Can it be handed in at this port's tavern? Freight and passengers must be at their own port.
export function canFinish(job, isl) {
  if (job.kind === 'freight') return job.to === isl.name && (save.cargo.freight || 0) >= job.crates;
  if (job.kind === 'passenger' || job.kind === 'fish') return job.to === isl.name && isDone(job);
  return isDone(job);
}
// Freight that went down with a ship, or was left behind with a fleet ship, cannot be delivered.
export const freightLost = (job) => job.kind === 'freight' && (save.cargo.freight || 0) < job.crates;

function drop(job, handIn = false) {
  save.jobs = save.jobs.filter((j) => j !== job);
  if (handIn && job.kind === 'fish' && isDone(job)) {
    const key = cargoKey(fishById(job.fishId));
    if (--save.cargo[key] <= 0) delete save.cargo[key];
  }
  if (job.kind === 'freight') {
    save.cargo.freight = Math.max(0, (save.cargo.freight || 0) - job.crates);
    if (!save.cargo.freight) delete save.cargo.freight;
  }
}
// Hand the job in and be paid. Returns the name of any reward earned along with the coins.
export function finish(job) {
  drop(job, true);
  save.coins += job.pay;
  save.jobsDone++;
  const reward = JOB_REWARDS[save.jobsDone] ? grant(JOB_REWARDS[save.jobsDone]) : '';
  persist();
  return reward;
}
export function abandon(job) {
  drop(job);
  persist();
}
// A pirate from these waters has been sunk or taken by you: that settles any hunting job there.
export function pirateBeaten(zoneName) {
  for (const j of save.jobs) if (j.kind === 'hunt' && j.to === zoneName) j.done = true;
}
// After a sinking the hold is empty; freight jobs are gone with it.
export function loseFreight() {
  save.jobs = save.jobs.filter((j) => j.kind !== 'freight');
  delete save.cargo.freight;
}

// One line for the logbook, with the direction from where you are now.
export function summary(job, from) {
  const t = target(job), where = t ? whereabouts(from, t) : '';
  if (job.kind === 'freight') return freightLost(job) ? `Freight for ${job.to}: lost` : `${job.crates} crates of ${job.what} for ${job.to}, ${where}`;
  if (job.kind === 'passenger') return `${job.who} for ${job.to}, ${where}`;
  if (job.kind === 'fish') return isDone(job) ? `A ${fishById(job.fishId).name.toLowerCase()} for the cook at ${job.to}: in your hold, ${where}` : `A ${fishById(job.fishId).name.toLowerCase()} for the cook at ${job.to}: it bites ${habitat(fishById(job.fishId))}`;
  if (isDone(job)) return `${job.title}: done, report at any tavern`;
  return `${job.title}, ${where}`;
}
// What is left to do, as the keeper of `isl` would put it.
export function status(job, isl) {
  const where = (t) => whereabouts(isl, t);
  if (job.kind === 'fish') return isDone(job) ? `You have one aboard. Bring it to ${job.to}, ${where(target(job))}.` : `Still to catch. It bites ${habitat(fishById(job.fishId))}.`;
  if (isDone(job) && job.to !== isl.name) return `Not here: ${job.to} is ${where(target(job))}.`;
  return `Still to do. It lies ${where(target(job))}.`;
}

// How many more jobs until the next reward, for the tavern keeper to mention.
export function nextRewardIn() {
  const next = Object.keys(JOB_REWARDS).map(Number).find((n) => n > save.jobsDone);
  return next ? next - save.jobsDone : 0;
}
