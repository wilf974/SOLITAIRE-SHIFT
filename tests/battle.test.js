// tests/battle.test.js — Battle mode: damage, combos, boss behaviour, abilities.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOSSES, getBoss, createBattle, afterMove, baseDamage, comboMultiplier,
  attackDamage, movesUntilAttack, refillStock,
} from '../src/engine/battle.js';
import {
  BATTLE_POWERS, getBattlePower, initCooldowns, tickCooldowns, isReady,
  useBattlePower,
} from '../src/engine/battle-powers.js';
import { createGame, applyMove, legalMoves, top, undo as undoMove } from '../src/engine/game.js';
import { makeRng } from '../src/engine/rng.js';
import { composeRules } from '../src/engine/traits.js';
import { serialize, deserialize } from '../src/engine/serialize.js';

const card = (rank, suit) => ({ rank, suit, faceUp: true, id: `${rank}${suit}` });

function battleGame(bossId = 'gardien', seed = 'battle::0') {
  const g = createGame(seed, makeRng(seed), composeRules([]));
  g.battle = createBattle(bossId);
  return g;
}

// ---------- damage model ----------

test('a King is worth more than an Ace', () => {
  assert.ok(baseDamage(card('K', 'spades')) > baseDamage(card('A', 'spades')));
});

test('damage rises monotonically with rank from 2 to 10', () => {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
  for (let i = 1; i < ranks.length; i++) {
    assert.ok(
      baseDamage(card(ranks[i], 'hearts')) > baseDamage(card(ranks[i - 1], 'hearts')),
      `${ranks[i]} beats ${ranks[i - 1]}`,
    );
  }
});

test('combo multiplier starts at 1 and is capped at 3', () => {
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(1), 1);
  assert.ok(comboMultiplier(5) > 1);
  assert.equal(comboMultiplier(100), 3, 'cap holds so a long chain cannot one-shot');
});

test('the same card hits harder inside a combo', () => {
  const c = card('7', 'clubs');
  assert.ok(attackDamage(c, 5) > attackDamage(c, 1));
});

// ---------- bosses ----------

test('every boss is well formed and ordered by difficulty', () => {
  for (const b of BOSSES) {
    assert.ok(b.id && b.name && b.taunt, `${b.id} fields`);
    assert.ok(b.hp > 0 && b.playerHp > 0, `${b.id} health`);
    assert.ok(b.attackEvery >= 1, `${b.id} attack cadence`);
    assert.ok(b.reward > 0, `${b.id} reward`);
  }
  for (let i = 1; i < BOSSES.length; i++) {
    assert.ok(BOSSES[i].hp > BOSSES[i - 1].hp, `${BOSSES[i].id} is tougher`);
    assert.ok(BOSSES[i].reward > BOSSES[i - 1].reward, `${BOSSES[i].id} pays more`);
  }
});

test('getBoss falls back to the first boss for an unknown id', () => {
  assert.equal(getBoss('nope').id, BOSSES[0].id);
});

test('a fresh battle starts at full health with no combo', () => {
  const b = createBattle('gardien');
  assert.equal(b.bossHp, b.bossMaxHp);
  assert.equal(b.playerHp, b.playerMaxHp);
  assert.equal(b.combo, 0);
  assert.equal(b.over, false);
});

// ---------- the exchange ----------

test('a foundation play damages the boss and builds the combo', () => {
  const g = battleGame();
  const ace = card('A', 'hearts');
  const before = g.battle.bossHp;
  const res = afterMove(g, { type: 'tab-to-foundation', from: 0 }, ace);
  assert.ok(res.events.some((e) => e.type === 'hit'));
  assert.ok(g.battle.bossHp < before, 'boss took damage');
  assert.equal(g.battle.combo, 1);
});

test('a non-foundation move does not damage the boss', () => {
  const g = battleGame();
  const before = g.battle.bossHp;
  afterMove(g, { type: 'draw' }, null);
  assert.equal(g.battle.bossHp, before);
  assert.equal(g.battle.combo, 0);
});

test('the combo decays after a beat without a foundation play', () => {
  const g = battleGame();
  afterMove(g, { type: 'tab-to-foundation', from: 0 }, card('A', 'hearts'));
  assert.equal(g.battle.combo, 1);
  for (let i = 0; i < 3; i++) afterMove(g, { type: 'draw' }, null);
  assert.equal(g.battle.combo, 0, 'chain broken');
});

test('the boss strikes on its cadence, not before', () => {
  const g = battleGame('gardien');
  const boss = getBoss('gardien');
  const hpBefore = g.battle.playerHp;
  for (let i = 0; i < boss.attackEvery - 1; i++) afterMove(g, { type: 'draw' }, null);
  assert.equal(g.battle.playerHp, hpBefore, 'no early strike');
  afterMove(g, { type: 'draw' }, null);
  assert.ok(g.battle.playerHp < hpBefore, 'struck on schedule');
});

