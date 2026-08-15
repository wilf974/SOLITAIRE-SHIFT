// src/engine/battle.js — the Battle mode: solitaire as a duel.
//
// Pure and DOM-free like the rest of the engine, so every rule here is unit
// tested without a browser.
//
// The loop:
//   * Foundation plays are ATTACKS. Damage scales with the rank sent home and
//     with your combo, so playing well hits harder than playing often.
//   * The boss attacks back on a timer measured in MOVES, not seconds — the
//     game stays turn-based and never punishes thinking.
//   * Your combo grows with each consecutive foundation play and resets when
//     you spend a whole "beat" without landing one. That is the tension:
//     hunting a big chain versus taking the safe card now.
//   * The stock is infinite: it reshuffles rather than running dry, so a
//     battle ends by damage, never by being stuck.
//
// Balance lives in BOSSES; the mechanics below take no opinion on numbers.

import { rankOf, legalMoves, top } from './game.js';
import { initCooldowns } from './battle-powers.js';

/** Damage a foundation play deals, before combo. Aces are cheap, Kings hurt. */
export function baseDamage(card) {
  const r = rankOf(card);
  if (r === 1) return 4;           // Ace: easy to place, small reward
  if (r >= 11) return 10 + r;      // J/Q/K: hard-won, 21..23
  return 4 + r;                    // 2..10: 6..14
}

/** Multiplier from the current combo. Grows fast, then flattens. */
export function comboMultiplier(combo) {
  if (combo <= 1) return 1;
  return Math.min(3, 1 + (combo - 1) * 0.25);
}

/** Full damage for one foundation play at a given combo. */
export function attackDamage(card, combo) {
  return Math.round(baseDamage(card) * comboMultiplier(combo));
}

/** The bosses, in order. Each is a different pressure, not just more numbers. */
export const BOSSES = [
  {
    id: 'gardien',
    name: 'Le Gardien',
    icon: 'boss-gardien',
    emoji: '🗿',
    taunt: 'Rien ne passe. Rien ne bouge.',
    hp: 220,
    playerHp: 100,
    attackEvery: 7,     // boss strikes every N of your moves
    attackDamage: 8,
    ability: null,
    reward: 120,
  },
  {
    id: 'illusionniste',
    name: "L'Illusionniste",
    icon: 'boss-illusionniste',
    emoji: '🎭',
    taunt: 'Regardez bien. Ou plutôt, ne regardez pas.',
    hp: 300,
    playerHp: 100,
    attackEvery: 6,
    attackDamage: 9,
    // hides a face-up tableau card when it strikes
    ability: 'veil',
    reward: 180,
  },
  {
    id: 'horloger',
    name: "L'Horloger",
    icon: 'boss-horloger',
    emoji: '⏰',
    taunt: 'Chaque seconde vous appartient de moins en moins.',
    hp: 380,
    playerHp: 100,
    attackEvery: 5,
    attackDamage: 10,
    // breaks your combo when it strikes
    ability: 'break',
    reward: 250,
  },
  {
    id: 'souveraine',
    name: 'La Souveraine',
    icon: 'boss-souveraine',
    emoji: '👑',
    taunt: 'Vous jouez sur ma table.',
    hp: 500,
    playerHp: 100,
    attackEvery: 5,
    attackDamage: 12,
    // buries the tableau: deals a card onto every column
    ability: 'flood',
    reward: 400,
  },
];

const BY_ID = new Map(BOSSES.map((b) => [b.id, b]));
export function getBoss(id) { return BY_ID.get(id) || BOSSES[0]; }

/** Fresh battle state, attached to a game as `state.battle`. */
export function createBattle(bossId) {
  const boss = getBoss(bossId);
  return {
    bossId: boss.id,
    bossHp: boss.hp,
    bossMaxHp: boss.hp,
    playerHp: boss.playerHp,
    playerMaxHp: boss.playerHp,
    combo: 0,
    bestCombo: 0,
    sinceHit: 0,        // moves since your last foundation play
    sinceBossAttack: 0, // moves since the boss last struck
    damageDealt: 0,
    damageTaken: 0,
    over: false,
    won: false,
    guarded: false,     // Garde absorbs the next strike
    cooldowns: initCooldowns(),
    log: [],            // recent events, for the UI to animate
  };
}

/** How many moves before the boss's next strike. */
export function movesUntilAttack(battle) {
  const boss = getBoss(battle.bossId);
  return Math.max(0, boss.attackEvery - battle.sinceBossAttack);
}

