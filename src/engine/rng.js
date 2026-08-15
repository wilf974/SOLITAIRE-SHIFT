// src/engine/rng.js
// Deterministic, seedable PRNG. No Math.random anywhere in the engine.
// mulberry32 — fast, good distribution, tiny, fully deterministic.

/** Create a seeded PRNG function. Returns a function producing floats in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string seed (e.g. "daily-2026-08-15") into a 32-bit int. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Build an RNG context: { next, int(n), pick(arr), shuffle(arr) } from a seed. */
export function makeRng(seed) {
  const seedInt = typeof seed === 'number' ? seed >>> 0 : hashSeed(String(seed));
  const next = mulberry32(seedInt);
  const api = {
    seed: seedInt,
    next,
    /** uniform integer in [0, n) */
    int(n) {
      return Math.floor(next() * n);
    },
    /** uniform integer in [min, max] inclusive */
    range(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** pick a random element */
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    /** in-place Fisher–Yates shuffle (returns the same array reference) */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    },
  };
  return api;
}