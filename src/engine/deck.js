// src/engine/deck.js
// Card model + deck construction. Cards are plain objects for cheap serialization.

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const RED_SUITS = new Set(['hearts', 'diamonds']);

export function rankValue(rank) {
  return RANKS.indexOf(rank) + 1; // A=1 .. K=13
}

export function isRed(suit) {
  return RED_SUITS.has(suit);
}

export function cardKey(card) {
  return `${card.rank}${card.suit[0]}`;
}

/** Build a single fresh 52-card deck, ordered (not shuffled). */
export function freshDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ suit, rank, faceUp: false, id: `${rank}-${suit}` });
    }
  }
  return cards;
}

/** Build N combined decks (for variants needing more than 52). */
export function freshDecks(n = 1) {
  const cards = [];
  for (let d = 0; d < n; d++) {
    for (const c of freshDeck()) cards.push({ ...c, id: `${c.rank}-${c.suit}-${d}` });
  }
  return cards;
}

/** Seeded shuffle of a fresh 52-card deck. Returns a NEW array. */
export function dealDeck(seed, rng) {
  const deck = freshDeck();
  // give each card a unique stable id (rank-suit is unique within a single deck)
  rng.shuffle(deck);
  return deck;
}