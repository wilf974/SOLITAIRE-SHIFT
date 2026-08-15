// src/engine/traits.js
// Unlockable Traits. Each is a one-sentence rule change with a difficulty VALUE.
//  value < 0  → easier (lower rewards)
//  value = 0  → neutral / default
//  value > 0  → harder (higher rewards)
// A deal's total difficulty = sum of active trait values, clamped.
// Rewards scale with difficulty so easy modifiers cannot be farmed.

import { DEFAULT_RULES } from './game.js';

export const TRAITS = [
  {
    id: 'draw-three',
    name: 'Draw Three',
    desc: 'Draw three cards from the stock at a time.',
    value: 1,
    tier: 1,
    apply: (r) => ({ ...r, drawCount: 3 }),
  },
  {
    id: 'single-pass',
    name: 'Single Pass',
    desc: 'The stock may be cycled only once.',
    value: 2,
    tier: 2,
    apply: (r) => ({ ...r, maxStockPasses: 1 }),
  },
  {
    id: 'no-recycle',
    name: 'No Recycle',
    desc: 'Once the stock is empty, it stays empty.',
    value: 3,
    tier: 3,
    apply: (r) => ({ ...r, maxStockPasses: 0 }),
  },
  {
    id: 'free-empties',
    name: 'Free Empties',
    desc: 'Any card may start an empty tableau column.',
    value: -2,
    tier: 1,
    apply: (r) => ({ ...r, emptyColumnRule: 'any' }),
  },
  {
    id: 'locked-empties',
    name: 'Locked Empties',
    desc: 'Empty tableau columns can never be filled.',
    value: 4,
    tier: 3,
    apply: (r) => ({ ...r, emptyColumnRule: 'none' }),
  },
  {
    id: 'same-suit',
    name: 'Same Suit',
    desc: 'Tableau builds descend in the same suit.',
    value: 2,
    tier: 2,
    apply: (r) => ({ ...r, tableauOrder: 'desc-samecolor' }),
  },
  {
    id: 'any-color',
    name: 'Any Color',
    desc: 'Tableau builds descend regardless of color.',
    value: -2,
    tier: 1,
    apply: (r) => ({ ...r, tableauOrder: 'desc-anycolor' }),
  },
  {
    id: 'no-sequences',
    name: 'No Sequences',
    desc: 'Only single cards may be moved, never runs.',
    value: 2,
    tier: 2,
    apply: (r) => ({ ...r, moveSequences: false }),
  },
  {
    id: 'foundations-down',
    name: 'Foundations Down',
    desc: 'Foundations build King down to Ace.',
    value: 1,
    tier: 2,
    apply: (r) => ({ ...r, foundationStart: 'king', foundationDirection: 'desc' }),
  },
  {
    id: 'wrap-around',
    name: 'Wrap Around',
    desc: 'A King may be placed on an Ace on the tableau.',
    value: 1,
    tier: 2,
    apply: (r) => ({ ...r, tableauWrap: true }),
  },
  {
    id: 'reverse-tableau',
    name: 'Reverse Tableau',
    desc: 'Tableau builds ascend in alternating color.',
    value: 2,
    tier: 3,
    apply: (r) => ({ ...r, tableauOrder: 'asc-altcolor' }),
  },
  {
    id: 'no-undo',
    name: 'No Undo',
    desc: 'Undo is disabled for this deal.',
    value: 1,
    tier: 2,
    apply: (r) => ({ ...r, undoAllowed: false }),
  },
  {
    id: 'limited-undo',
    name: 'Limited Undo',
    desc: 'Only three undos per deal.',
    value: 1,
    tier: 1,
    apply: (r) => ({ ...r, maxUndos: 3 }),
  },
  {
    id: 'kings-only',
    name: 'Kings Only',
    desc: 'Only a King may start an empty tableau column.',
    value: 0,
    tier: 0,
    apply: (r) => ({ ...r, emptyColumnRule: 'king' }),
  },
];

const BY_ID = new Map(TRAITS.map((t) => [t.id, t]));

export function getTrait(id) {
  return BY_ID.get(id);
}

/** Compose a rules object from a list of active trait ids applied on top of defaults. */
export function composeRules(traitIds) {
  let rules = { ...DEFAULT_RULES };
  for (const id of traitIds || []) {
    const t = BY_ID.get(id);
    if (t) rules = t.apply(rules);
  }
  return rules;
}

/** Total difficulty value of an active trait set (clamped to [-6, 12]). */
export function difficultyValue(traitIds) {
  let v = 0;
  for (const id of traitIds || []) {
    const t = BY_ID.get(id);
    if (t) v += t.value;
  }
  return Math.max(-6, Math.min(12, v));
}

/** The reward multiplier for a deal given its active traits (1.0 baseline, scaled by difficulty). */
export function rewardMultiplier(traitIds) {
  const d = difficultyValue(traitIds);
  // harder → more; easier → less, but never below 0.4
  return Math.max(0.4, 1 + d * 0.12);
}

/** Traits available at a given mastery tier (and below). */
export function traitsAtTier(tier) {
  return TRAITS.filter((t) => t.tier <= tier).map((t) => t.id);
}