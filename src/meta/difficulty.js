// src/meta/difficulty.js — the player-facing difficulty ladder.
//
// A difficulty is just a named bundle of traits plus a reward multiplier, so it
// reuses the same rule engine the Traits system already validates. Picking a
// harder level never grants abilities — it only changes the rules of the deal.
//
// `id`s are persisted in save files and must never change.
// `icon` names generated art; `emoji` remains the fallback.

export const DIFFICULTIES = [
  {
    id: 'gentle',
    icon: 'diff-gentle',
    name: 'Tranquille',
    emoji: '🌱',
    desc: "N'importe quelle carte ouvre une colonne vide. Pour apprendre.",
    traits: ['free-empties'],
    reward: 0.7,
  },
  {
    id: 'standard',
    icon: 'diff-standard',
    name: 'Classique',
    emoji: '♠️',
    desc: 'Le Klondike de toujours : rouge sur noir, noir sur rouge.',
    traits: [],
    reward: 1,
  },
  {
    id: 'sharp',
    icon: 'diff-sharp',
    name: 'Corsé',
    emoji: '🔥',
    desc: 'Pioche par trois et deux recyclages seulement.',
    traits: ['draw-three', 'two-passes'],
    reward: 1.4,
  },
  {
    id: 'suited',
    icon: 'diff-suited',
    name: 'Même enseigne',
    emoji: '❤️',
    desc: 'Cœur sur cœur, pique sur pique. Le vrai test de patience.',
    traits: ['same-suit'],
    reward: 1.9,
  },
  {
    // Deliberately NOT the sum of every hard trait. Stacking same-suit with
    // locked-empties makes winnable deals so rare that the solver cannot find
    // one in a sane budget, and shipping unvalidated "fair" deals is worse
    // than shipping a slightly gentler top rung.
    id: 'brutal',
    icon: 'diff-brutal',
    name: 'Impitoyable',
    emoji: '💀',
    desc: 'Même enseigne, pioche par trois, sans annuler.',
    traits: ['same-suit', 'draw-three', 'no-undo'],
    reward: 2.8,
  },
];

const BY_ID = new Map(DIFFICULTIES.map((d) => [d.id, d]));

export function getDifficulty(id) {
  return BY_ID.get(id) || BY_ID.get('standard');
}

/** Traits contributed by a difficulty level. */
export function difficultyTraits(id) {
  return [...getDifficulty(id).traits];
}

/** Reward multiplier for a difficulty level. */
export function difficultyReward(id) {
  return getDifficulty(id).reward;
}

/** Which modes let the player choose a difficulty? */
export const DIFFICULTY_MODES = new Set(['classic', 'zen', 'timed', 'tide', 'daily']);

export function supportsDifficulty(mode) {
  return DIFFICULTY_MODES.has(mode);
}