// src/engine/game.js
// Pure Klondike engine. No DOM, no I/O. Fully deterministic given seed + rules.
// A "card" is a plain object { suit, rank, faceUp, id }.

import { freshDeck, rankValue, isRed, SUITS } from './deck.js';

export const DEFAULT_RULES = Object.freeze({
  drawCount: 1, // cards flipped from stock to waste per draw
  maxStockPasses: Infinity, // times waste may be recycled into stock
  emptyColumnRule: 'king', // 'king' | 'any' | 'none' — what starts a new tableau column
  foundationStart: 'ace', // 'ace' | 'king'
  foundationDirection: 'asc', // 'asc' (A..K) | 'desc' (K..A)
  // 'desc-altcolor' (standard) | 'desc-samecolor' | 'desc-samesuit' |
  // 'desc-altsuit' | 'desc-anycolor' | the same five with 'asc-'
  tableauOrder: 'desc-altcolor',
  tableauWrap: false, // ranks wrap K->A on tableau builds
  moveSequences: true, // may move a valid run of >1 card from tableau
  revealFlipped: true, // auto-flip exposed face-down tableau card
  undoAllowed: true,
  maxUndos: Infinity,
  drawToTableauOnly: false, // waste cards only go to tableau (variant)
  powersAllowed: true, // may the player spend power charges this deal?
  score: 'standard', // scoring model name
});

const SUIT_INDEX = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };

// ---------- creation ----------

export function createGame(seed, rng, rules = {}) {
  const r = { ...DEFAULT_RULES, ...rules };
  const deck = freshDeck();
  rng.shuffle(deck);

  const tableau = [[], [], [], [], [], [], []];
  // deal: column i gets i+1 cards, only the last face up
  let di = 0;
  for (let col = 0; col < 7; col++) {
    for (let k = 0; k <= col; k++) {
      const card = deck[di++];
      card.faceUp = k === col; // last card face up
      tableau[col].push(card);
    }
  }
  const stock = deck.slice(di); // remaining face down
  for (const c of stock) c.faceUp = false;
  const waste = [];
  const foundations = [[], [], [], []];

  return {
    seed,
    rules: r,
    tableau,
    stock,
    waste,
    foundations,
    moves: 0,
    undosUsed: 0,
    stockPasses: 0,
    score: 0,
    history: [],
    won: false,
    startTime: null,
    elapsedMs: 0,
    reserve: null,        // the Réserve power's held card
    timeLimitMs: r.timeLimitMs || 0, // >0 in timed modes
    timeBonusMs: 0,       // granted by the Sursis power
    tideEvery: r.tideEvery || 0,     // Marée: deal a row every N moves
    tideCount: 0,
    battle: null,         // Battle mode duel state, when in that mode
  };
}

// ---------- helpers ----------

export function top(arr) {
  return arr.length ? arr[arr.length - 1] : null;
}

export function rankOf(card) {
  return rankValue(card.rank);
}

export function altColor(a, b) {
  return isRed(a.suit) !== isRed(b.suit);
}

export function sameColor(a, b) {
  return isRed(a.suit) === isRed(b.suit);
}

/** Can `card` be placed on top of `onto` under the tableau ordering rule? */
export function tableauFits(rules, card, onto) {
  if (!onto) {
    // empty column handled separately
    return rules.emptyColumnRule !== 'none';
  }
  const dir = rules.tableauOrder;
  const wantDesc = dir.startsWith('desc');
  const wantAsc = dir.startsWith('asc');
  const diff = rankOf(card) - rankOf(onto);
  const rankOk = wantDesc ? diff === -1 : wantAsc ? diff === 1 : false;
  if (!rankOk && rules.tableauWrap) {
    // K(13) can sit on A(1) when wrapping desc; A on K when asc
    if (wantDesc && rankOf(onto) === 1 && rankOf(card) === 13) return colorOk(rules, card, onto);
    if (wantAsc && rankOf(onto) === 13 && rankOf(card) === 1) return colorOk(rules, card, onto);
    return false;
  }
  if (!rankOk) return false;
  return colorOk(rules, card, onto);
}

/**
 * Does the pair satisfy the tableau's colour/suit constraint?
 * The suffix of `tableauOrder` selects the rule:
 *   -anycolor  → anything goes (easiest)
 *   -altcolor  → red on black / black on red (standard Klondike)
 *   -samecolor → both red or both black (NOT the same suit)
 *   -samesuit  → hearts on hearts, spades on spades (hardest)
 *   -altsuit   → any suit except the one you're landing on
 */