function pushLog(battle, entry) {
  battle.log.push(entry);
  if (battle.log.length > 8) battle.log.shift();
}

/**
 * Advance the battle by one player move. Called AFTER the move is applied.
 * `move` is the move that was played; `card` is the card sent to a foundation
 * by that move, if any.
 *
 * Returns a summary of what happened, so the UI can animate it.
 */
export function afterMove(state, move, card) {
  const battle = state.battle;
  if (!battle || battle.over) return null;
  const boss = getBoss(battle.bossId);
  const events = [];

  const isAttack = move
    && (move.type === 'tab-to-foundation'
      || move.type === 'waste-to-foundation'
      || move.type === 'reserve-to-foundation');

  if (isAttack && card) {
    battle.combo += 1;
    battle.bestCombo = Math.max(battle.bestCombo, battle.combo);
    const dmg = attackDamage(card, battle.combo);
    battle.bossHp = Math.max(0, battle.bossHp - dmg);
    battle.damageDealt += dmg;
    battle.sinceHit = 0;
    events.push({ type: 'hit', damage: dmg, combo: battle.combo, cardId: card.id });
    pushLog(battle, `-${dmg}`);
  } else {
    battle.sinceHit += 1;
    // a whole beat with no foundation play breaks the chain
    if (battle.combo > 0 && battle.sinceHit >= 3) {
      events.push({ type: 'combo-lost', combo: battle.combo });
      battle.combo = 0;
    }
  }

  if (battle.bossHp <= 0) {
    battle.over = true;
    battle.won = true;
    events.push({ type: 'victory' });
    return { events, battle };
  }

  // the boss's turn
  battle.sinceBossAttack += 1;
  if (battle.sinceBossAttack >= boss.attackEvery) {
    battle.sinceBossAttack = 0;

    // Garde absorbs the whole strike, ability included — that is what makes
    // it worth a slot: it answers the special, not just the damage.
    if (battle.guarded) {
      battle.guarded = false;
      events.push({ type: 'guarded' });
      return { events, battle };
    }

    const dmg = boss.attackDamage;
    battle.playerHp = Math.max(0, battle.playerHp - dmg);
    battle.damageTaken += dmg;
    events.push({ type: 'boss-attack', damage: dmg, ability: boss.ability });

    if (boss.ability) applyBossAbility(state, boss.ability, events);

    if (battle.playerHp <= 0) {
      battle.over = true;
      battle.won = false;
      events.push({ type: 'defeat' });
    }
  }

  return { events, battle };
}

/** The boss's signature move, fired alongside its attack. */
function applyBossAbility(state, ability, events) {
  const battle = state.battle;
  switch (ability) {
    case 'break':
      if (battle.combo > 0) {
        events.push({ type: 'combo-broken', combo: battle.combo });
        battle.combo = 0;
      }
      break;

    case 'veil': {
      // turn one exposed tableau card face-down again
      const candidates = [];
      for (let c = 0; c < state.tableau.length; c++) {
        const pile = state.tableau[c];
        // never veil the only card in a column, and never veil a lone top card
        // that a player is mid-sequence on: pick from columns of 2+
        if (pile.length >= 2 && pile[pile.length - 1].faceUp) candidates.push(c);
      }
      if (candidates.length) {
        const col = candidates[state.moves % candidates.length]; // deterministic
        top(state.tableau[col]).faceUp = false;
        events.push({ type: 'veiled', col });
      }
      break;
    }

    case 'flood': {
      // deal one card onto every column, from the (infinite) stock
      let dealt = 0;
      for (let c = 0; c < state.tableau.length && state.stock.length; c++) {
        const card = state.stock.pop();
        card.faceUp = true;
        state.tableau[c].push(card);
        dealt++;
      }
      if (dealt) events.push({ type: 'flooded', count: dealt });
      break;
    }
  }
}

/**
 * Keep the stock from running out. A battle must end by damage, never by
 * being stuck, so the waste recycles automatically and — if even that is
 * empty — the foundations feed it back. Call after every move.
 */
export function refillStock(state, rng) {
  if (!state.battle || state.stock.length) return false;

  if (state.waste.length) {
    while (state.waste.length) {
      const c = state.waste.pop();
      c.faceUp = false;
      state.stock.push(c);
    }
    if (rng) rng.shuffle(state.stock);
    return true;
  }
  return false;
}

/** Is the player unable to act? Used to decide whether to force a refill. */
export function isBattleStuck(state) {
  return legalMoves(state).length === 0;
}
