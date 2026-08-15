// src/engine/battle-powers.js — combat abilities, used only in Battle mode.
//
// These are deliberately NOT the coin-bought powers. Battle abilities cost no
// charges and cannot be stockpiled: each has a cooldown measured in moves, so
// the decision is "now or in four moves?" rather than "can I afford it?".
// That keeps Battle self-contained — a new player can fight a boss without
// having ground for coins first.

import { top, rankOf, foundationIndexFor, foundationFits } from './game.js';

export const BATTLE_POWERS = [
  {
    id: 'strike',
    name: 'Frappe',
    icon: 'battle-strike',
    emoji: '⚔️',
    desc: 'Inflige des dégâts directs, doublés par votre combo.',
    cooldown: 5,
  },
  {
    id: 'guard',
    name: 'Garde',
    icon: 'battle-guard',
    emoji: '🛡️',
    desc: 'Bloque la prochaine attaque du boss.',
    cooldown: 7,
  },
  {
    id: 'focus',
    name: 'Concentration',
    icon: 'battle-focus',
    emoji: '🌀',
    desc: 'Révèle deux cartes cachées et garde votre combo intact.',
    cooldown: 6,
  },
  {
    id: 'surge',
    name: 'Déferlante',
    icon: 'battle-surge',
    emoji: '⚡',
    desc: 'Envoie toutes les cartes jouables aux fondations.',
    cooldown: 10,
  },
];

const BY_ID = new Map(BATTLE_POWERS.map((p) => [p.id, p]));
export function getBattlePower(id) { return BY_ID.get(id); }

/** Cooldown state, held on the battle. */
export function initCooldowns() {
  const cd = {};
  for (const p of BATTLE_POWERS) cd[p.id] = 0;
  return cd;
}

/** Tick every cooldown down by one move. */
export function tickCooldowns(battle) {
  if (!battle.cooldowns) battle.cooldowns = initCooldowns();
  for (const k of Object.keys(battle.cooldowns)) {
    if (battle.cooldowns[k] > 0) battle.cooldowns[k] -= 1;
  }
}

export function isReady(battle, id) {
  return !battle.cooldowns || (battle.cooldowns[id] || 0) <= 0;
}

/**
 * Fire a battle ability. Returns { ok, reason?, ...details }.
 * A failed ability must leave the state untouched and must NOT start a
 * cooldown, so a misfire never costs the player a turn.
 */
export function useBattlePower(state, id) {
  const battle = state.battle;
  const power = BY_ID.get(id);
  if (!battle || battle.over) return { ok: false, reason: 'Combat terminé.' };
  if (!power) return { ok: false, reason: 'Pouvoir inconnu.' };
  if (!isReady(battle, id)) {
    return { ok: false, reason: `Encore ${battle.cooldowns[id]} coup(s).` };
  }

  const res = EFFECTS[id](state, battle);
  if (!res.ok) return res;

  if (!battle.cooldowns) battle.cooldowns = initCooldowns();
  battle.cooldowns[id] = power.cooldown;
  return res;
}

const EFFECTS = {
  /** Direct damage, scaled by the combo you have built. */
  strike(state, battle) {
    const dmg = Math.round(18 * (1 + battle.combo * 0.2));
    battle.bossHp = Math.max(0, battle.bossHp - dmg);
    battle.damageDealt += dmg;
    if (battle.bossHp <= 0) { battle.over = true; battle.won = true; }
    return { ok: true, damage: dmg, defeated: battle.won };
  },

  /** Absorb the next boss attack. */
  guard(state, battle) {
    if (battle.guarded) return { ok: false, reason: 'Garde déjà active.' };
    battle.guarded = true;
    return { ok: true };
  },

  /** Reveal two hidden cards, and protect the combo from decaying this beat. */
  focus(state, battle) {
    let revealed = 0;
    for (let c = 0; c < state.tableau.length && revealed < 2; c++) {
      const pile = state.tableau[c];
      for (let i = pile.length - 1; i >= 0; i--) {
        if (!pile[i].faceUp) { pile[i].faceUp = true; revealed++; break; }
      }
    }
    if (!revealed) return { ok: false, reason: 'Aucune carte cachée.' };
    battle.sinceHit = 0; // the chain survives this beat
    return { ok: true, revealed };
  },

  /** Send every currently playable card home, chaining the combo as it goes. */
  surge(state, battle) {
    let sent = 0, damage = 0;
    // repeat until nothing else can go home: a 5 unlocks a 6, and so on
    for (let pass = 0; pass < 13 && !battle.over; pass++) {
      let movedThisPass = false;

      for (let c = 0; c < state.tableau.length; c++) {
        const card = top(state.tableau[c]);
        if (!card || !card.faceUp) continue;
        const fi = foundationIndexFor(card);
        if (fi < 0 || !foundationFits(state.rules, card, state.foundations[fi])) continue;
        state.tableau[c].pop();
        state.foundations[fi].push(card);
        const nt = top(state.tableau[c]);
        if (nt && !nt.faceUp && state.rules.revealFlipped) nt.faceUp = true;
        battle.combo += 1;
        battle.bestCombo = Math.max(battle.bestCombo, battle.combo);
        const d = Math.round((4 + rankOf(card)) * Math.min(3, 1 + (battle.combo - 1) * 0.25));
        battle.bossHp = Math.max(0, battle.bossHp - d);
        damage += d; sent++; movedThisPass = true;
        if (battle.bossHp <= 0) { battle.over = true; battle.won = true; break; }
      }

      const w = top(state.waste);
      if (!battle.over && w) {
        const fi = foundationIndexFor(w);
        if (fi >= 0 && foundationFits(state.rules, w, state.foundations[fi])) {
          state.waste.pop();
          state.foundations[fi].push(w);
          battle.combo += 1;
          battle.bestCombo = Math.max(battle.bestCombo, battle.combo);
          const d = Math.round((4 + rankOf(w)) * Math.min(3, 1 + (battle.combo - 1) * 0.25));
          battle.bossHp = Math.max(0, battle.bossHp - d);
          damage += d; sent++; movedThisPass = true;
          if (battle.bossHp <= 0) { battle.over = true; battle.won = true; }
        }
      }

      if (!movedThisPass) break;
    }

    if (!sent) return { ok: false, reason: 'Aucune carte jouable.' };
    battle.damageDealt += damage;
    battle.sinceHit = 0;
    return { ok: true, sent, damage, defeated: battle.won };
  },
};
