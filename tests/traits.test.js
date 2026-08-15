// tests/traits.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAITS, composeRules, difficultyValue, rewardMultiplier, traitsAtTier, getTrait } from '../src/engine/traits.js';
import { DEFAULT_RULES } from '../src/engine/game.js';

test('every trait has id, name, one-line desc, value, tier, apply', () => {
  for (const t of TRAITS) {
    assert.ok(t.id, 'has id');
    assert.ok(t.name, 'has name');
    assert.ok(t.desc && !t.desc.includes('\n'), 'desc is one line');
    assert.equal(typeof t.value, 'number');
    assert.equal(typeof t.tier, 'number');
    assert.equal(typeof t.apply, 'function');
  }
});

test('trait ids are unique', () => {
  const ids = TRAITS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('composeRules with no traits equals defaults', () => {
  assert.deepEqual(composeRules([]), DEFAULT_RULES);
});

test('draw-three sets drawCount 3', () => {
  assert.equal(composeRules(['draw-three']).drawCount, 3);
});

test('no-recycle sets maxStockPasses 0', () => {
  assert.equal(composeRules(['no-recycle']).maxStockPasses, 0);
});

test('free-empties sets emptyColumnRule any', () => {
  assert.equal(composeRules(['free-empties']).emptyColumnRule, 'any');
});

test('locked-empties sets emptyColumnRule none', () => {
  assert.equal(composeRules(['locked-empties']).emptyColumnRule, 'none');
});

test('foundations-down inverts start + direction', () => {
  const r = composeRules(['foundations-down']);
  assert.equal(r.foundationStart, 'king');
  assert.equal(r.foundationDirection, 'desc');
});

test('difficultyValue sums and clamps', () => {
  assert.equal(difficultyValue([]), 0);
  assert.equal(difficultyValue(['no-recycle']), 3);
  assert.equal(difficultyValue(['locked-empties', 'no-recycle', 'no-undo']), 8);
  // clamp low
  assert.equal(difficultyValue(['free-empties', 'any-color']), -4);
});

test('rewardMultiplier is >= 0.4 and scales with difficulty', () => {
  assert.ok(rewardMultiplier([]) >= 1);
  assert.ok(rewardMultiplier(['locked-empties']) > rewardMultiplier([]));
  assert.ok(rewardMultiplier(['free-empties']) < rewardMultiplier([]));
  assert.ok(rewardMultiplier(['free-empties', 'any-color']) >= 0.4);
});

test('traitsAtTier returns traits up to tier', () => {
  const t0 = traitsAtTier(0);
  assert.ok(t0.includes('kings-only'));
  const t1 = traitsAtTier(1);
  assert.ok(t1.includes('draw-three'));
  assert.ok(t1.includes('free-empties'));
});

test('composeRules merges multiple traits without mutating defaults', () => {
  const r = composeRules(['draw-three', 'no-undo', 'same-suit']);
  assert.equal(r.drawCount, 3);
  assert.equal(r.undoAllowed, false);
  // 'same-suit' means the literal suit (hearts on hearts), not merely the
  // colour — 'same-color' is the separate, easier trait.
  assert.equal(r.tableauOrder, 'desc-samesuit');
  assert.equal(composeRules(['same-color']).tableauOrder, 'desc-samecolor');
  assert.equal(DEFAULT_RULES.drawCount, 1, 'defaults untouched');
});