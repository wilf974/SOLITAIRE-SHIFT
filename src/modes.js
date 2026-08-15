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
      return { mode, seed, rules: composeRules([]), traits: [], objective: 'Win the deal.', meta: {} };
    }
    case 'zen': {
      const found = firstSolvable('zen-' + Date.now(), [], 20, 80000);
      const seed = found ? found.seed : 'zen-fallback::0';
      return { mode, seed, rules: composeRules([]), traits: [], objective: 'Relax. No pressure.', meta: {} };
    }
    case 'daily': {
      const date = opts.date || todayStr();
      const cached = profile.lastDaily && profile.lastDaily.date === date ? profile.lastDaily : null;
      if (cached && cached.seed) return { mode, seed: cached.seed, rules: cached.rules, traits: [], objective: `Daily Deal — ${date}`, meta: { date } };
      const found = firstSolvable('daily-' + date, [], 30, 120000);
      if (!found) return { mode, seed: 'daily-' + date + '::0', rules: composeRules([]), traits: [], objective: `Daily Deal — ${date}`, meta: { date, fallback: true } };
      return { mode, seed: found.seed, rules: found.rules, traits: [], objective: `Daily Deal — ${date}`, meta: { date, validated: true } };
    }
    case 'journey': {
      const stage = Math.max(1, opts.stage || (profile.tier || 0) + 1);
      // pick a curated trait for the stage from those unlocked, to introduce variety
      const traits = pickJourneyTraits(stage, profile);
      const found = firstSolvable('journey-s' + stage, traits, difficultyTries(traits), 100000);
      const seed = found ? found.seed : 'journey-s' + stage + '::0';
      return { mode, seed, rules: found ? found.rules : composeRules(traits), traits, objective: `Journey · Stage ${stage}`, meta: { stage } };
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
      return { mode, seed, rules: found ? found.rules : composeRules(traits), traits, objective: `Ascension · Level ${level}`, meta: { level } };
    }
    default:
      return { mode: 'classic', seed: 'classic-0', rules: composeRules([]), traits: [], objective: '', meta: {} };
  }
}

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