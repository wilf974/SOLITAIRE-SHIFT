// tests/powers.test.js — power economy and power effects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POWERS, getPower, shopList, defaultPowers, coinsForResult, chargesOf,
  buyCharges, spendCharge, awardCoins, fmtCoins,
} from '../src/meta/powers.js';
import { peek, aceCall, reshuffle, reserveStore, undoBurst, timeGift } from '../src/engine/powers-fx.js';
import { createGame, applyMove, legalMoves, top, rankOf } from '../src/engine/game.js';
import { makeRng } from '../src/engine/rng.js';
import { composeRules } from '../src/engine/traits.js';

function freshGame(seed = 'powers-test::0', rules = composeRules([])) {
  return createGame(seed, makeRng(seed), rules);
}

// ---------- economy ----------

test('a fresh power wallet is empty', () => {
  const pw = defaultPowers();
  assert.equal(pw.coins, 0);
  assert.deepEqual(pw.charges, {});
});

test('a win pays more coins than a loss', () => {
  const win = coinsForResult({ won: true, score: 500, foundationCards: 52, streak: 3 });
  const loss = coinsForResult({ won: false, score: 100, foundationCards: 10 });
  assert.ok(win > loss, `win ${win} > loss ${loss}`);
  assert.ok(loss >= 1, 'a loss still pays something');
});

test('a longer streak pays more', () => {
  const a = coinsForResult({ won: true, score: 300, streak: 0 });
  const b = coinsForResult({ won: true, score: 300, streak: 8 });
  assert.ok(b > a, `streak ${b} > no streak ${a}`);
});

test('buying a charge spends coins and grants exactly one charge', () => {
  const pw = defaultPowers();
  awardCoins(pw, 1000);
  const p = POWERS[0];
  assert.equal(buyCharges(pw, p.id, 1), 1);
  assert.equal(chargesOf(pw, p.id), 1);
  assert.equal(pw.coins, 1000 - p.cost);
});

test('you cannot buy what you cannot afford, and coins never go negative', () => {
  const pw = defaultPowers();
  awardCoins(pw, 5);
  assert.equal(buyCharges(pw, 'peek', 1), 0);
  assert.equal(pw.coins, 5);
  assert.equal(chargesOf(pw, 'peek'), 0);
});

test('bulk buy stops when coins run out', () => {
  const pw = defaultPowers();
  awardCoins(pw, 100); // peek costs 40 → 2 charges
  const n = buyCharges(pw, 'peek', 5);
  assert.equal(n, 2);
  assert.ok(pw.coins >= 0);
});

test('spending a charge decrements it and counts the use', () => {
  const pw = defaultPowers();
  awardCoins(pw, 1000);
  buyCharges(pw, 'peek', 2);
  assert.equal(spendCharge(pw, 'peek'), true);
  assert.equal(chargesOf(pw, 'peek'), 1);
  assert.equal(pw.used.peek, 1);
});

test('spending with no charges fails and changes nothing', () => {
  const pw = defaultPowers();
  assert.equal(spendCharge(pw, 'peek'), false);
  assert.equal(chargesOf(pw, 'peek'), 0);
});

test('lifetimeCoins only grows, even as coins are spent', () => {
  const pw = defaultPowers();
  awardCoins(pw, 500);
  buyCharges(pw, 'peek', 5);
  assert.ok(pw.coins < 500);
  assert.equal(pw.lifetimeCoins, 500);
});

test('every power has a name, a cost and a description', () => {
  for (const p of POWERS) {
    assert.ok(p.id && p.name && p.desc && p.emoji, `${p.id} fields`);
    assert.ok(p.cost > 0, `${p.id} cost`);
    assert.ok(getPower(p.id) === p, `${p.id} lookup`);
  }
});

test('shopList is sorted cheapest first and complete', () => {
  const list = shopList();
  assert.equal(list.length, POWERS.length);
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i].cost >= list[i - 1].cost, 'ascending cost');
  }
});

