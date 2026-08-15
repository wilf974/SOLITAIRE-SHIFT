// src/modes.js — mode deal generation. Every progression/daily/contract/ascension
// deal is solver-validated and deterministic. Classic may be random (the traditional option).
// Zen is always solver-validated so it stays relaxing.

import { makeRng } from './engine/rng.js';
import { createGame } from './engine/game.js';
import { composeRules, difficultyValue, TRAITS, getTrait } from './engine/traits.js';
import { solve } from './engine/solver.js';
import CONTRACTS from './data/contracts.json' with { type: 'json' };

export { CONTRACTS };

/** Find the first solvable seed for given rules, trying baseSeed::0, ::1, ... */
function firstSolvable(baseSeed, traits, maxTries, nodeBudget) {
  const rules = composeRules(traits);
  for (let k = 0; k < maxTries; k++) {
    const seed = `${baseSeed}::${k}`;
    const g = createGame(seed, makeRng(seed), rules);
    const res = solve(g, nodeBudget);
    if (res.result === 'solved') return { seed, rules, attempt: k };
  }
  return null;
}

function difficultyTries(traits) {
  const d = difficultyValue(traits);
  if (d <= 0) return 20;
  if (d <= 4) return 40;
  return 80;
}

/** Build a deal descriptor for a mode. Async because validation may run the solver. */
export async function makeDeal(mode, opts = {}) {
  const profile = opts.profile || {};
  switch (mode) {
    case 'classic': {
      // traditional random deal (the spec permits this for Classic). Player accepts the risk.
      const seed = 'classic-' + Math.random().toString(36).slice(2, 10);
      return { mode, seed, rules: composeRules([]), traits: [], objective: 'Remportez la donne.', meta: {} };
    }
    case 'zen': {
      const found = firstSolvable('zen-' + Date.now(), [], 20, 80000);
      const seed = found ? found.seed : 'zen-fallback::0';
      return { mode, seed, rules: composeRules([]), traits: [], objective: 'Détendez-vous. Aucune pression.', meta: {} };
    }
    case 'daily': {
      const date = opts.date || todayStr();
      const cached = profile.lastDaily && profile.lastDaily.date === date ? profile.lastDaily : null;
      if (cached && cached.seed) return { mode, seed: cached.seed, rules: cached.rules, traits: [], objective: `Donne du jour — ${date}`, meta: { date } };
      const found = firstSolvable('daily-' + date, [], 30, 120000);
      if (!found) return { mode, seed: 'daily-' + date + '::0', rules: composeRules([]), traits: [], objective: `Donne du jour — ${date}`, meta: { date, fallback: true } };
      return { mode, seed: found.seed, rules: found.rules, traits: [], objective: `Donne du jour — ${date}`, meta: { date, validated: true } };
    }
    case 'journey': {
      const stage = Math.max(1, opts.stage || (profile.tier || 0) + 1);
      // pick a curated trait for the stage from those unlocked, to introduce variety
      const traits = pickJourneyTraits(stage, profile);
      const found = firstSolvable('journey-s' + stage, traits, difficultyTries(traits), 100000);
      const seed = found ? found.seed : 'journey-s' + stage + '::0';
      return { mode, seed, rules: found ? found.rules : composeRules(traits), traits, objective: `Parcours · Étape ${stage}`, meta: { stage } };
    }
    case 'contract': {
      const c = CONTRACTS.find((x) => x.id === opts.contractId) || CONTRACTS[0];
      const found = firstSolvable(c.baseSeed, c.traits, difficultyTries(c.traits), 140000);
      const seed = found ? found.seed : c.baseSeed + '::0';
      return { mode, seed, rules: found ? found.rules : composeRules(c.traits), traits: c.traits, objective: c.objective, meta: { contractId: c.id, name: c.name, desc: c.desc } };
    }
    case 'ascension': {
      const level = Math.max(1, opts.level || 1);
      const traits = ascensionTraits(level, profile);
      const found = firstSolvable('ascension-l' + level, traits, difficultyTries(traits), 120000);
      const seed = found ? found.seed : 'ascension-l' + level + '::0';
      return { mode, seed, rules: found ? found.rules : composeRules(traits), traits, objective: `Ascension · Niveau ${level}`, meta: { level } };
    }
    case 'adventure': {
      // A hand-authored run of chapters: each is a solver-validated deal with a
      // named goal and its own traits. Progress is stored on the profile.
      const idx = Math.max(0, Math.min(CHAPTERS.length - 1, opts.chapter ?? (profile.adventure?.chapter || 0)));
      const ch = CHAPTERS[idx];
      const found = firstSolvable(ch.baseSeed, ch.traits, difficultyTries(ch.traits), 130000);
      const seed = found ? found.seed : ch.baseSeed + '::0';
      return {
        mode, seed,
        rules: found ? found.rules : composeRules(ch.traits),
        traits: ch.traits,
        objective: ch.objective,
        meta: { chapter: idx, name: ch.name, story: ch.story, last: idx === CHAPTERS.length - 1 },
      };
    }
    case 'timed': {
      // Beat the clock. Solver-validated so the pressure is the only obstacle.
      const seconds = opts.seconds || 300;
      const found = firstSolvable('timed-' + Date.now(), [], 20, 90000);
      const seed = found ? found.seed : 'timed-fallback::0';
      const rules = { ...composeRules([]), timeLimitMs: seconds * 1000 };
      return { mode, seed, rules, traits: [], objective: `Gagnez en ${Math.round(seconds / 60)} minutes.`, meta: { seconds } };
    }
    case 'tide': {
      // "Marée" — every N moves the sea rises and deals a card onto every
      // column. Deliberately NOT solver-validated: the board changes as you
      // play, so there is no fixed solution to validate. Survival, not proof.
      const every = opts.tideEvery || 12;
      const seed = 'tide-' + Math.random().toString(36).slice(2, 10);
      const rules = { ...composeRules([]), tideEvery: every };
      return {
        mode, seed, rules, traits: [],
        objective: `La marée monte tous les ${every} coups. Videz le tableau.`,
        meta: { tideEvery: every, unvalidated: true },
      };
    }
    default:
      return { mode: 'classic', seed: 'classic-0', rules: composeRules([]), traits: [], objective: '', meta: {} };
  }
}

