// src/engine/serialize.js — deterministic state serialization for persistence/resume.
// Snapshots the full playable state (not history entries, to keep it compact).

export function serialize(state) {
  return {
    seed: state.seed,
    rules: state.rules,
    tableau: state.tableau,
    stock: state.stock,
    waste: state.waste,
    foundations: state.foundations,
    moves: state.moves,
    undosUsed: state.undosUsed,
    stockPasses: state.stockPasses,
    score: state.score,
    won: state.won,
    // history stored as compact snapshots; capped to last 64 for resume
    history: state.history.slice(-64),
  };
}

export function deserialize(snap) {
  return {
    seed: snap.seed,
    rules: snap.rules,
    tableau: snap.tableau,
    stock: snap.stock,
    waste: snap.waste,
    foundations: snap.foundations,
    moves: snap.moves || 0,
    undosUsed: snap.undosUsed || 0,
    stockPasses: snap.stockPasses || 0,
    score: snap.score || 0,
    won: !!snap.won,
    history: snap.history || [],
    startTime: null,
    elapsedMs: snap.elapsedMs || 0,
  };
}