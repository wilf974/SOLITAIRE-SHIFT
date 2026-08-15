// tests/difficulty.test.js — the tableau placement rules and the difficulty ladder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tableauFits, DEFAULT_RULES } from '../src/engine/game.js';
import { composeRules, getTrait, TRAITS, difficultyValue } from '../src/engine/traits.js';
import { DIFFICULTIES, getDifficulty, difficultyTraits, difficultyReward, supportsDifficulty } from '../src/meta/difficulty.js';

const card = (rank, suit) => ({ rank, suit, faceUp: true, id: `${rank}${suit}` });

// ranks used throughout: 8 lands on 9
const H9 = card('9', 'hearts'), D9 = card('9', 'diamonds');
const S9 = card('9', 'spades'), C9 = card('9', 'clubs');
const H8 = card('8', 'hearts'), D8 = card('8', 'diamonds');
const S8 = card('8', 'spades'), C8 = card('8', 'clubs');

// ---------- standard: alternating colour ----------

test('standard rules: black lands on red, red lands on black', () => {
  const r = composeRules([]);
  assert.equal(tableauFits(r, S8, H9), true, '8♠ on 9♥');
  assert.equal(tableauFits(r, H8, S9), true, '8♥ on 9♠');
});

test('standard rules: same colour is refused', () => {
  const r = composeRules([]);
  assert.equal(tableauFits(r, H8, D9), false, '8♥ on 9♦ (both red)');
  assert.equal(tableauFits(r, S8, C9), false, '8♠ on 9♣ (both black)');
});

// ---------- same suit (the corrected rule) ----------

test('Même enseigne: only the identical suit is allowed', () => {
  const r = composeRules(['same-suit']);
  assert.equal(tableauFits(r, H8, H9), true, '8♥ on 9♥');
  assert.equal(tableauFits(r, S8, S9), true, '8♠ on 9♠');
});

test('Même enseigne refuses a different suit of the SAME colour', () => {
  // this is the bug that used to slip through: hearts on diamonds
  const r = composeRules(['same-suit']);
  assert.equal(tableauFits(r, H8, D9), false, '8♥ must not land on 9♦');
  assert.equal(tableauFits(r, D8, H9), false, '8♦ must not land on 9♥');
  assert.equal(tableauFits(r, S8, C9), false, '8♠ must not land on 9♣');
});

test('Même enseigne refuses the opposite colour too', () => {
  const r = composeRules(['same-suit']);
  assert.equal(tableauFits(r, S8, H9), false);
});

// ---------- same colour ----------

test('Même teinte allows either suit of the same colour', () => {
  const r = composeRules(['same-color']);
  assert.equal(tableauFits(r, H8, D9), true, '8♥ on 9♦');
  assert.equal(tableauFits(r, S8, C9), true, '8♠ on 9♣');
  assert.equal(tableauFits(r, H8, H9), true, '8♥ on 9♥');
});

test('Même teinte refuses the opposite colour', () => {
  const r = composeRules(['same-color']);
  assert.equal(tableauFits(r, H8, S9), false);
});

// ---------- alternating suit ----------

test('Enseigne changeante allows anything but the matching suit', () => {
  const r = composeRules(['alt-suit']);
  assert.equal(tableauFits(r, H8, D9), true, '8♥ on 9♦');
  assert.equal(tableauFits(r, H8, S9), true, '8♥ on 9♠');
  assert.equal(tableauFits(r, H8, H9), false, '8♥ on 9♥ refused');
});

// ---------- any colour ----------

test('Couleur libre accepts every suit', () => {
  const r = composeRules(['any-color']);
  for (const c of [H8, D8, S8, C8]) {
    assert.equal(tableauFits(r, c, H9), true, `${c.id} on 9♥`);
  }
});

// ---------- rank is always enforced ----------

test('every placement rule still requires a descending rank', () => {
  for (const t of [[], ['same-suit'], ['same-color'], ['alt-suit'], ['any-color']]) {
    const r = composeRules(t);
    const H7 = card('7', 'hearts');
    assert.equal(tableauFits(r, H7, H9), false, `7♥ on 9♥ under ${t.join(',') || 'standard'}`);
  }
});

// ---------- the difficulty ladder ----------

test('every difficulty is well formed', () => {
  for (const d of DIFFICULTIES) {
    assert.ok(d.id && d.name && d.desc && d.emoji, `${d.id} fields`);
    assert.ok(d.reward > 0, `${d.id} reward`);
    assert.ok(Array.isArray(d.traits), `${d.id} traits`);
    for (const t of d.traits) assert.ok(getTrait(t), `${d.id} references a real trait: ${t}`);
  }
});

test('difficulty rewards rise with actual rule difficulty', () => {
  const scored = DIFFICULTIES.map((d) => ({
    id: d.id, reward: d.reward, value: difficultyValue(d.traits),
  }));
  for (let i = 1; i < scored.length; i++) {
    assert.ok(scored[i].reward > scored[i - 1].reward,
      `${scored[i].id} pays more than ${scored[i - 1].id}`);
  }
  // the hardest level must genuinely be the hardest ruleset
  const hardest = scored[scored.length - 1];
  assert.ok(hardest.value >= Math.max(...scored.map((s) => s.value)), 'brutal is the hardest');
});

test('the gentle level is easier than standard and pays less', () => {
  const gentle = getDifficulty('gentle'), standard = getDifficulty('standard');
  assert.ok(difficultyValue(gentle.traits) < difficultyValue(standard.traits));
  assert.ok(gentle.reward < standard.reward);
});

