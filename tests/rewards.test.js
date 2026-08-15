// tests/rewards.test.js — boss loot: what it is, who guards it, how it unlocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REWARD_BACKS, REWARD_TABLES, REWARD_TRIMS,
  rewardForBoss, defaultRewards, defaultUnlocked,
  grant, isUnlocked, catalogue, progress,
} from '../src/meta/rewards.js';
import { BOSSES } from '../src/engine/battle.js';
import { defaultProfile } from '../src/meta/storage.js';

const ALL = [...REWARD_BACKS, ...REWARD_TABLES, ...REWARD_TRIMS];

// ---------- the catalogue ----------

test('every reward is well formed', () => {
  for (const r of ALL) {
    assert.ok(r.id, 'has an id');
    assert.ok(r.name, `${r.id} has a name`);
  }
  assert.equal(new Set(ALL.map((r) => r.id)).size, ALL.length, 'ids are unique');
});

test('every boss-guarded reward names a boss that exists', () => {
  const bossIds = new Set(BOSSES.map((b) => b.id));
  for (const r of ALL) {
    if (r.from) assert.ok(bossIds.has(r.from), `${r.id} points at unknown boss "${r.from}"`);
  }
});

test('no two rewards are guarded by the same boss', () => {
  const guards = ALL.filter((r) => r.from).map((r) => r.from);
  assert.equal(new Set(guards).size, guards.length, 'each boss drops at most one reward');
});

test('a good share of the roster actually drops loot', () => {
  const guarded = new Set(ALL.filter((r) => r.from).map((r) => r.from));
  assert.ok(guarded.size >= 15, `only ${guarded.size} of ${BOSSES.length} bosses drop something`);
});

test('each kind has a starter item unlocked from the beginning', () => {
  const u = defaultUnlocked();
  assert.ok(u.backs.length >= 1, 'a starting back');
  assert.ok(u.tables.length >= 1, 'a starting table');
  assert.ok(u.trims.length >= 1, 'a starting trim');
});

// ---------- lookup ----------

test('rewardForBoss finds the loot a boss guards', () => {
  const guarded = ALL.find((r) => r.from);
  const found = rewardForBoss(guarded.from);
  assert.equal(found.id, guarded.id);
  assert.ok(found.kind, 'the kind is attached for the caller');
});

test('rewardForBoss returns null for a boss that only pays coins', () => {
  const guardedIds = new Set(ALL.filter((r) => r.from).map((r) => r.from));
  const plain = BOSSES.find((b) => !guardedIds.has(b.id));
  if (plain) assert.equal(rewardForBoss(plain.id), null);
});

test('rewardForBoss is safe with an unknown id', () => {
  assert.equal(rewardForBoss('no-such-boss'), null);
  assert.equal(rewardForBoss(undefined), null);
});

// ---------- granting ----------

test('a fresh profile owns only the starter items', () => {
  const r = defaultRewards();
  assert.equal(r.backs.length, REWARD_BACKS.filter((x) => !x.from).length);
  assert.ok(isUnlocked(r, 'back', r.activeBack), 'the equipped back is owned');
  assert.ok(isUnlocked(r, 'table', r.activeTable), 'the equipped table is owned');
});

test('granting a reward unlocks it exactly once', () => {
  const r = defaultRewards();
  const prize = REWARD_BACKS.find((x) => x.from);
  const first = grant(r, { ...prize, kind: 'back' });
  const second = grant(r, { ...prize, kind: 'back' });
  assert.equal(first, true, 'newly unlocked');
  assert.equal(second, false, 'already owned');
  assert.equal(r.backs.filter((id) => id === prize.id).length, 1, 'stored once');
});

test('granting nothing is harmless', () => {
  const r = defaultRewards();
  const before = JSON.stringify(r);
  assert.equal(grant(r, null), false);
  assert.equal(grant(r, { id: 'x', kind: 'nonsense' }), false);
  assert.equal(JSON.stringify(r), before, 'state untouched');
});

test('rewards land in the right bucket', () => {
  const r = defaultRewards();
  const back = REWARD_BACKS.find((x) => x.from);
  const table = REWARD_TABLES.find((x) => x.from);
  grant(r, { ...back, kind: 'back' });
  grant(r, { ...table, kind: 'table' });
  assert.ok(isUnlocked(r, 'back', back.id));
  assert.ok(isUnlocked(r, 'table', table.id));
  assert.ok(!isUnlocked(r, 'table', back.id), 'buckets do not leak');
});

// ---------- catalogue and progress ----------

test('the catalogue flags what is owned', () => {
  const r = defaultRewards();
  const list = catalogue(r, 'back');
  assert.equal(list.length, REWARD_BACKS.length);
  assert.ok(list.some((x) => x.unlocked), 'the starter shows as owned');
  assert.ok(list.some((x) => !x.unlocked), 'the rest are still locked');
});

test('progress counts owned against the full set', () => {
  const r = defaultRewards();
  const start = progress(r);
  assert.ok(start.owned >= 3, 'the starters count');
  assert.equal(start.total, ALL.length);

  const prize = REWARD_BACKS.find((x) => x.from);
  grant(r, { ...prize, kind: 'back' });
  assert.equal(progress(r).owned, start.owned + 1);
});

test('beating every boss unlocks every boss-guarded reward', () => {
  const r = defaultRewards();
  for (const b of BOSSES) {
    const prize = rewardForBoss(b.id);
    if (prize) grant(r, prize);
  }
  for (const item of ALL) {
    if (!item.from) continue;
    const kind = REWARD_BACKS.includes(item) ? 'back'
      : REWARD_TABLES.includes(item) ? 'table' : 'trim';
    assert.ok(isUnlocked(r, kind, item.id), `${item.id} should be unlocked`);
  }
  assert.equal(progress(r).owned, ALL.length, 'the set completes');
});

// ---------- profile integration ----------

test('a new profile carries a rewards block', () => {
  const p = defaultProfile();
  assert.ok(p.rewards, 'present');
  assert.ok(Array.isArray(p.rewards.backs));
  assert.ok(p.rewards.activeBack && p.rewards.activeTable && p.rewards.activeTrim);
});

test('rewards are cosmetic only — no reward carries a rule', () => {
  // Guard the design promise: a decorated deck must never beat a plain one.
  const RULE_KEYS = ['traits', 'rules', 'damage', 'hp', 'multiplier', 'reward', 'bonus'];
  for (const r of ALL) {
    for (const k of RULE_KEYS) {
      assert.equal(k in r, false, `${r.id} must not carry "${k}"`);
    }
  }
});
