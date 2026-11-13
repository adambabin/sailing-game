// Things that cannot be bought, only earned: special paints and sail cloths, and
// improvements to your ship. They come from beating the pirate lords and from
// doing enough work for the taverns.

import { save, persist } from './save.js';

// `look` is a paint or cloth (part and value) that then appears at every shipwright.
// `fit` is an improvement; what each one does is applied in applyUpgrades() in main.js.
export const REWARDS = {
  // From the four pirate lords.
  serpent: { name: 'Serpent-green hull paint', look: ['hull', 0x1e7a5e] },
  quickmatch: { name: 'Quick-match', detail: 'Your guns reload a fifth faster', fit: true },
  deadman: { name: 'Deadman’s black sails', look: ['sail', 0x16161a] },
  ironwood: { name: 'Ironwood planking', detail: 'Your hull takes a fifth less damage', fit: true },
  ash: { name: 'Ash Road crimson sails', look: ['sail', 0xa8281e] },
  longguns: { name: 'Long guns', detail: 'Your shot hits a fifth harder', fit: true },
  grave: { name: 'Gravedigger’s chequered sail cloth', look: ['pattern', 'checks'] },
  stormrig: { name: 'Storm rig', detail: 'A little faster in any wind', fit: true },
  admiral: { name: 'The rising-sun sail cloth', look: ['pattern', 'sun'] },
  // From tavern work.
  guildtrim: { name: 'Harbour-guild teal trim', look: ['trim', 0x4aa3a0] },
  copper: { name: 'Coppered bottom', detail: 'She answers the wheel more quickly', fit: true },
  diamonds: { name: 'Diamond sail cloth', look: ['pattern', 'diamonds'] },
  crew: { name: 'Seasoned crew', detail: 'At anchor they patch the hull faster and further', fit: true },
  royal: { name: 'Royal purple hull paint', look: ['hull', 0x6a3f8f] },
};

// Every earned paint and cloth, by part, so shipwrights and the saved look know about them.
export const EARNED_LOOKS = { hull: [], trim: [], sail: [], flag: [], pattern: [] };
for (const r of Object.values(REWARDS)) if (r.look) EARNED_LOOKS[r.look[0]].push(r.look[1]);

export const hasReward = (id) => save.earned.includes(id);

// Hand over a reward. Returns its name, or '' if you already had it.
export function grant(id) {
  const r = REWARDS[id];
  if (!r || hasReward(id)) return '';
  save.earned.push(id);
  if (r.look) save.owned.push(`${r.look[0]}:${r.look[1]}`);
  persist();
  return r.name;
}

// Tavern work is rewarded at these counts of jobs done.
export const JOB_REWARDS = { 3: 'guildtrim', 6: 'copper', 10: 'diamonds', 15: 'crew', 20: 'royal' };
