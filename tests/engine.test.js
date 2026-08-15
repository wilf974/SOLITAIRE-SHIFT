// tests/engine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/engine/rng.js';
import { freshDeck, rankValue, SUITS, RANKS } from '../src/engine/deck.js';
import {
  createGame,
  legalMoves,
  applyMove,
  undo,
  checkWin,
  isStuck,
  remaining,
  DEFAULT_RULES,
  tableauFits,
  foundationFits,
  canStartEmptyColumn,
  top,
} from '../src/engine/game.js';

function newGame(seed, rules) {
  return createGame(seed, makeRng(seed), rules);
}

test('deck has 52 unique cards', () => {
  const d = freshDeck();
  assert.equal(d.length, 52);
  const ids = new Set(d.map((c) => c.id));
  assert.equal(ids.size, 52);
});

test('rng is deterministic for a given seed', () => {
  const a = makeRng('daily-1');
  const b = makeRng('daily-1');
  const seq = (r) => Array.from({ length: 10 }, () => r.next());
  assert.deepEqual(seq(a), seq(b));
});

test('different seeds give different shuffles', () => {
  const g1 = newGame('seed-A');
  const g2 = newGame('seed-B');
  const t1 = g1.tableau.map((p) => p.map((c) => c.id).join(','));
  const t2 = g2.tableau.map((p) => p.map((c) => c.id).join(','));
  assert.notDeepEqual(t1, t2);
});

test('same seed gives identical deal', () => {
  const g1 = newGame('seed-X');
  const g2 = newGame('seed-X');
  assert.deepEqual(g1.tableau, g2.tableau);
  assert.deepEqual(g1.stock, g2.stock);
});

test('initial deal: 7 columns, column i has i+1 cards, top face-up', () => {
  const g = newGame('init');
  assert.equal(g.tableau.length, 7);
  for (let i = 0; i < 7; i++) {
    assert.equal(g.tableau[i].length, i + 1);
    assert.equal(top(g.tableau[i]).faceUp, true);
    for (let k = 0; k < i; k++) assert.equal(g.tableau[i][k].faceUp, false);
  }
  assert.equal(g.stock.length, 24);
  assert.equal(g.waste.length, 0);
  assert.equal(g.foundations.length, 4);
});

test('52 cards conserved across the whole deal', () => {
  const g = newGame('cons');
  const total = remaining(g);
  assert.equal(total, 52);
  assert.equal(g.foundations.reduce((s, f) => s + f.length, 0), 0);
});

test('draw moves drawCount cards from stock to waste, face up', () => {
  const g = newGame('draw1');
  applyMove(g, { type: 'draw' });
  assert.equal(g.waste.length, 1);
  assert.equal(g.waste[0].faceUp, true);
  assert.equal(g.stock.length, 23);
});

test('draw-3 moves three cards when available', () => {
  const g = newGame('draw3', { drawCount: 3 });
  applyMove(g, { type: 'draw' });
  assert.equal(g.waste.length, 3);
  assert.equal(g.stock.length, 21);
});

test('recycle: empty stock refills from waste, increments passes, respects maxStockPasses', () => {
  const g = newGame('recyc', { drawCount: 1 });
  while (g.stock.length) applyMove(g, { type: 'draw' });
  assert.equal(g.stock.length, 0);
  assert.equal(g.waste.length, 24);
  applyMove(g, { type: 'recycle' });
  assert.equal(g.stock.length, 24);
  assert.equal(g.waste.length, 0);
  assert.equal(g.stockPasses, 1);
});

test('maxStockPasses blocks further recycle', () => {
  const g = newGame('recyc2', { drawCount: 1, maxStockPasses: 1 });
  while (g.stock.length) applyMove(g, { type: 'draw' });
  applyMove(g, { type: 'recycle' });
  while (g.stock.length) applyMove(g, { type: 'draw' });
  const moves = legalMoves(g).filter((m) => m.type === 'recycle');
  assert.equal(moves.length, 0); // capped at 1 pass
});

test('tableau alt-color desc build rule enforced', () => {
  const r = { ...DEFAULT_RULES };
  // 6 of spades (black) on 7 of hearts (red) — legal
  assert.equal(tableauFits(r, { suit: 'spades', rank: '6' }, { suit: 'hearts', rank: '7' }), true);
  // 6 of hearts on 7 of hearts — same color, illegal
  assert.equal(tableauFits(r, { suit: 'hearts', rank: '6' }, { suit: 'hearts', rank: '7' }), false);
  // 5 of clubs on 7 of hearts — wrong rank
  assert.equal(tableauFits(r, { suit: 'clubs', rank: '5' }, { suit: 'hearts', rank: '7' }), false);
});

