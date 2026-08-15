// src/meta/powers.js — the power layer.
//
// Coins are earned by PLAYING. They buy charges of tactical powers that you
// spend during a hand. Nothing plays itself, and nothing is permanent:
//   * Every power costs a charge each time it is used, so there is no
//     permanent difficulty erosion and no power creep.
//   * Powers create decisions ("is this worth a charge?"), they do not
//     play the game for you.
//   * No premium currency, no purchase, no ad, no energy, no timer.
//
// `id`s are persisted in save files and must never change.
//
// Each power carries both an `icon` (generated art, used in the UI) and an
// `emoji` (the fallback, used if the art is missing — the game must always
// run without generated assets).

export const POWERS = [
  {
    id: 'peek',
    icon: 'power-peek',
    name: 'Clairvoyance',
    emoji: '👁️',
    desc: 'Révèle la carte face cachée la plus profonde.',
    hint: 'Retourne une carte cachée du tableau.',
    cost: 40,
  },
  {
    id: 'ace-call',
    icon: 'power-ace-call',
    name: "Appel d'As",
    emoji: '🎯',
    desc: 'Envoie un As disponible directement aux fondations.',
    hint: 'Trouve un As et le place.',
    cost: 90,
  },
  {
    id: 'reshuffle',
    icon: 'power-reshuffle',
    name: 'Rebattre',
    emoji: '🔀',
    desc: 'Mélange la pioche restante.',
    hint: "Change l'ordre de ce qui reste à piocher.",
    cost: 70,
  },
  {
    id: 'free-cell',
    icon: 'power-reserve',
    name: 'Réserve',
    emoji: '📥',
    desc: 'Met une carte de côté ; reposez-la quand vous voulez.',
    hint: 'Une case libre temporaire.',
    cost: 120,
  },
  {
    id: 'undo-burst',
    icon: 'power-undo',
    name: 'Remontée',
    emoji: '⏪',
    desc: 'Annule les trois derniers coups d’un seul geste.',
    hint: 'Trois annulations immédiates.',
    cost: 60,
  },
  {
    id: 'time-gift',
    icon: 'power-time',
    name: 'Sursis',
    emoji: '⏳',
    desc: 'Ajoute 45 secondes au chronomètre.',
    hint: 'Uniquement en mode Chrono.',
    cost: 80,
    timedOnly: true,
  },
];

const BY_ID = new Map(POWERS.map((p) => [p.id, p]));

export function getPower(id) {
  return BY_ID.get(id);
}

/** Default power state, merged into the profile. */
export function defaultPowers() {
  return {
    coins: 0,
    lifetimeCoins: 0,
    charges: {},     // powerId -> charges owned
    used: {},        // powerId -> lifetime uses (for stats)
  };
}

/** Coins awarded for a finished hand. */
export function coinsForResult(res) {
  const base = res.won
    ? 50 + Math.round((res.score || 0) * 0.4)
    : 6 + Math.round((res.foundationCards || 0) * 1.2);
  const streakBonus = res.won ? Math.min(60, (res.streak || 0) * 5) : 0;
  return Math.max(1, Math.round(base + streakBonus));
}

/** Charges currently owned for a power. */
export function chargesOf(pw, id) {
  return (pw.charges && pw.charges[id]) || 0;
}

/** Buy n charges of a power. Returns how many were actually bought. */
export function buyCharges(pw, powerId, n = 1) {
  const p = BY_ID.get(powerId);
  if (!p) return 0;
  let bought = 0;
  for (let i = 0; i < n; i++) {
    if (pw.coins < p.cost) break;
    pw.coins -= p.cost;
    pw.charges[p.id] = chargesOf(pw, p.id) + 1;
    bought++;
  }
  return bought;
}

/** Spend one charge. Returns true if a charge was available. */
export function spendCharge(pw, powerId) {
  if (chargesOf(pw, powerId) <= 0) return false;
  pw.charges[powerId] -= 1;
  pw.used[powerId] = (pw.used[powerId] || 0) + 1;
  return true;
}

/** Award coins for a hand (mutates). Returns the amount. */
export function awardCoins(pw, amount) {
  pw.coins += amount;
  pw.lifetimeCoins += amount;
  return amount;
}

/** Powers worth showing in the shop: everything, cheapest first. */
export function shopList() {
  return [...POWERS].sort((a, b) => a.cost - b.cost);
}

/** Compact number formatting: 0.1, 12, 1.2K, 3.4M … */
export function fmtCoins(n) {
  if (n > 0 && n < 10) {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  const v = Math.floor(n);
  if (v < 1000) return String(v);
  const units = ['K', 'M', 'B', 'T'];
  let u = -1, x = v;
  while (x >= 1000 && u < units.length - 1) { x /= 1000; u++; }
  return (x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : Math.floor(x)) + units[u];
}