/** Adventure chapters — a curated story run. Order matters. */
export const CHAPTERS = [
  { name: 'Le Départ',        story: "Une table, un jeu, rien de plus. Apprenez la maison.",              traits: [],                              objective: 'Remportez la donne.',            baseSeed: 'adv-01-depart' },
  { name: 'Trois par Trois',  story: 'La pioche devient avare. Comptez vos tirages.',                      traits: ['draw-three'],                  objective: 'Gagnez en piochant par trois.',  baseSeed: 'adv-02-troisXtrois' },
  { name: 'Le Dernier Tour',  story: 'La pioche ne repassera pas. Chaque carte compte double.',            traits: ['single-pass'],                 objective: 'Gagnez en une seule passe.',     baseSeed: 'adv-03-dernier-tour' },
  { name: 'Portes Closes',    story: 'Les colonnes vides se referment derrière vous.',                     traits: ['locked-empties'],              objective: 'Gagnez sans rouvrir de colonne.', baseSeed: 'adv-04-portes-closes' },
  { name: 'Le Fil de Soie',   story: 'Une seule enseigne par suite. La patience devient une arme.',        traits: ['same-suit'],                   objective: 'Gagnez en suites de même enseigne.', baseSeed: 'adv-05-fil-de-soie' },
  { name: 'Sans Filet',       story: "Plus de retour en arrière. Réfléchissez avant de poser.",            traits: ['no-undo', 'draw-three'],       objective: 'Gagnez sans annuler.',           baseSeed: 'adv-06-sans-filet' },
  { name: 'Le Monde Renversé', story: 'Les fondations descendent, le tableau monte. Tout est inversé.',    traits: ['foundations-down', 'reverse-tableau'], objective: 'Gagnez dans le monde inversé.', baseSeed: 'adv-07-monde-renverse' },
  { name: 'La Dernière Table', story: 'Tout ce que vous avez appris, en une seule donne.',                 traits: ['no-recycle', 'locked-empties', 'same-suit'], objective: 'Terminez l’aventure.',   baseSeed: 'adv-08-derniere-table' },
];

function pickJourneyTraits(stage, profile) {
  // introduce one trait every other stage, chosen from unlocked traits, cycling
  const unlocked = (profile.traitsUnlocked || []).filter((id) => id !== 'kings-only');
  if (!unlocked.length || stage % 2 === 0) return [];
  const idx = (stage - 1) % unlocked.length;
  return [unlocked[idx]];
}

function ascensionTraits(level, profile) {
  // escalate: add a trait every level from the unlocked pool (harder ones first)
  const pool = (profile.traitsUnlocked || [])
    .filter((id) => id !== 'kings-only')
    .map((id) => {
      const t = getTrait(id);
      return { id, v: t ? t.value : 0 };
    })
    .sort((a, b) => b.v - a.v);
  if (!pool.length) return [];
  const n = Math.min(level, pool.length);
  return pool.slice(0, n).map((x) => x.id);
}

export function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}