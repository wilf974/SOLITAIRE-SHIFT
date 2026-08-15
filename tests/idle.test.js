// tests/idle.test.js — the idle economy: production, costs, offline accrual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEALERS, UPGRADES, defaultIdle, dealerCost, affordable, coinsPerSecond,
  handMultiplier, coinsForResult, tick, buyDealer, buyUpgrade, dealerUnlocked,
  fmtCoins, fmtDuration, OFFLINE_CAP_HOURS,
} from '../src/meta/idle.js';

test('a fresh idle state produces nothing', () => {
  const idle = defaultIdle();
  assert.equal(idle.coins, 0);
  assert.equal(coinsPerSecond(idle), 0);
});

test('dealer cost grows geometrically with each copy owned', () => {
  const d = DEALERS[0];
  const c0 = dealerCost(d, 0), c1 = dealerCost(d, 1), c2 = dealerCost(d, 2);
  assert.equal(c0, d.baseCost);
  assert.ok(c1 > c0 && c2 > c1, 'cost must increase');
  // ~1.15x per step
  assert.ok(Math.abs(c1 / c0 - 1.15) < 0.02, `ratio was ${c1 / c0}`);
});

test('buying a dealer spends coins and raises production', () => {
  const idle = defaultIdle();
  idle.coins = 1000;
  const bought = buyDealer(idle, 'apprentice', 1);
  assert.equal(bought, 1);
  assert.equal(idle.dealers.apprentice, 1);
  assert.ok(idle.coins < 1000, 'coins were spent');
  assert.ok(coinsPerSecond(idle) > 0, 'now producing');
});

test('you cannot buy what you cannot afford', () => {
  const idle = defaultIdle();
  idle.coins = 5; // apprentice costs 25
  assert.equal(buyDealer(idle, 'apprentice', 1), 0);
  assert.equal(idle.coins, 5, 'no coins taken');
  assert.equal(idle.dealers.apprentice, undefined);
});

test('bulk buy stops when coins run out', () => {
  const idle = defaultIdle();
  idle.coins = 100;
  const n = buyDealer(idle, 'apprentice', 50);
  assert.ok(n >= 1 && n < 50, `bought ${n}`);
  assert.ok(idle.coins >= 0, 'never goes negative');
});

test('affordable() agrees with what buyDealer actually buys', () => {
  const idle = defaultIdle();
  idle.coins = 5000;
  const d = DEALERS[0];
  const plan = affordable(d, 0, idle.coins);
  const actual = buyDealer(idle, d.id, 1000);
  assert.equal(actual, plan.count);
});

test('idle upgrades multiply dealer production', () => {
  const idle = defaultIdle();
  idle.dealers.apprentice = 10;
  const before = coinsPerSecond(idle);
  idle.coins = 1000;
  assert.equal(buyUpgrade(idle, 'felt'), true);
  assert.equal(coinsPerSecond(idle), before * 2);
});

test('hand upgrades multiply the player own winnings, not idle rate', () => {
  const idle = defaultIdle();
  idle.dealers.apprentice = 10;
  const rateBefore = coinsPerSecond(idle);
  idle.coins = 10000;
  assert.equal(buyUpgrade(idle, 'tips'), true);
  assert.equal(coinsPerSecond(idle), rateBefore, 'idle rate untouched');
  assert.equal(handMultiplier(idle), 2);
});

test('an upgrade cannot be bought twice', () => {
  const idle = defaultIdle();
  idle.coins = 100000;
  assert.equal(buyUpgrade(idle, 'felt'), true);
  assert.equal(buyUpgrade(idle, 'felt'), false, 'no double-buy');
  assert.equal(idle.upgrades.filter((u) => u === 'felt').length, 1);
});

test('a win pays more coins than a loss', () => {
  const idle = defaultIdle();
  const win = coinsForResult(idle, { won: true, score: 500, foundationCards: 52 });
  const loss = coinsForResult(idle, { won: false, score: 100, foundationCards: 10 });
  assert.ok(win > loss, `win ${win} > loss ${loss}`);
  assert.ok(loss >= 1, 'a loss still pays something');
});