test('movesUntilAttack counts down and resets after a strike', () => {
  const g = battleGame('gardien');
  const start = movesUntilAttack(g.battle);
  afterMove(g, { type: 'draw' }, null);
  assert.equal(movesUntilAttack(g.battle), start - 1);
  // one more move lands the strike, which resets the counter
  for (let i = 1; i < start; i++) afterMove(g, { type: 'draw' }, null);
  assert.equal(movesUntilAttack(g.battle), start, 'reset after striking');
});

test('the battle ends in victory when the boss reaches zero', () => {
  const g = battleGame();
  g.battle.bossHp = 5;
  const res = afterMove(g, { type: 'tab-to-foundation', from: 0 }, card('K', 'spades'));
  assert.equal(g.battle.over, true);
  assert.equal(g.battle.won, true);
  assert.ok(res.events.some((e) => e.type === 'victory'));
});

test('the battle ends in defeat when the player reaches zero', () => {
  const g = battleGame('gardien');
  const boss = getBoss('gardien');
  g.battle.playerHp = boss.attackDamage;
  for (let i = 0; i < boss.attackEvery; i++) afterMove(g, { type: 'draw' }, null);
  assert.equal(g.battle.over, true);
  assert.equal(g.battle.won, false);
});

test('nothing happens once the battle is over', () => {
  const g = battleGame();
  g.battle.over = true;
  const snapshot = { ...g.battle };
  const res = afterMove(g, { type: 'tab-to-foundation', from: 0 }, card('K', 'spades'));
  assert.equal(res, null);
  assert.equal(g.battle.bossHp, snapshot.bossHp, 'state untouched');
});

// ---------- boss abilities ----------

test("L'Horloger breaks the combo when it strikes", () => {
  const g = battleGame('horloger');
  const boss = getBoss('horloger');
  afterMove(g, { type: 'tab-to-foundation', from: 0 }, card('A', 'hearts'));
  afterMove(g, { type: 'tab-to-foundation', from: 0 }, card('2', 'hearts'));
  assert.ok(g.battle.combo >= 2);
  // walk to the strike
  while (movesUntilAttack(g.battle) > 1) {
    afterMove(g, { type: 'tab-to-foundation', from: 0 }, card('3', 'hearts'));
  }
  afterMove(g, { type: 'tab-to-foundation', from: 0 }, card('4', 'hearts'));
  assert.equal(g.battle.combo, 0, 'combo broken by the boss');
});

test("L'Illusionniste hides a card when it strikes", () => {
  const g = battleGame('illusionniste');
  const boss = getBoss('illusionniste');
  const faceUpBefore = g.tableau.flat().filter((c) => c.faceUp).length;
  for (let i = 0; i < boss.attackEvery; i++) afterMove(g, { type: 'draw' }, null);
  const faceUpAfter = g.tableau.flat().filter((c) => c.faceUp).length;
  assert.ok(faceUpAfter < faceUpBefore, 'a card was veiled');
});

test('La Souveraine floods every column when it strikes', () => {
  const g = battleGame('souveraine');
  const boss = getBoss('souveraine');
  const before = g.tableau.map((p) => p.length);
  const stockBefore = g.stock.length;
  for (let i = 0; i < boss.attackEvery; i++) afterMove(g, { type: 'draw' }, null);
  const grew = g.tableau.filter((p, i) => p.length > before[i]).length;
  assert.ok(grew >= 6, `most columns grew, got ${grew}`);
  assert.ok(g.stock.length < stockBefore, 'cards came from the stock');
});

// ---------- battle abilities ----------

test('every battle power is well formed', () => {
  for (const p of BATTLE_POWERS) {
    assert.ok(p.id && p.name && p.desc && p.emoji, `${p.id} fields`);
    assert.ok(p.cooldown > 0, `${p.id} cooldown`);
    assert.equal(getBattlePower(p.id), p);
  }
});

test('cooldowns start ready and tick down', () => {
  const cd = initCooldowns();
  for (const p of BATTLE_POWERS) assert.equal(cd[p.id], 0);
  const battle = createBattle('gardien');
  battle.cooldowns.strike = 3;
  tickCooldowns(battle);
  assert.equal(battle.cooldowns.strike, 2);
});

test('Frappe damages the boss and goes on cooldown', () => {
  const g = battleGame();
  const before = g.battle.bossHp;
  const res = useBattlePower(g, 'strike');
  assert.equal(res.ok, true);
  assert.ok(g.battle.bossHp < before);
  assert.ok(g.battle.cooldowns.strike > 0, 'now cooling down');
  assert.equal(isReady(g.battle, 'strike'), false);
});

test('a power on cooldown refuses and changes nothing', () => {
  const g = battleGame();
  useBattlePower(g, 'strike');
  const hp = g.battle.bossHp;
  const res = useBattlePower(g, 'strike');
  assert.equal(res.ok, false);
  assert.ok(res.reason);
  assert.equal(g.battle.bossHp, hp, 'no damage on a refused use');
});

test('Frappe hits harder with a bigger combo', () => {
  const a = battleGame(); a.battle.combo = 0;
  const b = battleGame(); b.battle.combo = 6;
  const ra = useBattlePower(a, 'strike');
  const rb = useBattlePower(b, 'strike');
  assert.ok(rb.damage > ra.damage);
});