function colorOk(rules, card, onto) {
  const order = rules.tableauOrder || '';
  if (order.endsWith('-anycolor')) return true;
  if (order.endsWith('-samesuit')) return card.suit === onto.suit;
  if (order.endsWith('-altsuit')) return card.suit !== onto.suit;
  if (order.endsWith('-samecolor')) return sameColor(card, onto);
  return altColor(card, onto); // alt-color variants (the default)
}

/** Can `card` start an empty tableau column? */
export function canStartEmptyColumn(rules, card) {
  switch (rules.emptyColumnRule) {
    case 'none': return false;
    case 'any': return true;
    case 'king': return rankOf(card) === 13;
    case 'ace': return rankOf(card) === 1; // used by the inverted-foundation rules
    default: return false;
  }
}

/** Can `card` go onto foundation `f` (array) under direction rules? Enforces single-suit piles. */
export function foundationFits(rules, card, f) {
  if (f.length === 0) {
    if (rules.foundationStart === 'king') return rankOf(card) === 13;
    return rankOf(card) === 1; // ace
  }
  const onto = top(f);
  if (card.suit !== onto.suit) return false; // foundations are single-suit
  if (rules.foundationDirection === 'asc') return rankOf(card) === rankOf(onto) + 1;
  if (rules.foundationDirection === 'desc') return rankOf(card) === rankOf(onto) - 1;
  return false;
}

/** Which foundation index (0..3) corresponds to this card's suit, or -1 if suits are free-form. */
export function foundationIndexFor(card) {
  return SUIT_INDEX[card.suit];
}

// ---------- legal moves ----------

/**
 * Generate all legal moves from the current state.
 * Move shapes:
 *   { type: 'draw' }
 *   { type: 'recycle' }
 *   { type: 'tab-to-foundation', from: col, count: 1 }
 *   { type: 'waste-to-foundation' }
 *   { type: 'tab-to-tab', from: col, to: col, count: n }
 *   { type: 'waste-to-tab', to: col }
 */
export function legalMoves(state) {
  const moves = [];
  const r = state.rules;

  // stock -> waste (draw)
  if (state.stock.length) {
    moves.push({ type: 'draw' });
  } else if (state.waste.length && r.maxStockPasses > state.stockPasses) {
    moves.push({ type: 'recycle' });
  }

  // tableau tops -> foundation
  for (let col = 0; col < 7; col++) {
    const pile = state.tableau[col];
    if (!pile.length) continue;
    const card = top(pile);
    if (!card.faceUp) continue;
    const fi = foundationIndexFor(card);
    if (fi >= 0 && foundationFits(r, card, state.foundations[fi])) {
      moves.push({ type: 'tab-to-foundation', from: col });
    }
  }

  // waste top -> foundation
  if (state.waste.length) {
    const card = top(state.waste);
    const fi = foundationIndexFor(card);
    if (fi >= 0 && foundationFits(r, card, state.foundations[fi])) {
      moves.push({ type: 'waste-to-foundation' });
    }
  }

  // tableau -> tableau (with sequences)
  for (let from = 0; from < 7; from++) {
    const pile = state.tableau[from];
    if (!pile.length) continue;
    // find the first face-up card index — sequences start there
    let firstUp = pile.length;
    for (let i = 0; i < pile.length; i++) if (pile[i].faceUp) { firstUp = i; break; }
    if (firstUp === pile.length) continue;
    // a valid movable run is a descending alternating run from some index to end
    const runStarts = validRunStarts(r, pile, firstUp);
    for (const start of runStarts) {
      const movingCard = pile[start];
      for (let to = 0; to < 7; to++) {
        if (to === from) continue;
        const dest = state.tableau[to];
        if (!dest.length) {
          // a sequence may move onto an empty column only if its leading card qualifies
          if (canStartEmptyColumn(r, movingCard)) {
            moves.push({ type: 'tab-to-tab', from, to, count: pile.length - start });
          }
        } else {
          if (tableauFits(r, movingCard, top(dest))) {
            moves.push({ type: 'tab-to-tab', from, to, count: pile.length - start });
          }
        }
      }
    }
  }

  // waste -> tableau
  if (state.waste.length) {
    const card = top(state.waste);
    for (let to = 0; to < 7; to++) {
      const dest = state.tableau[to];
      if (!dest.length) {
        if (canStartEmptyColumn(r, card)) moves.push({ type: 'waste-to-tab', to });
      } else if (tableauFits(r, card, top(dest))) {
        moves.push({ type: 'waste-to-tab', to });
      }
    }
  }

  // reserve (Réserve power) -> foundation / tableau
  if (state.reserve) {
    const card = state.reserve;
    const fi = foundationIndexFor(card);
    if (fi >= 0 && foundationFits(r, card, state.foundations[fi])) {
      moves.push({ type: 'reserve-to-foundation' });
    }
    for (let to = 0; to < 7; to++) {
      const dest = state.tableau[to];
      if (!dest.length) {
        if (canStartEmptyColumn(r, card)) moves.push({ type: 'reserve-to-tab', to });
      } else if (tableauFits(r, card, top(dest))) {
        moves.push({ type: 'reserve-to-tab', to });
      }
    }
  }

  return moves;
}

