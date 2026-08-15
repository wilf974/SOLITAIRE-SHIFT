// tests/serialize.test.js — serialize/deserialize round-trip integrity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine/game.js';
import { makeRng } from '../src/engine/rng.js';
import { applyMove, legalMoves, checkWin, top } from '../src/engine/game.js';
import { serialize, deserialize } from '../src/engine/serialize.js';
import { composeRules } from '../src/engine/traits.js';

function sampleState() {
  const seed = 'serialize-test::0';
  const g = createGame(seed, makeRng(seed), composeRules([]));
  // make a few moves so history + waste populate
  for (let i = 0; i < 5; i++) {
    const moves = legalMoves(g);
    if (!moves.length) break;
    applyMove(g, moves[0]);
  }
  return g;
}

test('serialize then deserialize reproduces all piles', () => {
  const g = sampleState();
  const snap = serialize(g);
  const g2 = deserialize(snap);
  assert.equal(g2.tableau.length, 7);
  for (let c = 0; c < 7; c++) {
    assert.equal(g2.tableau[c].length, g.tableau[c].length, `col ${c} length`);
    for (let i = 0; i < g.tableau[c].length; i++) {
      assert.equal(g2.tableau[c][i].id, g.tableau[c][i].id);
      assert.equal(g2.tableau[c][i].faceUp, g.tableau[c][i].faceUp);
    }
  }
  assert.equal(g2.stock.length, g.stock.length);
  assert.equal(g2.waste.length, g.waste.length);
  assert.equal(g2.foundations.length, 4);
});

test('deserialized state plays identically (same legal moves)', () => {
  const g = sampleState();
  const snap = serialize(g);
  const g2 = deserialize(snap);
  const m1 = legalMoves(g).map(m => JSON.stringify(m)).sort();
  const m2 = legalMoves(g2).map(m => JSON.stringify(m)).sort();
  assert.deepEqual(m1, m2);
});

test('deserialized state accepts the same next move and stays in sync', () => {
  const g = sampleState();
  const moves = legalMoves(g);
  assert.ok(moves.length, 'expected legal moves');
  const m = moves[0];
  const g2 = deserialize(serialize(g));
  const ok1 = applyMove(g, m);
  const ok2 = applyMove(g2, m);
  assert.equal(ok1, ok2);
  assert.equal(checkWin(g), checkWin(g2));
  assert.equal(g.moves, g2.moves);
});

test('serialize is JSON-serializable (survives a string round-trip)', () => {
  const g = sampleState();
  const snap = serialize(g);
  const json = JSON.stringify(snap);
  const back = deserialize(JSON.parse(json));
  assert.equal(back.tableau[0][0].id, g.tableau[0][0].id);
});

test('deserialize preserves rules (drawCount etc.)', () => {
  const seed = 'ser-rules::0';
  const rules = composeRules(['draw-three']);
  const g = createGame(seed, makeRng(seed), rules);
  const back = deserialize(serialize(g));
  assert.equal(back.rules.drawCount, 3);
  assert.equal(back.rules.maxStockPasses, g.rules.maxStockPasses);
});