test('Garde absorbs the next boss strike entirely', () => {
  const g = battleGame('gardien');
  const boss = getBoss('gardien');
  useBattlePower(g, 'guard');
  const hpBefore = g.battle.playerHp;
  for (let i = 0; i < boss.attackEvery; i++) afterMove(g, { type: 'draw' }, null);
  assert.equal(g.battle.playerHp, hpBefore, 'strike absorbed');
  assert.equal(g.battle.guarded, false, 'guard consumed');
});

test('Garde also blocks the boss ability, not just the damage', () => {
  const g = battleGame('souveraine');
  const boss = getBoss('souveraine');
  useBattlePower(g, 'guard');
  const before = g.tableau.map((p) => p.length);
  for (let i = 0; i < boss.attackEvery; i++) afterMove(g, { type: 'draw' }, null);
  assert.deepEqual(g.tableau.map((p) => p.length), before, 'no flood while guarded');
});

test('Garde refuses to stack', () => {
  const g = battleGame();
  assert.equal(useBattlePower(g, 'guard').ok, true);
  g.battle.cooldowns.guard = 0; // pretend it is ready again
  assert.equal(useBattlePower(g, 'guard').ok, false, 'already guarding');
});

test('Concentration reveals hidden cards', () => {
  const g = battleGame();
  const hiddenBefore = g.tableau.flat().filter((c) => !c.faceUp).length;
  const res = useBattlePower(g, 'focus');
  assert.equal(res.ok, true);
  const hiddenAfter = g.tableau.flat().filter((c) => !c.faceUp).length;
  assert.ok(hiddenAfter < hiddenBefore);
});

test('Concentration refuses when nothing is hidden, and stays ready', () => {
  const g = battleGame();
  for (const pile of g.tableau) for (const c of pile) c.faceUp = true;
  const res = useBattlePower(g, 'focus');
  assert.equal(res.ok, false);
  assert.equal(isReady(g.battle, 'focus'), true, 'a misfire must not cost a cooldown');
});

test('Déferlante sends playable cards home and chains damage', () => {
  const g = battleGame();
  // guarantee something is playable
  g.tableau[0].push(card('A', 'hearts'));
  g.tableau[1].push(card('A', 'spades'));
  const before = g.battle.bossHp;
  const res = useBattlePower(g, 'surge');
  assert.equal(res.ok, true);
  assert.ok(res.sent >= 2, `sent ${res.sent}`);
  assert.ok(g.battle.bossHp < before);
  assert.ok(g.foundations.flat().length >= 2);
});

test('Déferlante cascades: an ace unlocks the two above it', () => {
  const g = battleGame();
  g.foundations = [[], [], [], []];
  g.tableau = [[card('A', 'hearts')], [card('2', 'hearts')], [card('3', 'hearts')], [], [], [], []];
  const res = useBattlePower(g, 'surge');
  assert.equal(res.ok, true);
  assert.equal(g.foundations[1].length, 3, 'A, 2 and 3 all went home');
});

test('Déferlante refuses when nothing is playable', () => {
  const g = battleGame();
  g.tableau = [[], [], [], [], [], [], []];
  g.waste = [];
  const res = useBattlePower(g, 'surge');
  assert.equal(res.ok, false);
  assert.equal(isReady(g.battle, 'surge'), true, 'no cooldown on a misfire');
});

// ---------- infinite stock ----------

test('the stock refills from the waste so a battle never stalls', () => {
  const g = battleGame();
  g.waste = g.stock.splice(0);
  assert.equal(g.stock.length, 0);
  const refilled = refillStock(g, makeRng('refill'));
  assert.equal(refilled, true);
  assert.ok(g.stock.length > 0);
  assert.equal(g.waste.length, 0);
});

test('refillStock does nothing outside a battle', () => {
  const g = createGame('plain::0', makeRng('plain::0'), composeRules([]));
  g.waste = g.stock.splice(0);
  assert.equal(refillStock(g, makeRng('x')), false);
});

// ---------- persistence ----------

test('a battle survives a save/load round-trip', () => {
  const g = battleGame('horloger');
  afterMove(g, { type: 'tab-to-foundation', from: 0 }, card('A', 'hearts'));
  const back = deserialize(JSON.parse(JSON.stringify(serialize(g))));
  assert.equal(back.battle.bossId, 'horloger');
  assert.equal(back.battle.bossHp, g.battle.bossHp);
  assert.equal(back.battle.combo, g.battle.combo);
});

test('undo restores the battle state too', () => {
  const g = battleGame();
  const hpBefore = g.battle.bossHp;
  // a real move pushes history, then the battle advances
  const m = legalMoves(g).find((x) => x.type === 'draw');
  applyMove(g, m);
  afterMove(g, { type: 'tab-to-foundation', from: 0 }, card('K', 'spades'));
  assert.ok(g.battle.bossHp < hpBefore);
  undoMove(g);
  assert.equal(g.battle.bossHp, hpBefore, 'damage rolled back with the move');
});