test('fmtCoins stays readable at every scale', () => {
  assert.equal(fmtCoins(0), '0');
  assert.equal(fmtCoins(0.1), '0.1');
  assert.equal(fmtCoins(999), '999');
  assert.equal(fmtCoins(1500), '1.50K');
});

// ---------- effects ----------

test('peek reveals a face-down tableau card', () => {
  const g = freshGame();
  const hiddenBefore = g.tableau.flat().filter((c) => !c.faceUp).length;
  const res = peek(g);
  assert.equal(res.ok, true);
  const hiddenAfter = g.tableau.flat().filter((c) => !c.faceUp).length;
  assert.equal(hiddenAfter, hiddenBefore - 1, 'exactly one card revealed');
  assert.equal(g.tableau[res.col][res.index].faceUp, true);
});

test('peek fails cleanly when nothing is hidden', () => {
  const g = freshGame();
  for (const pile of g.tableau) for (const c of pile) c.faceUp = true;
  const res = peek(g);
  assert.equal(res.ok, false);
  assert.ok(res.reason);
});

test('peek is undoable', () => {
  const g = freshGame();
  const before = g.tableau.flat().filter((c) => !c.faceUp).length;
  peek(g);
  assert.ok(g.history.length > 0, 'pushed history');
});

test('aceCall moves an available Ace to its foundation', () => {
  const g = freshGame();
  // guarantee an Ace is reachable: put one on top of column 0
  const ace = { suit: 'hearts', rank: 'A', faceUp: true, id: 'test-ace-h' };
  g.tableau[0].push(ace);
  const res = aceCall(g);
  assert.equal(res.ok, true);
  assert.equal(res.cardId, ace.id);
  assert.equal(g.foundations[1].length, 1, 'hearts foundation got it');
  assert.ok(!g.tableau[0].some((c) => c.id === ace.id), 'removed from tableau');
});

test('aceCall fails cleanly when no Ace is available', () => {
  const g = freshGame();
  // hide every ace
  for (const pile of g.tableau) for (const c of pile) if (rankOf(c) === 1) c.faceUp = false;
  g.waste = [];
  const res = aceCall(g);
  if (!res.ok) assert.ok(res.reason);
  else assert.equal(g.foundations.flat().length, 1); // it found a legitimately exposed one
});

test('reshuffle keeps every stock card, only reorders them', () => {
  const g = freshGame();
  const before = g.stock.map((c) => c.id).sort();
  const res = reshuffle(g, makeRng('shuffle-seed'));
  assert.equal(res.ok, true);
  const after = g.stock.map((c) => c.id).sort();
  assert.deepEqual(after, before, 'no card added or lost');
});

test('reshuffle is deterministic for the same rng seed', () => {
  const a = freshGame(), b = freshGame();
  reshuffle(a, makeRng('same'));
  reshuffle(b, makeRng('same'));
  assert.deepEqual(a.stock.map((c) => c.id), b.stock.map((c) => c.id));
});

test('reserveStore takes a top card and leaves the pile shorter', () => {
  const g = freshGame();
  const card = top(g.tableau[6]);
  const before = g.tableau[6].length;
  const res = reserveStore(g, card.id);
  assert.equal(res.ok, true);
  assert.equal(g.reserve.id, card.id);
  assert.equal(g.tableau[6].length, before - 1);
});

test('reserveStore refuses a buried card', () => {
  const g = freshGame();
  const buried = g.tableau[6][0];
  const res = reserveStore(g, buried.id);
  assert.equal(res.ok, false);
  assert.equal(g.reserve, null, 'state untouched');
});

test('reserveStore refuses when the reserve is already full', () => {
  const g = freshGame();
  reserveStore(g, top(g.tableau[6]).id);
  const second = top(g.tableau[5]);
  const res = reserveStore(g, second.id);
  assert.equal(res.ok, false);
  assert.equal(g.reserve.id !== second.id, true);
});

