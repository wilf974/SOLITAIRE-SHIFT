// src/meta/rewards.js — what beating a boss actually gives you.
//
// Coins alone are a number going up. A reward you can *see* on the table is
// what makes the next boss worth fighting, so every victory hands over a
// cosmetic: a card back, a table felt, or a card-face trim.
//
// Rules kept deliberately strict:
//   * Rewards are cosmetic ONLY. Nothing here changes a rule, a probability
//     or a difficulty — a decorated deck must never beat a plain one.
//   * Everything is earned by playing. Nothing is purchasable.
//   * `id`s are persisted in save files and must never change.

/** Card backs, unlocked by beating specific bosses. */
export const REWARD_BACKS = [
  { id: 'sunburst-pop',     name: 'Soleil pop',        from: null,          art: 'back-sunburst-pop' },
  { id: 'bubblegum-nebula', name: 'Nébuleuse bonbon',  from: 'illusionniste', art: 'back-bubblegum-nebula' },
  { id: 'mint-crest',       name: 'Blason menthe',     from: 'jumelles',    art: 'back-mint-crest' },
  { id: 'stone-seal',       name: 'Sceau de pierre',   from: 'gardien',     art: 'back-stone-seal' },
  { id: 'clockwork',        name: 'Rouages',           from: 'horloger',    art: 'back-clockwork' },
  { id: 'raven-feather',    name: 'Plume de corbeau',  from: 'corbeau',     art: 'back-raven-feather' },
  { id: 'royal-velvet',     name: 'Velours royal',     from: 'souveraine',  art: 'back-royal-velvet' },
  { id: 'tide-glass',       name: 'Verre de marée',    from: 'sirene',      art: 'back-tide-glass' },
  { id: 'star-chart',       name: 'Carte du ciel',     from: 'astrologue',  art: 'back-star-chart' },
  { id: 'ember-forge',      name: 'Braise de forge',   from: 'forgeron',    art: 'back-ember-forge' },
  { id: 'mirror-shard',     name: 'Éclat de miroir',   from: 'jumeau',      art: 'back-mirror-shard' },
  { id: 'house-gold',       name: 'Or de la maison',   from: 'croupier',    art: 'back-house-gold' },
];

/** Table felts. Purely the surface the cards sit on. */
export const REWARD_TABLES = [
  { id: 'sunlit',    name: 'Plein soleil',     from: null,             art: 'table-sunlit-felt' },
  { id: 'workshop',  name: "Atelier",          from: 'apprenti',       art: 'table-workshop' },
  { id: 'anvil',     name: 'Enclume',          from: 'ferrailleur',    art: 'table-anvil' },
  { id: 'laboratory', name: 'Laboratoire',     from: 'alchimiste',     art: 'table-laboratory' },
  { id: 'theatre',   name: 'Théâtre',          from: 'marionnettiste', art: 'table-theatre' },
  { id: 'harvest',   name: 'Moisson',          from: 'faucheur',       art: 'table-harvest' },
  { id: 'library',   name: 'Bibliothèque',     from: 'archiviste',     art: 'table-library' },
  { id: 'sanctum',   name: 'Sanctuaire',       from: 'oracle',         art: 'table-sanctum' },
];

/** Card-face trims: the border and index styling on the cards themselves. */
export const REWARD_TRIMS = [
  { id: 'plain',   name: 'Classique',   from: null },
  { id: 'gilded',  name: 'Doré',        from: 'gardienne' },
  { id: 'iron',    name: 'Fer',         from: 'colosse' },
];

const ALL = [
  ...REWARD_BACKS.map((r) => ({ ...r, kind: 'back' })),
  ...REWARD_TABLES.map((r) => ({ ...r, kind: 'table' })),
  ...REWARD_TRIMS.map((r) => ({ ...r, kind: 'trim' })),
];

/** What a given boss hands over, or null if it only pays coins. */
export function rewardForBoss(bossId) {
  return ALL.find((r) => r.from === bossId) || null;
}

/** Everything unlocked from the start. */
export function defaultUnlocked() {
  return {
    backs: REWARD_BACKS.filter((r) => !r.from).map((r) => r.id),
    tables: REWARD_TABLES.filter((r) => !r.from).map((r) => r.id),
    trims: REWARD_TRIMS.filter((r) => !r.from).map((r) => r.id),
  };
}

/** Fresh reward state for a profile. */
export function defaultRewards() {
  const u = defaultUnlocked();
  return {
    ...u,
    activeBack: 'sunburst-pop',
    activeTable: 'sunlit',
    activeTrim: 'plain',
  };
}

const BUCKET = { back: 'backs', table: 'tables', trim: 'trims' };

/** Grant a reward. Returns true if it was newly unlocked. */
export function grant(rewards, reward) {
  if (!reward) return false;
  const bucket = BUCKET[reward.kind];
  if (!bucket) return false;
  if (!Array.isArray(rewards[bucket])) rewards[bucket] = [];
  if (rewards[bucket].includes(reward.id)) return false;
  rewards[bucket].push(reward.id);
  return true;
}

export function isUnlocked(rewards, kind, id) {
  const bucket = BUCKET[kind];
  return !!(bucket && Array.isArray(rewards[bucket]) && rewards[bucket].includes(id));
}

/** Every reward of a kind, flagged with whether it is owned. */
export function catalogue(rewards, kind) {
  const list = kind === 'back' ? REWARD_BACKS : kind === 'table' ? REWARD_TABLES : REWARD_TRIMS;
  return list.map((r) => ({ ...r, kind, unlocked: isUnlocked(rewards, kind, r.id) }));
}

/** How many rewards are owned out of the total. */
export function progress(rewards) {
  const owned = ['backs', 'tables', 'trims']
    .reduce((n, b) => n + ((rewards[b] || []).length), 0);
  return { owned, total: ALL.length };
}