/** Indices `start` (from firstUp) from which pile[start..end] is a valid movable run. */
function validRunStarts(rules, pile, firstUp) {
  const starts = [pile.length - 1]; // single top card always movable
  if (!rules.moveSequences) return starts;
  // walk back from end while the run remains valid (descending + color rule)
  for (let i = pile.length - 1; i > firstUp; i--) {
    const above = pile[i - 1];
    const below = pile[i];
    if (!tableauFits(rules, below, above)) break; // below placed on above?
    // below should be one lower / opposite color than above for a valid descending run
    starts.push(i - 1);
  }
  return starts;
}

// ---------- applying moves ----------

function snapshot(state) {
  return {
    tableau: state.tableau.map((p) => p.map((c) => ({ ...c }))),
    stock: state.stock.map((c) => ({ ...c })),
    waste: state.waste.map((c) => ({ ...c })),
    foundations: state.foundations.map((p) => p.map((c) => ({ ...c }))),
    moves: state.moves,
    undosUsed: state.undosUsed,
    stockPasses: state.stockPasses,
    score: state.score,
    won: state.won,
    reserve: state.reserve ? { ...state.reserve } : null,
    tideCount: state.tideCount || 0,
    // deep enough: the battle holds only numbers, flags and a short log
    battle: state.battle ? JSON.parse(JSON.stringify(state.battle)) : null,
  };
}

export function pushHistory(state) {
  if (!state.rules.undoAllowed) return;
  state.history.push(snapshot(state));
  if (state.history.length > 256) state.history.shift();
}

export function undo(state) {
  if (!state.rules.undoAllowed || !state.history.length) return false;
  if (state.undosUsed >= state.rules.maxUndos) return false;
  const snap = state.history.pop();
  state.tableau = snap.tableau;
  state.stock = snap.stock;
  state.waste = snap.waste;
  state.foundations = snap.foundations;
  state.moves = snap.moves;
  state.undosUsed = snap.undosUsed + 1;
  state.stockPasses = snap.stockPasses;
  state.score = snap.score;
  state.won = snap.won;
  state.reserve = snap.reserve ? { ...snap.reserve } : null;
  state.tideCount = snap.tideCount || 0;
  state.battle = snap.battle ? JSON.parse(JSON.stringify(snap.battle)) : null;
  return true;
}

export function applyMove(state, move) {
  const r = state.rules;
  pushHistory(state);
  let scored = 0;

  switch (move.type) {
    case 'draw': {
      const n = Math.min(r.drawCount, state.stock.length);
      for (let i = 0; i < n; i++) {
        const c = state.stock.pop();
        c.faceUp = true;
        state.waste.push(c);
      }
      break;
    }
    case 'recycle': {
      // move all waste back to stock, face down, reversed
      while (state.waste.length) {
        const c = state.waste.pop();
        c.faceUp = false;
        state.stock.push(c);
      }
      state.stockPasses += 1;
      break;
    }
    case 'tab-to-foundation': {
      const pile = state.tableau[move.from];
      const card = pile.pop();
      const fi = foundationIndexFor(card);
      state.foundations[fi].push(card);
      scored += 10;
      maybeReveal(state, move.from);
      break;
    }
    case 'waste-to-foundation': {
      const card = state.waste.pop();
      const fi = foundationIndexFor(card);
      state.foundations[fi].push(card);
      scored += 10;
      break;
    }
    case 'tab-to-tab': {
      const from = state.tableau[move.from];
      const moved = from.splice(from.length - move.count, move.count);
      state.tableau[move.to].push(...moved);
      maybeReveal(state, move.from);
      break;
    }
    case 'waste-to-tab': {
      const card = state.waste.pop();
      state.tableau[move.to].push(card);
      break;
    }
    case 'reserve-to-foundation': {
      if (!state.reserve) { state.history.pop(); return false; }
      const card = state.reserve;
      const fi = foundationIndexFor(card);
      if (fi < 0 || !foundationFits(r, card, state.foundations[fi])) { state.history.pop(); return false; }
      state.reserve = null;
      state.foundations[fi].push(card);
      scored += 10;
      break;
    }
    case 'reserve-to-tab': {
      if (!state.reserve) { state.history.pop(); return false; }
      const card = state.reserve;
      const dest = state.tableau[move.to];
      const fits = dest.length ? tableauFits(r, card, top(dest)) : canStartEmptyColumn(r, card);
      if (!fits) { state.history.pop(); return false; }
      state.reserve = null;
      dest.push(card);
      break;
    }
    default:
      return false;
  }

  state.moves += 1;
  maybeTide(state);
  applyScore(state, move, scored);
  state.won = checkWin(state);
  return true;
}