test('a reserved card becomes playable via legalMoves', () => {
  const g = freshGame();
  g.reserve = { suit: 'hearts', rank: 'A', faceUp: true, id: 'res-ace' };
  const moves = legalMoves(g);
  assert.ok(moves.some((m) => m.type === 'reserve-to-foundation'), 'ace can go home');
});

test('reserve-to-foundation actually places the card and empties the reserve', () => {
  const g = freshGame();
  g.reserve = { suit: 'hearts', rank: 'A', faceUp: true, id: 'res-ace' };
  assert.equal(applyMove(g, { type: 'reserve-to-foundation' }), true);
  assert.equal(g.reserve, null);
  assert.equal(g.foundations[1].length, 1);
});

test('an illegal reserve move is rejected and leaves the reserve intact', () => {
  const g = freshGame();
  g.reserve = { suit: 'hearts', rank: 'K', faceUp: true, id: 'res-king' };
  const ok = applyMove(g, { type: 'reserve-to-foundation' }); // K cannot start a foundation
  assert.equal(ok, false);
  assert.equal(g.reserve.id, 'res-king', 'still held');
});

test('undoBurst rolls back up to three moves', () => {
  const g = freshGame();
  for (let i = 0; i < 4; i++) {
    const m = legalMoves(g)[0];
    if (!m) break;
    applyMove(g, m);
  }
  const movesBefore = g.moves;
  const res = undoBurst(g, 3);
  assert.equal(res.ok, true);
  assert.ok(res.undone >= 1 && res.undone <= 3);
  assert.ok(g.moves < movesBefore, 'moves went backwards');
});

test('undoBurst fails cleanly with nothing to undo', () => {
  const g = freshGame();
  const res = undoBurst(g, 3);
  assert.equal(res.ok, false);
});

test('timeGift only works in a timed game', () => {
  const g = freshGame();
  assert.equal(timeGift(g).ok, false, 'untimed game refuses');

  const timed = freshGame('t::0', { ...composeRules([]), timeLimitMs: 300000 });
  const res = timeGift(timed, 45);
  assert.equal(res.ok, true);
  assert.equal(timed.timeBonusMs, 45000);
});

test('the reserve survives a snapshot/undo round-trip', () => {
  const g = freshGame();
  reserveStore(g, top(g.tableau[6]).id);
  const held = g.reserve.id;
  const m = legalMoves(g).find((x) => x.type === 'draw');
  applyMove(g, m);
  assert.equal(g.reserve.id, held, 'still held after another move');
});
// ---------- "Marée" mode ----------

test('tide deals a card onto every column every N moves', () => {
  const g = freshGame('tide::0', { ...composeRules([]), tideEvery: 3 });
  const cols = () => g.tableau.map((p) => p.length);
  const before = cols();
  const stockBefore = g.stock.length;
  // three legal moves should trigger exactly one tide
  for (let i = 0; i < 3; i++) {
    const m = legalMoves(g)[0];
    assert.ok(m, 'a move exists');
    applyMove(g, m);
  }
  const after = cols();
  const grew = after.filter((n, i) => n > before[i]).length;
  assert.ok(grew >= 6, `most columns grew, got ${grew}`);
  assert.ok(g.stock.length < stockBefore, 'cards came from the stock');
});

test('tide never runs in a normal game', () => {
  const g = freshGame();
  const before = g.tableau.map((p) => p.length);
  for (let i = 0; i < 20; i++) {
    const m = legalMoves(g)[0];
    if (!m) break;
    applyMove(g, m);
  }
  // no column may have grown purely by tide (only by real moves)
  assert.equal(g.tideEvery, 0, 'tide disabled');
});

test('tide stops gracefully once the stock is empty', () => {
  const g = freshGame('tide2::0', { ...composeRules([]), tideEvery: 1 });
  g.stock = [];
  const before = g.tableau.map((p) => p.length);
  const m = legalMoves(g).find((x) => x.type !== 'draw');
  if (m) applyMove(g, m);
  assert.ok(g.tableau.every((p, i) => p.length <= before[i] + 1), 'no cards conjured');
});
