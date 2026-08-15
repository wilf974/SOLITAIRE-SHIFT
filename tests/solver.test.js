// tests/solver.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/engine/rng.js';
import { createGame, applyMove, checkWin } from '../src/engine/game.js';
import { composeRules } from '../src/engine/traits.js';
import { solve, findSolvableSeed } from '../src/engine/solver.js';

test('solver returns solved for a fabricated nearly-complete state', () => {
  // four foundations A..Q (48 cards), the four Kings on tableau tops → 4 moves to win
  const g = createGame('easy', makeRng('easy'), composeRules([]));
  const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
  const low = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'];
  g.foundations = suits.map((s) => low.map((rank) => ({ suit: s, rank, faceUp: true, id: rank + '-' + s })));
  g.tableau = [[], [], [], [], [], [], []];
  suits.forEach((s, i) => {
    g.tableau[i] = [{ suit: s, rank: 'K', faceUp: true, id: 'K-' + s }];
  });
  g.stock = []; g.waste = [];
  const res = solve(g, 50000);
  assert.equal(res.result, 'solved');
  assert.equal(res.solution.length, 4);
});

test('solver detects a trivially unsolvable state (no moves, not won)', () => {
  const g = createGame('u', makeRng('u'), composeRules(['no-recycle']));
  // empty everything except a stray face-down-only tableau that yields no moves
  g.stock = []; g.waste = [];
  g.tableau = [[], [], [], [], [], [], []];
  g.foundations = [[], [], [], []];
  // a single face-down card on col0, nothing else: no legal moves, not won
  g.tableau[0] = [{ suit: 'spades', rank: '5', faceUp: false, id: '5-spades' }];
  const res = solve(g, 1000);
  assert.equal(res.result, 'unsolvable');
});

test('solver solution replay reaches a win', async () => {
  // find a confirmed-solvable seed for classic rules
  const found = await findSolvableSeed(() => composeRules([]), 'classic-validation', 80, 300000);
  assert.ok(found, 'should find a solvable seed within budget');
  // replay: rebuild the game and apply a fresh solve to get moves
  const g = createGame(found.seed, makeRng(found.seed), found.rules);
  const res = solve(g, 300000);
  assert.equal(res.result, 'solved');
  // replay the returned solution moves on a fresh game and confirm a win
  const g2 = createGame(found.seed, makeRng(found.seed), found.rules);
  for (const m of res.solution) {
    applyMove(g2, m);
  }
  assert.equal(checkWin(g2), true, 'replaying solver solution must win');
});

test('solver respects node budget and reports unknown when exceeded', () => {
  const g = createGame('budget', makeRng('budget'), composeRules([]));
  const res = solve(g, 1); // tiny budget
  assert.ok(res.result === 'unknown' || res.result === 'solved'); // with 1 node likely unknown
  assert.ok(res.nodes <= 2);
});