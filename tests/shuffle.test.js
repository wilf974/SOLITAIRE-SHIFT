// tests/shuffle.test.js — PRNG determinism and deck integrity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hashSeed, makeRng } from '../src/engine/rng.js';
import { freshDeck, freshDecks, SUITS, RANKS } from '../src/engine/deck.js';
import { createGame } from '../src/engine/game.js';

test('mulberry32 is deterministic for the same seed', () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('different seeds produce different sequences', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  let diff = 0;
  for (let i = 0; i < 100; i++) if (a() !== b()) diff++;
  assert.ok(diff > 90, `expected mostly different, got ${diff} diffs`);
});

test('hashSeed is stable across runs (same string -> same number)', () => {
  assert.equal(hashSeed('daily-2026-08-15'), hashSeed('daily-2026-08-15'));
  assert.notEqual(hashSeed('a'), hashSeed('b'));
});

test('makeRng.int(n) stays in range', () => {
  const rng = makeRng('range-test');
  for (let i = 0; i < 1000; i++) {
    const v = rng.int(7);
    assert.ok(v >= 0 && v < 7, `int(7) returned ${v}`);
  }
});

test('makeRng.shuffle preserves the element set', () => {
  const rng = makeRng('shuffle-set');
  const arr = freshDeck();
  const ids = new Set(arr.map((c) => c.id));
  rng.shuffle(arr);
  assert.equal(arr.length, 52);
  assert.deepEqual(new Set(arr.map((c) => c.id)), ids, 'shuffle must not add/drop cards');
});

test('same seed yields the identical shuffled deck order', () => {
  const r1 = makeRng('order-seed');
  const r2 = makeRng('order-seed');
  const d1 = freshDeck(); r1.shuffle(d1);
  const d2 = freshDeck(); r2.shuffle(d2);
  assert.deepEqual(d1.map((c) => c.id), d2.map((c) => c.id));
});

test('freshDeck has all 52 unique cards', () => {
  const d = freshDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d.map((c) => c.id)).size, 52);
  // every suit x rank combo present
  for (const s of SUITS) for (const r of RANKS) {
    assert.ok(d.some((c) => c.suit === s && c.rank === r), `${r}${s} missing`);
  }
});

test('freshDecks(n) has n*52 unique cards', () => {
  const d = freshDecks(2);
  assert.equal(d.length, 104);
  // not all unique (two decks share rank+suit) but ids are unique via deck index
  assert.equal(new Set(d.map((c) => c.id)).size, 104);
});

test('createGame with same seed deals identical tableau + stock', () => {
  const g1 = createGame('deal-seed-42', makeRng('deal-seed-42'));
  const g2 = createGame('deal-seed-42', makeRng('deal-seed-42'));
  assert.deepEqual(g1.tableau.map((p) => p.map((c) => c.id)), g2.tableau.map((p) => p.map((c) => c.id)));
  assert.deepEqual(g1.stock.map((c) => c.id), g2.stock.map((c) => c.id));
});

test('createGame deals 28 tableau cards + 24 stock = 52', () => {
  const g = createGame('count-seed', makeRng('count-seed'));
  let tab = 0; for (const p of g.tableau) tab += p.length;
  assert.equal(tab + g.stock.length, 52);
  assert.equal(g.waste.length, 0);
  assert.equal(g.foundations.flat().length, 0);
});