/**
 * "Marée" mode: every N moves the sea rises — one card from the stock is dealt
 * face-up onto each tableau column. The board fights back, so you must clear
 * faster than it fills. Does nothing when tideEvery is 0 (every other mode).
 */
function maybeTide(state) {
  const every = state.tideEvery || 0;
  if (!every || !state.stock.length) return;
  state.tideCount = (state.tideCount || 0) + 1;
  if (state.tideCount < every) return;
  state.tideCount = 0;
  for (let c = 0; c < state.tableau.length && state.stock.length; c++) {
    const card = state.stock.pop();
    card.faceUp = true;
    state.tableau[c].push(card);
  }
  state.tideRose = true; // one-shot flag the UI clears after animating
}

function maybeReveal(state, col) {
  const pile = state.tableau[col];
  if (!pile.length) return;
  const top1 = top(pile);
  if (!top1.faceUp && state.rules.revealFlipped) {
    top1.faceUp = true;
    state.score += 5; // reveal bonus
  }
}

function applyScore(state, move, base) {
  // standard-ish Klondike scoring
  state.score += base;
  if (move.type === 'recycle') state.score = Math.max(0, state.score - 5);
}

export function checkWin(state) {
  return state.foundations.every((f) => f.length === 13);
}

/** Is the state stuck (no legal moves and not won)? */
export function isStuck(state) {
  if (state.won) return false;
  return legalMoves(state).length === 0;
}

/** Count cards remaining off foundation. */
export function remaining(state) {
  let n = 0;
  for (const p of state.tableau) n += p.length;
  n += state.stock.length + state.waste.length;
  return n;
}

/** Locate a card by id: returns { kind: 'tableau'|'waste'|'stock'|'foundation', index, pile, col, faceUp } or null. */
export function locateCard(state, id) {
  for (let c = 0; c < state.tableau.length; c++) {
    const pile = state.tableau[c];
    for (let i = 0; i < pile.length; i++) if (pile[i].id === id) return { kind: 'tableau', col: c, index: i, pile, card: pile[i] };
  }
  if (state.reserve && state.reserve.id === id) return { kind: 'reserve', index: 0, pile: [state.reserve], card: state.reserve };
  for (let i = 0; i < state.waste.length; i++) if (state.waste[i].id === id) return { kind: 'waste', index: i, pile: state.waste, card: state.waste[i] };
  for (let i = 0; i < state.stock.length; i++) if (state.stock[i].id === id) return { kind: 'stock', index: i, pile: state.stock, card: state.stock[i] };
  for (let f = 0; f < state.foundations.length; f++)
    for (let i = 0; i < state.foundations[f].length; i++) if (state.foundations[f][i].id === id) return { kind: 'foundation', col: f, index: i, pile: state.foundations[f], card: state.foundations[f][i] };
  return null;
}

/** The movable run starting at a tableau card index (list of cards), or single card from waste/foundation top. */
export function movableRun(state, id) {
  const loc = locateCard(state, id);
  if (!loc) return null;
  if (loc.kind === 'reserve') return [loc.card];
  if (loc.kind === 'waste') return loc.index === state.waste.length - 1 ? [loc.card] : null;
  if (loc.kind === 'foundation') return loc.index === state.pile.length - 1 ? [loc.card] : null;
  if (loc.kind === 'tableau') {
    const pile = state.tableau[loc.col];
    if (loc.index === pile.length - 1) return [loc.card]; // single top always movable
    // verify the run from loc.index..end is a valid descending alt-color (etc) run
    if (!state.rules.moveSequences) return null;
    for (let i = loc.index; i < pile.length - 1; i++) {
      if (!tableauFits(state.rules, pile[i + 1], pile[i])) return null;
    }
    return pile.slice(loc.index);
  }
  return null;
}