test('empty column: only king by default', () => {
  assert.equal(canStartEmptyColumn(DEFAULT_RULES, { rank: 'K' }), true);
  assert.equal(canStartEmptyColumn(DEFAULT_RULES, { rank: 'A' }), false);
  assert.equal(canStartEmptyColumn({ emptyColumnRule: 'any' }, { rank: 'A' }), true);
  assert.equal(canStartEmptyColumn({ emptyColumnRule: 'none' }, { rank: 'K' }), false);
});

test('foundation: ace first, then ascending by suit', () => {
  const r = DEFAULT_RULES;
  assert.equal(foundationFits(r, { suit: 'spades', rank: 'A' }, []), true);
  assert.equal(foundationFits(r, { suit: 'spades', rank: '2' }, []), false);
  const f = [{ suit: 'spades', rank: 'A' }];
  assert.equal(foundationFits(r, { suit: 'spades', rank: '2' }, f), true);
  assert.equal(foundationFits(r, { suit: 'spades', rank: '3' }, f), false);
  assert.equal(foundationFits(r, { suit: 'hearts', rank: '2' }, [{ suit: 'spades', rank: 'A' }]), false);
});

test('undo restores prior state', () => {
  const g = newGame('undo');
  const before = JSON.stringify(g.tableau) + g.stock.length + g.waste.length;
  applyMove(g, { type: 'draw' });
  assert.ok(undo(g));
  const after = JSON.stringify(g.tableau) + g.stock.length + g.waste.length;
  assert.equal(after, before);
});

test('undo disabled when not allowed', () => {
  const g = newGame('noundo', { undoAllowed: false });
  applyMove(g, { type: 'draw' });
  assert.equal(undo(g), false);
});

test('undo respects maxUndos', () => {
  const g = newGame('maxundo', { maxUndos: 1 });
  applyMove(g, { type: 'draw' });
  applyMove(g, { type: 'draw' });
  assert.equal(undo(g), true); // 1 undo used
  assert.equal(undo(g), false); // capped
});

test('legalMoves never proposes illegal placements', () => {
  const g = newGame('legal');
  for (let i = 0; i < 50; i++) {
    const moves = legalMoves(g);
    assert.ok(Array.isArray(moves));
    // apply a random legal move; applyMove should accept it
    if (!moves.length) break;
    const m = moves[0];
    assert.equal(applyMove(g, m), true);
  }
});

test('checkWin true only when all foundations complete', () => {
  const g = newGame('win');
  assert.equal(checkWin(g), false);
  // fabricate a complete state
  for (const f of g.foundations) {
    for (const rank of RANKS) {
      f.push({ suit: 'spades', rank, faceUp: true, id: `${rank}-spades` });
    }
  }
  assert.equal(checkWin(g), true);
});

test('applyMove rejects unknown move types', () => {
  const g = newGame('bad');
  assert.equal(applyMove(g, { type: 'nope' }), false);
});

test('sequence move preserves run order on destination', () => {
  // construct a tableau where a 2-card run can move
  const g = newGame('seq');
  // force a known tableau: col0 = [faceDown, 9♠(up), 8♥(up)], col1 = empty won't accept 9
  // we just verify that tab-to-tab with count keeps card order
  g.tableau[0] = [
    { suit: 'spades', rank: '9', faceUp: true, id: '9-spades' },
    { suit: 'hearts', rank: '8', faceUp: true, id: '8-hearts' },
  ];
  g.tableau[1] = [{ suit: 'clubs', rank: '9', faceUp: true, id: '9-clubs' }];
  // 8♥ on 9♣ legal; moving the run 9♠? no — 9♠ onto 9♣ illegal. Only single 8♥ fits.
  const moves = legalMoves(g).filter((m) => m.type === 'tab-to-tab' && m.from === 0);
  // single 8♥ -> col1 (9♣) is legal; run of 2 needs 9♠ on something
  assert.ok(moves.some((m) => m.count === 1 && m.to === 1));
  // build a valid run move: col0 top run [7♥,6♠], dest [8♣] (alt-color, desc)
  g.tableau[0] = [
    { suit: 'hearts', rank: '7', faceUp: true, id: '7-hearts' },
    { suit: 'spades', rank: '6', faceUp: true, id: '6-spades' },
  ];
  g.tableau[1] = [{ suit: 'clubs', rank: '8', faceUp: true, id: '8-clubs' }];
  const runMoves = legalMoves(g).filter((m) => m.type === 'tab-to-tab' && m.from === 0 && m.to === 1);
  assert.ok(runMoves.some((m) => m.count === 2), 'run of two can move onto 8♣');
  applyMove(g, runMoves.find((m) => m.count === 2));
  assert.equal(g.tableau[1].length, 3);
  assert.equal(g.tableau[1][1].rank, '7');
  assert.equal(g.tableau[1][2].rank, '6'); // order preserved
});

test('isStuck: a fresh game is never stuck (stock has cards)', () => {
  const g = newGame('stuck');
  assert.equal(isStuck(g), false);
});