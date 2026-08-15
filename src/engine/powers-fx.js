// src/engine/powers-fx.js — what each power actually does to a game state.
//
// Kept in the engine layer (pure, DOM-free, testable) so power effects can be
// unit-tested without a browser. Every effect returns a result object:
//   { ok: boolean, reason?: string, ...details }
// A failed effect must leave the state untouched, so the caller can refund
// the charge.

import { top, rankOf, foundationIndexFor, foundationFits, pushHistory, undo, legalMoves } from './game.js';

/** Reveal the deepest face-down tableau card. */
export function peek(state) {
  // deepest = the face-down card in the longest run of hidden cards
  let best = null;
  for (let c = 0; c < state.tableau.length; c++) {
    const pile = state.tableau[c];
    for (let i = 0; i < pile.length; i++) {
      if (!pile[i].faceUp) {
        const buried = pile.length - i; // how much sits on top of it
        if (!best || buried > best.buried) best = { col: c, index: i, buried };
        break; // only the topmost hidden card of each column matters
      }
    }
  }
  if (!best) return { ok: false, reason: 'Aucune carte cachée.' };
  pushHistory(state);
  const card = state.tableau[best.col][best.index];
  card.faceUp = true;
  card.peeked = true; // marker so the UI can highlight it
  return { ok: true, col: best.col, index: best.index, cardId: card.id };
}

/** Send an available Ace straight to its foundation. */
export function aceCall(state) {
  const candidates = [];
  for (let c = 0; c < state.tableau.length; c++) {
    const pile = state.tableau[c];
    for (let i = pile.length - 1; i >= 0; i--) {
      const card = pile[i];
      if (!card.faceUp) break;
      if (rankOf(card) === 1) candidates.push({ from: 'tableau', col: c, index: i, card });
    }
  }
  for (let i = 0; i < state.waste.length; i++) {
    if (rankOf(state.waste[i]) === 1) candidates.push({ from: 'waste', index: i, card: state.waste[i] });
  }
  // only Aces that the foundation will actually accept
  const usable = candidates.filter((x) => {
    const fi = foundationIndexFor(x.card);
    return fi >= 0 && foundationFits(state.rules, x.card, state.foundations[fi]);
  });
  if (!usable.length) return { ok: false, reason: 'Aucun As disponible.' };

  const pick = usable[0];
  pushHistory(state);
  if (pick.from === 'tableau') {
    // pull it out even if buried under face-up cards
    state.tableau[pick.col].splice(pick.index, 1);
    const pile = state.tableau[pick.col];
    const t = top(pile);
    if (t && !t.faceUp && state.rules.revealFlipped) t.faceUp = true;
  } else {
    state.waste.splice(pick.index, 1);
  }
  state.foundations[foundationIndexFor(pick.card)].push(pick.card);
  state.score += 10;
  state.won = state.foundations.every((f) => f.length === 13);
  return { ok: true, cardId: pick.card.id };
}

/** Shuffle the remaining stock. Needs an rng so it stays deterministic. */
export function reshuffle(state, rng) {
  if (state.stock.length < 2) return { ok: false, reason: 'Pioche trop courte.' };
  pushHistory(state);
  rng.shuffle(state.stock);
  return { ok: true, count: state.stock.length };
}

/** Move a card into the reserve slot, or return the reserved card to play. */
export function reserveStore(state, cardId) {
  if (state.reserve) return { ok: false, reason: 'Réserve déjà occupée.' };
  // only a face-up top card may be reserved
  for (let c = 0; c < state.tableau.length; c++) {
    const pile = state.tableau[c];
    const t = top(pile);
    if (t && t.id === cardId && t.faceUp) {
      pushHistory(state);
      state.reserve = pile.pop();
      const nt = top(pile);
      if (nt && !nt.faceUp && state.rules.revealFlipped) nt.faceUp = true;
      return { ok: true, cardId };
    }
  }
  const w = top(state.waste);
  if (w && w.id === cardId) {
    pushHistory(state);
    state.reserve = state.waste.pop();
    return { ok: true, cardId };
  }
  return { ok: false, reason: 'Choisissez une carte du dessus.' };
}

/** Is the reserved card placeable anywhere right now? */
export function reserveTargets(state) {
  if (!state.reserve) return [];
  const card = state.reserve;
  const out = [];
  const fi = foundationIndexFor(card);
  if (fi >= 0 && foundationFits(state.rules, card, state.foundations[fi])) out.push({ slot: 'f' + fi });
  return out;
}

/** Undo up to three moves in one go. */
export function undoBurst(state, n = 3) {
  let done = 0;
  for (let i = 0; i < n; i++) {
    if (!undo(state)) break;
    done++;
  }
  if (!done) return { ok: false, reason: 'Rien à annuler.' };
  return { ok: true, undone: done };
}

/** Grant extra time. The clock lives in the app, so this only reports the gift. */
export function timeGift(state, seconds = 45) {
  if (!state.timeLimitMs) return { ok: false, reason: 'Ce mode n’est pas chronométré.' };
  state.timeBonusMs = (state.timeBonusMs || 0) + seconds * 1000;
  return { ok: true, seconds };
}

/** Dispatch table used by the app. */
export const EFFECTS = {
  peek,
  'ace-call': aceCall,
  reshuffle,
  'free-cell': reserveStore,
  'undo-burst': undoBurst,
  'time-gift': timeGift,
};