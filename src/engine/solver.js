// src/engine/solver.js
// Bounded DFS solvability validator for Klondike deals.
// Returns 'solved' | 'unsolvable' | 'unknown' (budget exhausted).
// Used to guarantee fair deals for Daily / Contract / Journey / Ascension.
// Never fakes validation: 'unknown' deals are rejected and a new seed tried.

import { createGame, legalMoves, applyMove, checkWin } from './game.js';
import { makeRng } from './rng.js';

/** Lightweight clone for branching (no history, no score). */
function clone(state) {
  return {
    rules: state.rules,
    tableau: state.tableau.map((p) => p.map((c) => ({ ...c }))),
    stock: state.stock.map((c) => ({ ...c })),
    waste: state.waste.map((c) => ({ ...c })),
    foundations: state.foundations.map((p) => p.map((c) => ({ ...c }))),
    moves: 0,
    undosUsed: 0,
    stockPasses: state.stockPasses,
    score: 0,
    history: [],
    won: false,
    reserve: state.reserve ? { ...state.reserve } : null,
    // Tide is deliberately NOT simulated: a rising board has no fixed
    // solution, so Marée deals are not solver-validated (see modes.js).
    tideEvery: 0,
    tideCount: 0,
  };
}

/** Canonical key for transposition: ignores history/score/order within piles where irrelevant. */
function canonKey(state) {
  // foundations: suit piles, order fixed
  const f = state.foundations.map((p) => p.length).join(',');
  // tableau: cards as rank+suit+faceUp; order within column matters
  const t = state.tableau
    .map((p) => p.map((c) => (c.faceUp ? '+' : '-') + c.rank + c.suit[0]).join('.'))
    .join('|');
  // stock + waste: order matters for future draws; represent compactly
  const sw = state.stock.map((c) => c.rank + c.suit[0]).join('.') + '#' + state.waste.map((c) => c.rank + c.suit[0]).join('.');
  const rv = state.reserve ? state.reserve.rank + state.reserve.suit[0] : '';
  return `${f};${t};${sw};${rv}`;
}

/** Heuristic ordering: prefer foundation moves, then reveals, then draws last. */
function rankMove(state, m) {
  if (m.type === 'tab-to-foundation' || m.type === 'waste-to-foundation') return 0;
  if (m.type === 'tab-to-tab') {
    // moving onto a non-empty column that exposes a face-down card is valuable
    const src = state.tableau[m.from];
    const exposesDown = src.length - m.count - 1 >= 0 && !src[src.length - m.count - 1].faceUp;
    return exposesDown ? 1 : 2;
  }
  if (m.type === 'waste-to-tab') return 1;
  if (m.type === 'draw') return 3;
  if (m.type === 'recycle') return 4;
  return 5;
}

/**
 * Solve from a given state within a node budget. Iterative DFS with an explicit
 * stack so deep solutions don't blow the JS call stack.
 * Returns { result: 'solved'|'unsolvable'|'unknown', nodes, solution? }
 */
export function solve(state, nodeBudget = 200000) {
  const seen = new Set();
  let nodes = 0;

  if (checkWin(state)) return { result: 'solved', nodes: 0, solution: [] };

  seen.add(canonKey(state));
  // stack frames carry their own precomputed, sorted move list
  const startMoves = legalMoves(state).sort((a, b) => rankMove(state, a) - rankMove(state, b));
  const stack = [{ s: state, moves: startMoves, idx: 0, path: [] }];

  while (stack.length) {
    if (nodes >= nodeBudget) return { result: 'unknown', nodes, solution: null };
    const frame = stack[stack.length - 1];

    if (frame.idx >= frame.moves.length) {
      stack.pop(); // exhausted this branch
      continue;
    }

    const m = frame.moves[frame.idx++];
    const ns = clone(frame.s);
    applyMove(ns, m);
    nodes++;

    if (checkWin(ns)) {
      return { result: 'solved', nodes, solution: [...frame.path, m] };
    }

    const k = canonKey(ns);
    if (seen.has(k)) continue;
    seen.add(k);

    const childMoves = legalMoves(ns).sort((a, b) => rankMove(ns, a) - rankMove(ns, b));
    if (!childMoves.length) continue; // dead end, don't push
    stack.push({ s: ns, moves: childMoves, idx: 0, path: [...frame.path, m] });
  }

  // stack exhausted without a win and without hitting budget
  return { result: 'unsolvable', nodes, solution: null };
}

/** Validate a deal (seed + rules) is solvable, retrying seeds until found or maxTries hit. */
export async function findSolvableSeed(makeRules, baseSeedStr, maxTries = 60, nodeBudget = 200000) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const seed = `${baseSeedStr}::${attempt}`;
    const rng = makeRng(seed);
    const rules = makeRules();
    const g = createGame(seed, rng, rules);
    const res = solve(g, nodeBudget);
    if (res.result === 'solved') {
      return { seed, rules, nodes: res.nodes, attempt };
    }
    // 'unsolvable' or 'unknown' → try next seed (unknown also rejected; we want confirmed solvable)
  }
  return null;
}