test('tick accrues coins proportional to elapsed time', () => {
  const idle = defaultIdle();
  idle.dealers.croupier = 1; // 1 coin/sec
  const t0 = 1_000_000;
  idle.lastTick = t0;
  const r = tick(idle, t0 + 10_000); // 10 seconds
  assert.ok(Math.abs(r.earned - 10) < 0.001, `earned ${r.earned}`);
  assert.ok(Math.abs(idle.coins - 10) < 0.001);
  assert.equal(idle.lastTick, t0 + 10_000);
});

test('offline earnings are capped, and the cap is reported', () => {
  const idle = defaultIdle();
  idle.dealers.croupier = 1;
  const t0 = 1_000_000;
  idle.lastTick = t0;
  const days = t0 + 3 * 24 * 3600 * 1000;
  const r = tick(idle, days);
  assert.equal(r.capped, true);
  const expected = OFFLINE_CAP_HOURS * 3600; // 1 coin/sec
  assert.ok(Math.abs(r.earned - expected) < 1, `earned ${r.earned}, expected ~${expected}`);
});

test('tick never awards negative coins if the clock goes backwards', () => {
  const idle = defaultIdle();
  idle.dealers.croupier = 5;
  idle.lastTick = 2_000_000;
  const r = tick(idle, 1_000_000); // clock moved back
  assert.equal(r.earned, 0);
  assert.ok(idle.coins >= 0);
});

test('lifetimeCoins only ever grows', () => {
  const idle = defaultIdle();
  idle.dealers.croupier = 1;
  idle.lastTick = 0;
  tick(idle, 5000);
  const life = idle.lifetimeCoins;
  idle.coins = 0; // spend everything
  tick(idle, 10000);
  assert.ok(idle.lifetimeCoins > life, 'lifetime keeps climbing');
});

test('dealers reveal progressively as lifetime coins grow', () => {
  const idle = defaultIdle();
  assert.equal(dealerUnlocked(idle, DEALERS[0]), false, 'nothing at zero');
  idle.lifetimeCoins = DEALERS[0].baseCost;
  assert.equal(dealerUnlocked(idle, DEALERS[0]), true);
  assert.equal(dealerUnlocked(idle, DEALERS[5]), false, 'late dealers stay hidden');
});

test('an owned dealer stays visible even if it would be hidden', () => {
  const idle = defaultIdle();
  idle.dealers[DEALERS[3].id] = 1;
  idle.lifetimeCoins = 0;
  assert.equal(dealerUnlocked(idle, DEALERS[3]), true);
});

test('fmtCoins compacts large numbers', () => {
  assert.equal(fmtCoins(0), '0');
  assert.equal(fmtCoins(999), '999');
  assert.equal(fmtCoins(1500), '1.50K');
  assert.equal(fmtCoins(2_500_000), '2.50M');
  assert.ok(fmtCoins(1e12).endsWith('T'));
});

test('fmtCoins keeps small fractional rates readable', () => {
  // an Apprentice earns 0.1/s — it must not render as "0"
  assert.equal(fmtCoins(0.1), '0.1');
  assert.equal(fmtCoins(2.5), '2.5');
  assert.equal(fmtCoins(8), '8');
});

test('fmtDuration reads naturally', () => {
  assert.equal(fmtDuration(30_000), '30s');
  assert.equal(fmtDuration(5 * 60_000), '5 min');
  assert.equal(fmtDuration(2 * 3600_000), '2h');
  assert.equal(fmtDuration(2 * 3600_000 + 30 * 60_000), '2h 30min');
});

test('every dealer costs more and earns more than the one before it', () => {
  for (let i = 1; i < DEALERS.length; i++) {
    assert.ok(DEALERS[i].baseCost > DEALERS[i - 1].baseCost, `${DEALERS[i].id} cost`);
    assert.ok(DEALERS[i].rate > DEALERS[i - 1].rate, `${DEALERS[i].id} rate`);
  }
});

test('no upgrade is free and every one has a real multiplier', () => {
  for (const u of UPGRADES) {
    assert.ok(u.cost > 0, `${u.id} cost`);
    assert.ok(u.mult > 1, `${u.id} mult`);
    assert.ok(u.kind === 'idle' || u.kind === 'hand', `${u.id} kind`);
  }
});