test('getDifficulty falls back to standard for an unknown id', () => {
  assert.equal(getDifficulty('nope').id, 'standard');
  assert.equal(getDifficulty(undefined).id, 'standard');
});

test('difficultyTraits returns a copy, never the shared array', () => {
  const a = difficultyTraits('brutal');
  a.push('junk');
  assert.ok(!difficultyTraits('brutal').includes('junk'), 'internal state untouched');
});

test('difficultyReward matches the table', () => {
  for (const d of DIFFICULTIES) assert.equal(difficultyReward(d.id), d.reward);
});

test('supportsDifficulty covers the free-choice modes only', () => {
  for (const m of ['classic', 'zen', 'timed', 'tide', 'daily']) {
    assert.equal(supportsDifficulty(m), true, `${m} supports it`);
  }
  // authored modes carry their own rules and must not be overridden
  for (const m of ['adventure', 'contract', 'ascension', 'journey']) {
    assert.equal(supportsDifficulty(m), false, `${m} keeps its own rules`);
  }
});

test('the brutal ladder actually composes into harsh rules', () => {
  const r = composeRules(difficultyTraits('brutal'));
  assert.equal(r.tableauOrder, 'desc-samesuit');
  assert.equal(r.drawCount, 3);
  assert.equal(r.undoAllowed, false);
});

test('no difficulty stacks same-suit with locked empty columns', () => {
  // That pairing makes winnable deals so rare the solver cannot validate one,
  // and an unvalidated deal presented as fair is worse than an easier rung.
  for (const d of DIFFICULTIES) {
    const r = composeRules(d.traits);
    const impossiblePairing = r.tableauOrder === 'desc-samesuit' && r.emptyColumnRule === 'none';
    assert.equal(impossiblePairing, false, `${d.id} must stay solvable`);
  }
});

// ---------- the new difficulty traits ----------

test('Mains nues bars powers via the rules object', () => {
  assert.equal(DEFAULT_RULES.powersAllowed, true, 'allowed by default');
  const r = composeRules(['no-powers']);
  assert.equal(r.powersAllowed, false);
});

test('no trait disables auto-flip', () => {
  // A 'blind-flip' trait was tried and removed: without auto-flip a buried
  // card can never be turned over, so no deal is winnable. Guard against it
  // coming back.
  for (const t of TRAITS) {
    assert.notEqual(composeRules([t.id]).revealFlipped, false,
      `${t.id} must not disable auto-flip`);
  }
});

test('Pioche par cinq and Deux passes set their rules', () => {
  assert.equal(composeRules(['draw-five']).drawCount, 5);
  assert.equal(composeRules(['two-passes']).maxStockPasses, 2);
});

test('every trait in the catalogue still composes without throwing', () => {
  for (const t of TRAITS) {
    const r = composeRules([t.id]);
    assert.ok(r && typeof r === 'object', `${t.id} composes`);
  }
});
// ---------- authored content ships pre-validated seeds ----------

test('every contract ships a solver-validated seed', async () => {
  const { CONTRACTS } = await import('../src/modes.js');
  for (const c of CONTRACTS) {
    assert.ok(c.seed, `${c.id} has a cached seed`);
    assert.ok(c.seed.includes('::'), `${c.id} seed looks like a real seed`);
    for (const t of c.traits) assert.ok(getTrait(t), `${c.id} uses a real trait: ${t}`);
  }
});

test('every adventure chapter ships a solver-validated seed', async () => {
  const { CHAPTERS } = await import('../src/modes.js');
  assert.ok(CHAPTERS.length >= 8, 'the run has real length');
  for (const ch of CHAPTERS) {
    assert.ok(ch.seed, `"${ch.name}" has a cached seed`);
    assert.ok(ch.name && ch.story && ch.objective, `"${ch.name}" is fully written`);
    for (const t of ch.traits) assert.ok(getTrait(t), `"${ch.name}" uses a real trait: ${t}`);
  }
});

test('authored deals load instantly (no solver run)', async () => {
  const { makeDeal } = await import('../src/modes.js');
  const t0 = Date.now();
  await makeDeal('contract', { profile: {}, contractId: 'c6-the-gauntlet' });
  await makeDeal('adventure', { profile: {}, chapter: 7 });
  const ms = Date.now() - t0;
  assert.ok(ms < 500, `cached seeds must not re-run the solver (took ${ms}ms)`);
});

test('inverted rules keep the tableau and foundations in opposite directions', () => {
  // If both descend, every card is buried under the one that must leave first
  // and no deal is winnable. This pairing is what made chapter 8 unsolvable.
  for (const id of ['foundations-down', 'reverse-tableau']) {
    const r = composeRules([id]);
    const tableauDescends = r.tableauOrder.startsWith('desc');
    const foundationDescends = r.foundationDirection === 'desc';
    assert.notEqual(tableauDescends, foundationDescends,
      `${id}: tableau and foundations must run in opposite directions`);
  }
});

test('an empty column can always be opened by some card', () => {
  // 'locked-empties' deliberately opts out; every other trait must leave a way in.
  for (const t of TRAITS) {
    if (t.id === 'locked-empties') continue;
    const r = composeRules([t.id]);
    assert.notEqual(r.emptyColumnRule, 'none', `${t.id} must not seal every column`);
  }
});
