// src/meta/idle.js — the idle layer.
//
// Design rules (deliberately non-predatory):
//   * Coins are earned ONLY by playing and by dealers you bought with coins.
//   * There is no premium currency, no purchase, no ad, no energy, no timer
//     that blocks play, and no FOMO. You can always play a full game for free.
//   * Offline earnings accrue while you're away and are simply handed to you.
//     Nothing decays, nothing expires, nothing is lost by not logging in.
//
// The loop: play solitaire -> earn coins -> hire dealers -> dealers play in the
// background and earn coins for you -> spend on upgrades that make BOTH the
// idle income and your own hands worth more.

export const OFFLINE_CAP_HOURS = 8; // generous, and stated plainly in the UI

/** Dealers: each produces coins per second. Cost scales geometrically. */
export const DEALERS = [
  { id: 'apprentice', name: 'Apprentice',   emoji: '🃏', desc: 'Shuffles slowly, means well.',            baseCost: 25,      rate: 0.1 },
  { id: 'croupier',   name: 'Croupier',     emoji: '🎩', desc: 'Crisp hands, crisper waistcoat.',         baseCost: 300,     rate: 1 },
  { id: 'hustler',    name: 'Card Hustler', emoji: '🕶️', desc: 'Never lost a deal. Allegedly.',           baseCost: 3200,    rate: 8 },
  { id: 'magician',   name: 'Magician',     emoji: '🪄', desc: 'The aces were up there the whole time.',  baseCost: 38000,   rate: 55 },
  { id: 'automaton',  name: 'Automaton',    emoji: '⚙️', desc: 'Clockwork fingers, infinite patience.',   baseCost: 450000,  rate: 380 },
  { id: 'oracle',     name: 'The Oracle',   emoji: '🔮', desc: 'Plays the deal before it is dealt.',      baseCost: 5600000, rate: 2600 },
];

/** Upgrades: permanent multipliers. Bought once each. */
export const UPGRADES = [
  { id: 'felt',     name: 'Velvet Felt',     emoji: '🟢', desc: 'All dealers earn ×2.',            cost: 1000,     mult: 2,  kind: 'idle' },
  { id: 'lamps',    name: 'Warm Lamps',      emoji: '💡', desc: 'All dealers earn ×2.',            cost: 25000,    mult: 2,  kind: 'idle' },
  { id: 'lounge',   name: 'The Lounge',      emoji: '🛋️', desc: 'All dealers earn ×3.',            cost: 600000,   mult: 3,  kind: 'idle' },
  { id: 'skylight', name: 'Skylight',        emoji: '🌤️', desc: 'All dealers earn ×3.',            cost: 12000000, mult: 3,  kind: 'idle' },
  { id: 'tips',     name: 'Generous Tips',   emoji: '🪙', desc: 'Your own wins pay ×2.',           cost: 4000,     mult: 2,  kind: 'hand' },
  { id: 'highroll', name: 'High Roller',     emoji: '💎', desc: 'Your own wins pay ×3.',           cost: 900000,   mult: 3,  kind: 'hand' },
];

/** Default idle state, merged into the profile. */
export function defaultIdle() {
  return {
    coins: 0,
    lifetimeCoins: 0,
    dealers: {},        // id -> count owned
    upgrades: [],       // ids bought
    lastTick: Date.now(),
    offlineClaimed: 0,
  };
}

/** Cost of the next copy of a dealer (geometric, the genre standard 1.15). */
export function dealerCost(dealer, owned) {
  return Math.ceil(dealer.baseCost * Math.pow(1.15, owned));
}

/** How many of `dealer` you can afford right now. */
export function affordable(dealer, owned, coins) {
  let n = 0, total = 0;
  for (;;) {
    const c = dealerCost(dealer, owned + n);
    if (total + c > coins || n >= 1000) break;
    total += c;
    n++;
  }
  return { count: n, total };
}

function multiplierFor(idle, kind) {
  let m = 1;
  for (const u of UPGRADES) {
    if (u.kind === kind && idle.upgrades.includes(u.id)) m *= u.mult;
  }
  return m;
}

/** Coins per second from all owned dealers, including upgrade multipliers. */
export function coinsPerSecond(idle) {
  let base = 0;
  for (const d of DEALERS) base += (idle.dealers[d.id] || 0) * d.rate;
  return base * multiplierFor(idle, 'idle');
}

/** Multiplier applied to coins earned by the player's own completed games. */
export function handMultiplier(idle) {
  return multiplierFor(idle, 'hand');
}

/** Coins awarded for one of the player's own finished games. */
export function coinsForResult(idle, res) {
  const base = res.won ? 40 + Math.round((res.score || 0) * 0.5) : 5 + Math.round((res.foundationCards || 0) * 0.8);
  return Math.max(1, Math.round(base * handMultiplier(idle)));
}

/**
 * Advance idle production to now. Returns coins earned since the last tick.
 * Capped at OFFLINE_CAP_HOURS so leaving the tab open vs closed is fair.
 */
export function tick(idle, now = Date.now()) {
  const last = idle.lastTick || now;
  let elapsedMs = Math.max(0, now - last);
  const capMs = OFFLINE_CAP_HOURS * 3600 * 1000;
  const capped = elapsedMs > capMs;
  if (capped) elapsedMs = capMs;
  const earned = coinsPerSecond(idle) * (elapsedMs / 1000);
  idle.lastTick = now;
  if (earned > 0) {
    idle.coins += earned;
    idle.lifetimeCoins += earned;
  }
  return { earned, elapsedMs, capped };
}

/** Buy n copies of a dealer. Returns how many were actually bought. */
export function buyDealer(idle, dealerId, n = 1) {
  const d = DEALERS.find((x) => x.id === dealerId);
  if (!d) return 0;
  let bought = 0;
  for (let i = 0; i < n; i++) {
    const owned = idle.dealers[d.id] || 0;
    const cost = dealerCost(d, owned);
    if (idle.coins < cost) break;
    idle.coins -= cost;
    idle.dealers[d.id] = owned + 1;
    bought++;
  }
  return bought;
}

/** Buy an upgrade. Returns true if purchased. */
export function buyUpgrade(idle, upgradeId) {
  const u = UPGRADES.find((x) => x.id === upgradeId);
  if (!u || idle.upgrades.includes(u.id) || idle.coins < u.cost) return false;
  idle.coins -= u.cost;
  idle.upgrades.push(u.id);
  return true;
}

/** Is a dealer visible yet? Shown once you're within reach of affording it. */
export function dealerUnlocked(idle, dealer) {
  if ((idle.dealers[dealer.id] || 0) > 0) return true;
  return idle.lifetimeCoins >= dealer.baseCost * 0.4;
}

/** Compact number formatting: 0.1, 12, 1.2K, 3.4M, 5.6B … */
export function fmtCoins(n) {
  // keep fractional rates readable instead of flooring them to "0"
  if (n > 0 && n < 10) {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  const v = Math.floor(n);
  if (v < 1000) return String(v);
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];
  let u = -1, x = v;
  while (x >= 1000 && u < units.length - 1) { x /= 1000; u++; }
  return (x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : Math.floor(x)) + units[u];
}

/** Human duration, for the offline-earnings message. */
export function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}min` : `${h}h`;
}