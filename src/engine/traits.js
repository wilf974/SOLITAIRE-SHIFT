// src/engine/traits.js
// Unlockable traits. Each is a one-sentence rule change with a difficulty VALUE.
// Player-facing name/desc strings are French; the `id`s stay English because
// they are persisted in save files and must never change.
//  value < 0  → easier (lower rewards)
//  value = 0  → neutral / default
//  value > 0  → harder (higher rewards)
// A deal's total difficulty = sum of active trait values, clamped.
// Rewards scale with difficulty so easy modifiers cannot be farmed.

import { DEFAULT_RULES } from './game.js';

export const TRAITS = [
  {
    id: 'draw-three',
    name: 'Pioche par trois',
    desc: 'La pioche distribue trois cartes à la fois.',
    value: 1,
    tier: 1,
    apply: (r) => ({ ...r, drawCount: 3 }),
  },
  {
    id: 'single-pass',
    name: 'Passe unique',
    desc: "La pioche ne peut être recyclée qu'une seule fois.",
    value: 2,
    tier: 2,
    apply: (r) => ({ ...r, maxStockPasses: 1 }),
  },
  {
    id: 'no-recycle',
    name: 'Sans recyclage',
    desc: 'Une fois la pioche vide, elle le reste.',
    value: 3,
    tier: 3,
    apply: (r) => ({ ...r, maxStockPasses: 0 }),
  },
  {
    id: 'free-empties',
    name: 'Colonnes libres',
    desc: "N'importe quelle carte peut ouvrir une colonne vide.",
    value: -2,
    tier: 1,
    apply: (r) => ({ ...r, emptyColumnRule: 'any' }),
  },
  {
    id: 'locked-empties',
    name: 'Colonnes scellées',
    desc: 'Une colonne vide ne peut plus jamais être remplie.',
    value: 4,
    tier: 3,
    apply: (r) => ({ ...r, emptyColumnRule: 'none' }),
  },
  {
    id: 'same-suit',
    name: 'Même enseigne',
    desc: 'Cœur sur cœur, pique sur pique — la suite ne change jamais d’enseigne.',
    value: 4,
    tier: 3,
    apply: (r) => ({ ...r, tableauOrder: 'desc-samesuit' }),
  },
  {
    id: 'same-color',
    name: 'Même teinte',
    desc: 'Rouge sur rouge, noir sur noir.',
    value: 2,
    tier: 2,
    apply: (r) => ({ ...r, tableauOrder: 'desc-samecolor' }),
  },
  {
    id: 'alt-suit',
    name: 'Enseigne changeante',
    desc: 'Chaque carte doit poser sur une enseigne différente de la sienne.',
    value: 1,
    tier: 2,
    apply: (r) => ({ ...r, tableauOrder: 'desc-altsuit' }),
  },
  {
    id: 'any-color',
    name: 'Couleur libre',
    desc: 'Les suites du tableau descendent sans règle de couleur.',
    value: -2,
    tier: 1,
    apply: (r) => ({ ...r, tableauOrder: 'desc-anycolor' }),
  },
  {
    id: 'no-sequences',
    name: 'Cartes seules',
    desc: 'Seules les cartes isolées se déplacent, jamais les suites.',
    value: 2,
    tier: 2,
    apply: (r) => ({ ...r, moveSequences: false }),
  },
  {
    id: 'foundations-down',
    name: 'Monde inversé',
    desc: "Fondations du Roi vers l'As, tableau ascendant, l'As ouvre les colonnes.",
    value: 2,
    tier: 3,
    // A fully mirrored game. All three parts must flip together:
    //   * foundations run K→A,
    //   * so the tableau must run ASCENDING, otherwise every card is buried
    //     under the one that had to leave before it and no deal is winnable,
    //   * and empty columns open on an Ace, because Kings now belong on the
    //     foundations and a King can receive nothing in an ascending tableau.
    apply: (r) => ({
      ...r,
      foundationStart: 'king',
      foundationDirection: 'desc',
      tableauOrder: 'asc-altcolor',
      emptyColumnRule: 'ace',
    }),
  },
  {
    id: 'wrap-around',
    name: 'Boucle',
    desc: 'Un Roi peut se poser sur un As dans le tableau.',
    value: 1,
    tier: 2,
    apply: (r) => ({ ...r, tableauWrap: true }),
  },
  {
    id: 'reverse-tableau',
    name: 'Tableau ascendant',
    desc: 'Les suites montent en alternant les couleurs ; le Roi ouvre les colonnes.',
    value: 2,
    tier: 3,
    // An ascending tableau needs DESCENDING foundations to stay winnable:
    // cards must leave the tableau in the reverse of the order they were
    // stacked, so foundations run K→A. Empty columns keep the King, which is
    // the natural bottom of an ascending run.
    apply: (r) => ({
      ...r,
      tableauOrder: 'asc-altcolor',
      foundationStart: 'king',
      foundationDirection: 'desc',
      emptyColumnRule: 'king',
    }),
  },
  {
    id: 'no-undo',
    name: 'Sans retour',
    desc: "L'annulation est désactivée pour cette donne.",
    value: 1,
    tier: 2,
    apply: (r) => ({ ...r, undoAllowed: false }),
  },
  {
    id: 'limited-undo',
    name: 'Retours comptés',
    desc: 'Seulement trois annulations par donne.',
    value: 1,
    tier: 1,
    apply: (r) => ({ ...r, maxUndos: 3 }),
  },
  {
    id: 'kings-only',
    name: 'Rois seulement',
    desc: 'Seul un Roi peut ouvrir une colonne vide.',
    value: 0,
    tier: 0,
    apply: (r) => ({ ...r, emptyColumnRule: 'king' }),
  },
  {
    id: 'draw-five',
    name: 'Pioche par cinq',
    desc: 'La pioche distribue cinq cartes à la fois.',
    value: 3,
    tier: 4,
    apply: (r) => ({ ...r, drawCount: 5 }),
  },
  {
    id: 'two-passes',
    name: 'Deux passes',
    desc: 'La pioche ne peut être recyclée que deux fois.',
    value: 1,
    tier: 2,
    apply: (r) => ({ ...r, maxStockPasses: 2 }),
  },
  // NOTE: a 'blind-flip' trait (revealFlipped:false) was tried and removed.
  // Without auto-flip a buried card can never be turned over, so no deal is
  // winnable — the solver found zero solvable seeds in 160 attempts. It is not
  // a difficulty setting, it is an unwinnable game.
  {
    id: 'no-powers',
    name: 'Mains nues',
    desc: 'Aucun pouvoir ne peut être utilisé pendant cette donne.',
    value: 2,
    tier: 3,
    apply: (r) => ({ ...r, powersAllowed: false }),
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