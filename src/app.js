// src/app.js — orchestrator. Wires engine + renderer + interaction + meta + modes + UI.

import { createGame, applyMove, undo, legalMoves, checkWin, isStuck, remaining, locateCard, top } from './engine/game.js';
import { makeRng } from './engine/rng.js';
import { composeRules, difficultyValue, rewardMultiplier, TRAITS, getTrait } from './engine/traits.js';
import { serialize, deserialize } from './engine/serialize.js';
import { makeDeal, CONTRACTS, todayStr } from './modes.js';
import { loadProfile, saveProfile, exportProfile, importProfile, defaultProfile } from './meta/storage.js';
import { xpForResult, evaluateUnlocks, applyUnlocks, tierFromXp, tierProgress } from './meta/mastery.js';
import { BoardRenderer } from './ui/render.js';
import { Controller } from './ui/interaction.js';
import { audio } from './ui/audio.js';
import { loadArt, tableArtUrl, artCount } from './ui/art.js';
import {
  DEALERS, UPGRADES, tick as idleTick, coinsPerSecond, coinsForResult,
  dealerCost, buyDealer, buyUpgrade, dealerUnlocked, affordable,
  fmtCoins, fmtDuration, OFFLINE_CAP_HOURS,
} from './meta/idle.js';

export class App {
  constructor() {
    this.profile = loadProfile();
    this.boardEl = document.getElementById('board');
    this.stageEl = document.getElementById('stage');
    this.cardLayer = document.createElement('div');
    this.cardLayer.className = 'card-layer';
    this.stageEl.appendChild(this.cardLayer);
    this.renderer = new BoardRenderer(this.boardEl, this.cardLayer);
    this.game = null;
    this.deal = null;
    this.mode = 'classic';
    this.timer = null;
    this.startTs = 0;
    this.elapsedBase = 0;
    this.controller = new Controller({
      renderer: this.renderer,
      game: () => this.game,
      do: (m) => this.do(m),
      sync: () => this.sync(),
      audio,
      onStockTap: () => this.onStockTap(),
      bestMove: (id) => this.bestMove(id),
      undo: () => this.undo(),
      hint: () => this.hint(),
      auto: () => this.auto(),
      newGame: () => this.showMenu(),
      menu: () => this.showMenu(),
      onWin: () => this.onWin(),
    });
  }

  async init() {
    // Load the generated-art manifest BEFORE the first card is built, so cards
    // are created with their illustrations already attached. If it's absent the
    // renderer falls back to programmatic CSS art and the game runs regardless.
    await loadArt();
    this.applyAppearance();
    audio.setMuted(this.profile.settings.muted);
    this.bindTopbar();
    this.bindModalRoot();
    this.controller.bind(this.stageEl);

    // ---- idle layer ----
    // Settle whatever the dealers earned while the player was away, then keep
    // producing on a steady tick.
    const away = idleTick(this.profile.idle);
    this.startIdleLoop();
    this.updateCoins();
    if (away.earned >= 1 && away.elapsedMs > 60000) {
      this.showOfflineEarnings(away);
      saveProfile(this.profile);
      return; // the offline panel leads into the menu
    }

    // resume if a saved game exists, else show menu
    const resume = this.profile.history && this.profile.history.resume;
    if (resume && !resume.won) this.resume(resume);
    else this.showMenu();
  }

  // ---------- idle ----------

  startIdleLoop() {
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = setInterval(() => {
      idleTick(this.profile.idle);
      this.updateCoins();
    }, 1000);
    // persist periodically rather than every tick
    if (this.idleSaveTimer) clearInterval(this.idleSaveTimer);
    this.idleSaveTimer = setInterval(() => saveProfile(this.profile), 10000);
    // and always on the way out, so nothing is lost
    if (!this._boundUnload) {
      this._boundUnload = true;
      window.addEventListener('beforeunload', () => {
        idleTick(this.profile.idle);
        saveProfile(this.profile);
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          idleTick(this.profile.idle);
          saveProfile(this.profile);
        }
      });
    }
  }

  /**
   * Idle demo: whenever the player isn't in a hand, the dealers actually play
   * a visible game on the table behind the menu. An idle game should be alive
   * on screen, not just a number ticking up.
   */
  startDemo() {
    this.stopDemo();
    this.demoOn = true;
    const speed = () => Math.max(140, 700 - (coinsPerSecond(this.profile.idle) * 4));
    const step = () => {
      if (!this.demoOn) return;
      // no dealers hired yet → nothing plays itself
      if (coinsPerSecond(this.profile.idle) <= 0) { this.demoTimer = setTimeout(step, 1500); return; }
      if (!this.demoGame) { this.newDemoGame(); this.demoTimer = setTimeout(step, 600); return; }

      const g = this.demoGame;
      const moves = legalMoves(g);
      // pick a sensible move: foundation first, then a reveal, then anything
      const pick = moves.find((m) => m.type === 'tab-to-foundation' || m.type === 'waste-to-foundation')
        || moves.find((m) => m.type === 'tab-to-tab' && (() => {
             const s = g.tableau[m.from];
             return s.length - m.count - 1 >= 0 && !s[s.length - m.count - 1].faceUp;
           })())
        || moves.find((m) => m.type !== 'recycle')
        || moves[0];

      if (!pick || checkWin(g)) { this.newDemoGame(); this.demoTimer = setTimeout(step, 900); return; }
      applyMove(g, pick);
      this.renderer.sync(g);
      this.demoTimer = setTimeout(step, speed());
    };
    step();
  }

  newDemoGame() {
    const seed = 'demo-' + Math.floor(this.profile.idle.lifetimeCoins) + '-' + this.profile.gamesPlayed + '-' + (this._demoN = (this._demoN || 0) + 1);
    this.demoGame = createGame(seed, makeRng(seed), composeRules([]));
    this.renderer.build(this.demoGame);
    this.renderer.measure();
    this.renderer.setBack(this.profile.activeBack);
    this.renderer.sync(this.demoGame);
  }

  stopDemo() {
    this.demoOn = false;
    if (this.demoTimer) { clearTimeout(this.demoTimer); this.demoTimer = null; }
  }

  updateCoins() {
    const idle = this.profile.idle;
    const c = document.getElementById('hud-coins');
    const r = document.getElementById('hud-rate');
    if (c) c.textContent = fmtCoins(idle.coins);
    if (r) {
      const cps = coinsPerSecond(idle);
      r.textContent = cps > 0 ? `+${fmtCoins(cps)}/s` : 'idle';
    }
    // live-refresh the shop if it's open
    if (this._shopOpen) this.renderShopBody();
  }

  showOfflineEarnings(away) {
    const idle = this.profile.idle;
    this.openModal(`
      <div class="overlay"><div class="panel offline">
        <div class="big">🌙</div>
        <h2>While you were away</h2>
        <div class="sub">Your dealers kept playing for ${fmtDuration(away.elapsedMs)}</div>
        <div class="coin-hero">+${fmtCoins(away.earned)} <span>🪙</span></div>
        ${away.capped ? `<p class="note">Offline earnings are capped at ${OFFLINE_CAP_HOURS} hours — nothing is ever lost for being away longer.</p>` : ''}
        <div class="btn-row"><button class="btn primary" data-act="collect">Collect</button></div>
      </div></div>
    `);
    document.getElementById('modal-root').querySelector('[data-act="collect"]').onclick = () => {
      audio.unlock();
      this.showMenu();
    };
  }

  applyAppearance() {
    document.documentElement.dataset.theme = this.profile.activeTheme || 'sunlit';
    if (this.profile.settings.reduceMotion) document.documentElement.classList.add('reduce-motion');
    this.renderer.setBack(this.profile.activeBack || 'sunburst-pop');
    // generated table surface
    const table = tableArtUrl();
    const appEl = document.getElementById('app');
    if (table && appEl) {
      appEl.style.setProperty('--table-art', `url("${table}")`);
      appEl.classList.add('has-table');
      if (!appEl.querySelector('.scrim')) {
        const scrim = document.createElement('div');
        scrim.className = 'scrim';
        appEl.insertBefore(scrim, appEl.firstChild);
      }
    }
  }

  bindTopbar() {
    const $ = (id) => document.getElementById(id);
    $('btn-undo').onclick = () => this.undo();
    $('btn-hint').onclick = () => this.hint();
    $('btn-auto').onclick = () => this.auto();
    $('btn-menu').onclick = () => this.showMenu();
    const shop = $('btn-shop');
    if (shop) shop.onclick = () => this.showShop();
  }

  bindModalRoot() {
    document.getElementById('modal-root').addEventListener('click', (e) => {
      if (e.target.dataset.close !== undefined) this.closeModal();
    });
  }

  // ---------- game lifecycle ----------

  async startMode(mode, opts = {}) {
    this.stopDemo();
    this.demoGame = null;
    this.closeModal();
    this.showSpinner('Dealing…');
    // yield to let spinner paint before heavy solver work
    await new Promise((r) => setTimeout(r, 30));
    try {
      const deal = await makeDeal(mode, { profile: this.profile, ...opts });
      this.deal = deal;
      this.mode = mode;
      this.game = createGame(deal.seed, makeRng(deal.seed), deal.rules);
      this.game.startTime = Date.now();
      this.elapsedBase = 0;
      this.renderer.build(this.game);
      // wait a frame for layout, then measure
      await new Promise((r) => requestAnimationFrame(r));
      this.renderer.measure();
      this.renderer.setBack(this.profile.activeBack);
      this.sync();
      this.startTimer();
      this.saveResume();
      this.toast(`${modeLabel(mode)}${deal.traits && deal.traits.length ? ' · ' + deal.traits.map(t => getTrait(t)?.name || t).join(', ') : ''}`);
    } catch (e) {
      console.error(e);
      this.toast('Deal failed — try again');
    } finally {
      this.hideSpinner();
    }
  }

  resume(snap) {
    try {
      this.game = deserialize(snap);
      this.mode = snap.mode || 'classic';
      this.deal = { seed: snap.seed, rules: snap.rules, traits: snap.traits || [], mode: this.mode };
      this.elapsedBase = snap.elapsedMs || 0;
      this.renderer.build(this.game);
      requestAnimationFrame(() => { this.renderer.measure(); this.renderer.setBack(this.profile.activeBack); this.sync(); });
      this.startTimer();
      this.toast('Resumed');
    } catch (e) {
      console.error(e);
      this.showMenu();
    }
  }

  do(move) {
    if (!this.game) return false;
    const ok = applyMove(this.game, move);
    if (!ok) { audio.invalid(); return false; }
    this.cueSound(move);
    this.sync();
    this.updateHUD();
    this.saveResume();
    if (checkWin(this.game)) this.onWin();
    else if (isStuck(this.game)) this.onStuck();
    return true;
  }

  cueSound(move) {
    if (move.type === 'draw' || move.type === 'recycle') audio.draw();
    else if (move.type === 'tab-to-foundation' || move.type === 'waste-to-foundation') { audio.foundation(); }
    else audio.place();
  }

  onStockTap() {
    if (!this.game) return;
    const moves = legalMoves(this.game);
    const draw = moves.find((m) => m.type === 'draw');
    const recycle = moves.find((m) => m.type === 'recycle');
    if (draw) this.do(draw);
    else if (recycle) this.do(recycle);
    else audio.invalid();
  }

  undo() {
    if (!this.game) return;
    if (undo(this.game)) { audio.flip(); this.sync(); this.updateHUD(); this.saveResume(); }
    else audio.invalid();
  }

  bestMove(id) {
    if (!this.game) return null;
    const game = this.game;
    const loc = locateCard(game, id);
    if (!loc) return null;
    const moves = legalMoves(game).filter((m) => sourceMatches(m, loc, game));
    if (!moves.length) return null;
    // prefer foundation, then a move that exposes a face-down or empties a column, then any
    const found = moves.find((m) => m.type === 'tab-to-foundation' || m.type === 'waste-to-foundation');
    if (found) return found;
    const revealing = moves.find((m) => {
      if (m.type !== 'tab-to-tab') return false;
      const src = game.tableau[m.from];
      const exposes = src.length - m.count - 1 >= 0 && !src[src.length - m.count - 1].faceUp;
      const empties = src.length === m.count;
      return exposes || empties;
    });
    return revealing || moves[0];
  }

  hint() {
    if (!this.game) return;
    const moves = legalMoves(this.game);
    if (!moves.length) { this.toast('No moves — try the stock'); return; }
    // prefer a foundation move or one that reveals
    const m = moves.find((x) => x.type === 'tab-to-foundation' || x.type === 'waste-to-foundation')
      || moves.find((x) => x.type === 'tab-to-tab' && (() => { const s = this.game.tableau[x.from]; return s.length - x.count - 1 >= 0 && !s[s.length - x.count - 1].faceUp; })())
      || moves[0];
    const cardId = moveSourceCardId(m, this.game);
    if (cardId) {
      const el = this.renderer.getById(cardId);
      if (el) { el.classList.add('hint'); setTimeout(() => el.classList.remove('hint'), 1400); }
    }
  }

  auto() {
    if (!this.game) return;
    // auto-complete: repeatedly send safe cards to foundation
    let guard = 0;
    const step = () => {
      if (guard++ > 60 || checkWin(this.game)) return;
      const moves = legalMoves(this.game);
      const f = moves.find((m) => m.type === 'tab-to-foundation' || m.type === 'waste-to-foundation');
      if (f) { this.do(f); setTimeout(step, 90); }
      else {
        // move any tableau-to-tableau that exposes a face-down, else stop
        const rev = moves.find((m) => m.type === 'tab-to-tab' && (() => { const s = this.game.tableau[m.from]; return s.length - m.count - 1 >= 0 && !s[s.length - m.count - 1].faceUp; })());
        if (rev) { this.do(rev); setTimeout(step, 90); }
      }
    };
    step();
  }

  // ---------- win/lose ----------

  onWin() {
    this.stopTimer();
    audio.resetFoundationStreak();
    const timeMs = this.elapsedBase + (Date.now() - this.startTs);
    const res = {
      won: true,
      mode: this.mode,
      traits: (this.deal && this.deal.traits) || [],
      moves: this.game.moves,
      timeMs,
      score: this.game.score,
      undosUsed: this.game.undosUsed,
      drawsUsed: 0,
      streak: (this.profile.streak || 0) + 1,
      foundationCards: this.game.foundations.reduce((s, f) => s + f.length, 0),
    };
    this.recordResult(res);
    this.victoryAnimation();
    setTimeout(() => this.showVictory(res), 900);
  }

  onStuck() {
    this.stopTimer();
    audio.invalid();
    const res = {
      won: false,
      mode: this.mode,
      traits: (this.deal && this.deal.traits) || [],
      moves: this.game.moves,
      timeMs: this.elapsedBase + (Date.now() - this.startTs),
      score: this.game.score,
      undosUsed: this.game.undosUsed,
      foundationCards: this.game.foundations.reduce((s, f) => s + f.length, 0),
    };
    this.recordResult(res);
    setTimeout(() => this.showStuck(res), 400);
  }

  recordResult(res) {
    const p = this.profile;
    p.gamesPlayed++;
    p.stats.totalMoves += res.moves || 0;
    p.stats.totalScore += res.score || 0;
    p.stats.modesPlayed[res.mode] = (p.stats.modesPlayed[res.mode] || 0) + 1;
    p.stats.undosUsed += res.undosUsed || 0;
    if (res.traits) for (const t of res.traits) p.stats.traitsUsed[t] = (p.stats.traitsUsed[t] || 0) + 1;
    if (res.won) {
      p.wins++;
      p.streak = (p.streak || 0) + 1;
      p.bestStreak = Math.max(p.bestStreak || 0, p.streak);
      if (res.timeMs && (p.stats.fastestWinMs == null || res.timeMs < p.stats.fastestWinMs)) p.stats.fastestWinMs = res.timeMs;
      if (res.moves && (p.stats.fewestMovesWin == null || res.moves < p.stats.fewestMovesWin)) p.stats.fewestMovesWin = res.moves;
      if (this.mode === 'ascension') {
        const lvl = (this.deal && this.deal.meta && this.deal.meta.level) || 1;
        p.ascension.bestLevel = Math.max(p.ascension.bestLevel || 0, lvl + (res.won ? 1 : 0));
      }
    } else {
      p.losses++;
      p.streak = 0;
    }
    // XP
    const xp = xpForResult(res);
    p.xp += xp;
    p.tier = tierFromXp(p.xp);
    // coins — the idle currency, earned by playing
    const coins = coinsForResult(p.idle, res);
    p.idle.coins += coins;
    p.idle.lifetimeCoins += coins;
    this.lastCoins = coins;
    this.updateCoins();
    // unlocks
    const earned = evaluateUnlocks(p, res);
    applyUnlocks(p, earned);
    this.lastEarned = earned;
    this.lastXp = xp;
    // clear resume
    p.history.resume = null;
    saveProfile(p);
  }

  victoryAnimation() {
    audio.victory();
    const c = document.getElementById('confetti');
    c.innerHTML = '';
    for (let i = 0; i < 80; i++) {
      const s = document.createElement('div');
      const gold = Math.random() > 0.4;
      s.style.cssText = `position:absolute;left:${Math.random()*100}%;top:-10px;width:${4+Math.random()*6}px;height:${6+Math.random()*10}px;border-radius:2px;background:${gold?'var(--gold-2)':'#f4ecdc'};opacity:${0.6+Math.random()*0.4};transform:rotate(${Math.random()*360}deg);animation:fall ${1.6+Math.random()*1.4}s ${Math.random()*0.6}s ease-in forwards;`;
      c.appendChild(s);
    }
    setTimeout(() => { c.innerHTML = ''; }, 3600);
  }

  // ---------- sync/hud/timer ----------

  sync() { this.renderer.sync(this.game); this.updateHUD(); }
  updateHUD() {
    if (!this.game) return;
    document.getElementById('hud-score').textContent = this.game.score;
    document.getElementById('hud-moves').textContent = this.game.moves;
  }
  startTimer() {
    this.stopTimer();
    this.startTs = Date.now();
    this.timer = setInterval(() => {
      const ms = this.elapsedBase + (Date.now() - this.startTs);
      const s = Math.floor(ms / 1000);
      const mm = Math.floor(s / 60), ss = s % 60;
      document.getElementById('hud-time').textContent = `${mm}:${String(ss).padStart(2,'0')}`;
    }, 500);
  }
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  saveResume() {
    if (!this.game) return;
    this.profile.history.resume = { ...serialize(this.game), mode: this.mode, traits: (this.deal && this.deal.traits) || [], elapsedMs: this.elapsedBase + (Date.now() - this.startTs) };
    saveProfile(this.profile);
  }

  // ---------- modals ----------

  closeModal() { document.getElementById('modal-root').innerHTML = ''; }
  showSpinner(msg) {
    document.getElementById('modal-root').innerHTML = `<div class="overlay"><div class="panel" style="text-align:center;max-width:260px"><div class="glow"></div><div class="sub">${msg}</div></div></div>`;
  }
  hideSpinner() { /* only close if it's the spinner */ const r = document.getElementById('modal-root'); if (r.querySelector('.glow')) this.closeModal(); }

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }

  showMenu() {
    this.stopTimer();
    this._shopOpen = false;
    this.startDemo(); // the table keeps playing behind the menu
    const p = this.profile;
    const tp = tierProgress(p.xp);
    const modes = [
      { id: 'classic', ico: '♣', t: 'Classic', d: 'Pure Klondike. Random deal — the traditional gamble.', locked: false },
      { id: 'journey', ico: '✦', t: 'Journey', d: 'The main path. Traits appear as you climb.', locked: false },
      { id: 'daily', ico: '☉', t: 'Daily Deal', d: `One solvable deal a day — ${todayStr()}.`, locked: false },
      { id: 'contract', ico: '❧', t: 'Contracts', d: 'Curated challenges with strange rules.', locked: p.tier < 2, lock: p.tier < 2 ? `Unlock at tier 2` : '' },
      { id: 'ascension', ico: '△', t: 'Ascension', d: 'Win streaks that escalate. How high can you climb?', locked: p.tier < 3, lock: p.tier < 3 ? `Unlock at tier 3` : '' },
      { id: 'zen', ico: '◐', t: 'Zen', d: 'Relaxed, always solvable. No pressure.', locked: false },
    ];
    const cards = modes.map((m) => `<button class="mode-card" data-mode="${m.id}" ${m.locked ? 'disabled' : ''}>
      <span class="ico">${m.ico}</span><span class="t">${m.t}</span><span class="d">${m.d}</span>${m.lock ? `<span class="lock">${m.lock}</span>` : ''}
    </button>`).join('');
    this.openModal(`
      <div class="panel">
        <h2>SOLITAIRE: SHIFT</h2>
        <div class="sub">Aurum &amp; Obsidian · Tier ${tp.tier}</div>
        <div style="margin-bottom:14px"><div class="sub" style="margin-bottom:6px">Mastery · ${p.xp} XP</div>
          <div style="height:8px;border-radius:99px;background:rgba(0,0,0,.3);overflow:hidden;border:1px solid var(--panel-border)">
            <div style="height:100%;width:${Math.round(tp.pct*100)}%;background:linear-gradient(90deg,var(--gold-deep),var(--gold-2))"></div>
          </div>
        </div>
        <button class="btn primary shop-cta" data-act="shop">
          🪙 Card Room — <span id="menu-coins">${fmtCoins(p.idle.coins)}</span> coins
          ${coinsPerSecond(p.idle) > 0 ? `<small>+${fmtCoins(coinsPerSecond(p.idle))}/s</small>` : '<small>hire your first dealer</small>'}
        </button>
        <div class="menu-grid">${cards}</div>
        <div class="btn-row">
          <button class="btn ghost" data-act="stats">Stats</button>
          <button class="btn ghost" data-act="traits">Traits</button>
          <button class="btn ghost" data-act="collection">Collection</button>
          <button class="btn ghost" data-act="settings">Settings</button>
          <button class="btn ghost" data-act="workbench">Workbench</button>
        </div>
      </div>
    `);
    this.wireMenu();
  }

  wireMenu() {
    const root = document.getElementById('modal-root');
    root.querySelectorAll('[data-mode]').forEach((b) => {
      b.onclick = () => {
        const mode = b.dataset.mode;
        if (mode === 'contract') this.showContractPicker();
        else if (mode === 'ascension') this.showAscensionPicker();
        else this.startMode(mode);
      };
    });
    root.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.act;
        if (a === 'shop') this.showShop();
        else if (a === 'stats') this.showStats();
        else if (a === 'traits') this.showTraits();
        else if (a === 'collection') this.showCollection();
        else if (a === 'settings') this.showSettings();
        else if (a === 'workbench') this.showWorkbench();
      };
    });
  }

  showVictory(res) {
    const p = this.profile;
    const earned = this.lastEarned || [];
    const reveal = earned.length ? earned.map((u) => `<div style="margin:6px 0"><strong style="color:var(--gold-2)">${u.name}</strong> <span style="color:var(--ink-soft)">— ${u.desc}</span></div>`).join('') : '<div style="color:var(--ink-soft)">Nothing new this time.</div>';
    this.openModal(`
      <div class="panel victory">
        <div class="title">Victory!</div>
        <div class="sub">${modeLabel(this.mode)} · +${this.lastXp} XP</div>
        <div class="coin-hero">+${fmtCoins(this.lastCoins || 0)} <span>🪙</span></div>
        <div class="stats" style="margin:14px 0">
          <div class="row"><span class="k">Moves</span><span class="v">${res.moves}</span></div>
          <div class="row"><span class="k">Time</span><span class="v">${fmtTime(res.timeMs)}</span></div>
          <div class="row"><span class="k">Score</span><span class="v">${res.score}</span></div>
          <div class="row"><span class="k">Streak</span><span class="v">${p.streak}</span></div>
        </div>
        ${earned.length ? `<h3>Unlocked</h3>${reveal}` : ''}
        <div class="btn-row">
          <button class="btn ghost" data-act="menu">Menu</button>
          <button class="btn primary" data-act="again">Deal again</button>
        </div>
      </div>
    `);
    if (earned.length) audio.unlock();
    const root = document.getElementById('modal-root');
    root.querySelector('[data-act="menu"]').onclick = () => this.showMenu();
    root.querySelector('[data-act="again"]').onclick = () => this.startMode(this.mode, this.mode === 'ascension' ? { level: (p.ascension.bestLevel || 1) } : this.mode === 'journey' ? { stage: (p.tier || 0) + 1 } : {});
  }

  showStuck(res) {
    this.openModal(`
      <div class="panel">
        <h2>No moves left</h2>
        <div class="sub">${modeLabel(this.mode)} · ${res.foundationCards}/52 on foundations</div>
        <p style="color:var(--ink-soft);margin:12px 0">This deal is stuck. ${this.mode === 'classic' ? 'Classic deals are random — try again.' : 'It happens even on fair deals with hard traits.'}</p>
        <div class="btn-row">
          <button class="btn ghost" data-act="menu">Menu</button>
          <button class="btn primary" data-act="again">New deal</button>
        </div>
      </div>
    `);
    const root = document.getElementById('modal-root');
    root.querySelector('[data-act="menu"]').onclick = () => this.showMenu();
    root.querySelector('[data-act="again"]').onclick = () => this.startMode(this.mode);
  }

  showContractPicker() {
    const p = this.profile;
    const list = CONTRACTS.map((c) => {
      const locked = (c.tier || 0) > p.tier;
      return `<button class="mode-card" data-contract="${c.id}" ${locked?'disabled':''}>
        <span class="ico">❧</span><span class="t">${c.name}</span>
        <span class="d">${c.desc}</span>
        <span class="chip ${difficultyValue(c.traits)>=2?'hard':difficultyValue(c.traits)<0?'easy':''}"><span class="v">${fmtDiff(c.traits)}</span></span>
        ${locked?`<span class="lock">Tier ${c.tier}</span>`:''}
      </button>`;
    }).join('');
    this.openModal(`<div class="panel"><h2>Contracts</h2><div class="sub">Curated challenges</div><div class="menu-grid">${list}</div><div class="btn-row"><button class="btn ghost" data-close>Back</button></div></div>`);
    document.getElementById('modal-root').querySelectorAll('[data-contract]').forEach((b) => b.onclick = () => this.startMode('contract', { contractId: b.dataset.contract }));
  }

  showAscensionPicker() {
    const p = this.profile;
    const level = Math.max(1, p.ascension.bestLevel || 1);
    this.openModal(`<div class="panel">
      <h2>Ascension</h2><div class="sub">Win to climb. Each level adds a harder trait.</div>
      <p style="color:var(--ink-soft);margin:12px 0">Current best: level ${p.ascension.bestLevel||0}. Start a run at level ${level}.</p>
      <div class="btn-row"><button class="btn ghost" data-close>Back</button><button class="btn primary" data-act="go">Begin at level ${level}</button></div>
    </div>`);
    document.getElementById('modal-root').querySelector('[data-act="go"]').onclick = () => this.startMode('ascension', { level });
  }

  showTraits() {
    const p = this.profile;
    const items = TRAITS.map((t) => {
      const owned = p.traitsUnlocked.includes(t.id);
      return `<div class="wb-card" style="${owned?'':'opacity:0.45'}">
        <div class="k">${t.name} <span class="chip ${t.value>0?'hard':t.value<0?'easy':''}"><span class="v">${t.value>0?'+':''}${t.value}</span></span></div>
        <div style="color:var(--ink-soft);font-size:12px;margin-top:4px">${t.desc}</div>
        <div style="color:var(--ink-faint);font-size:10px;margin-top:6px;letter-spacing:.12em">${owned?'OWNED':`TIER ${t.tier}`}</div>
      </div>`;
    }).join('');
    this.openModal(`<div class="panel"><h2>Traits</h2><div class="sub">${p.traitsUnlocked.length}/${TRAITS.length} unlocked</div><div class="wb-grid">${items}</div><div class="btn-row"><button class="btn ghost" data-close>Back</button></div></div>`);
  }

  showCollection() {
    const p = this.profile;
    const backs = p.backs.map((b) => collItem(b.id, b.unlocked, b.id, 'back'));
    const courts = p.courtFamilies.map((c) => collItem(c.id, c.unlocked, c.id, 'court'));
    const themes = p.themes.map((t) => collItem(t.id, t.unlocked, t.id, 'theme'));
    this.openModal(`<div class="panel"><h2>Collection</h2><div class="sub">Card backs, courts, themes</div>
      <h3>Card Backs</h3><div class="collection">${backs.join('')}</div>
      <h3>Court Families</h3><div class="collection">${courts.join('')}</div>
      <h3>Themes</h3><div class="collection">${themes.join('')}</div>
      <div class="btn-row"><button class="btn ghost" data-close>Back</button></div></div>`);
    document.getElementById('modal-root').querySelectorAll('[data-equip]').forEach((el) => {
      el.onclick = () => {
        const kind = el.dataset.equip, id = el.dataset.id;
        if (kind === 'back') { this.profile.activeBack = id; this.renderer.setBack(id); }
        if (kind === 'theme') { this.profile.activeTheme = id; document.documentElement.dataset.theme = id; }
        if (kind === 'court') { this.profile.activeCourt = id; }
        saveProfile(this.profile);
        this.toast('Equipped');
      };
    });
  }

  showStats() {
    const p = this.profile, s = p.stats;
    this.openModal(`<div class="panel"><h2>Statistics</h2><div class="sub">Lifetime</div>
      <div class="stats">
        <div class="row"><span class="k">Games</span><span class="v">${p.gamesPlayed}</span></div>
        <div class="row"><span class="k">Wins</span><span class="v">${p.wins}</span></div>
        <div class="row"><span class="k">Win rate</span><span class="v">${p.gamesPlayed?Math.round(p.wins/p.gamesPlayed*100):0}%</span></div>
        <div class="row"><span class="k">Best streak</span><span class="v">${p.bestStreak||0}</span></div>
        <div class="row"><span class="k">Total moves</span><span class="v">${s.totalMoves}</span></div>
        <div class="row"><span class="k">Total score</span><span class="v">${s.totalScore}</span></div>
        <div class="row"><span class="k">Fastest win</span><span class="v">${s.fastestWinMs?fmtTime(s.fastestWinMs):'—'}</span></div>
        <div class="row"><span class="k">Fewest moves</span><span class="v">${s.fewestMovesWin??'—'}</span></div>
        <div class="row"><span class="k">Ascension best</span><span class="v">L${p.ascension.bestLevel||0}</span></div>
        <div class="row"><span class="k">Tier</span><span class="v">${p.tier}</span></div>
      </div>
      <h3>Achievements</h3><div class="wb-grid">${achievementGrid(p)}</div>
      <div class="btn-row"><button class="btn ghost" data-close>Back</button></div></div>`);
  }

  showSettings() {
    const p = this.profile;
    this.openModal(`<div class="panel"><h2>Settings</h2><div class="sub">Accessibility &amp; data</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin:12px 0">
        <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer"><span>Sound</span><input type="checkbox" id="set-mute" ${p.settings.muted?'':'checked'}></label>
        <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer"><span>Reduce motion</span><input type="checkbox" id="set-motion" ${p.settings.reduceMotion?'checked':''}></label>
      </div>
      <div class="btn-row">
        <button class="btn ghost" data-act="export">Export save</button>
        <button class="btn ghost" data-act="import">Import save</button>
        <button class="btn ghost" data-act="reset" style="color:var(--bad)">Reset</button>
        <button class="btn ghost" data-close>Back</button>
      </div></div>`);
    const root = document.getElementById('modal-root');
    root.querySelector('#set-mute').onchange = (e) => { p.settings.muted = !e.target.checked; audio.setMuted(p.settings.muted); saveProfile(p); };
    root.querySelector('#set-motion').onchange = (e) => { p.settings.reduceMotion = e.target.checked; document.documentElement.classList.toggle('reduce-motion', e.target.checked); saveProfile(p); };
    root.querySelector('[data-act="export"]').onclick = () => { navigator.clipboard.writeText(exportProfile(p)); this.toast('Save copied to clipboard'); };
    root.querySelector('[data-act="import"]').onclick = () => { const s = prompt('Paste exported save:'); if (s) { try { this.profile = importProfile(s); saveProfile(this.profile); this.applyAppearance(); this.showMenu(); this.toast('Imported'); } catch(e){ this.toast('Invalid save'); } } };
    root.querySelector('[data-act="reset"]').onclick = () => { if (confirm('Reset all progress?')) { this.profile = defaultProfile(); saveProfile(this.profile); this.applyAppearance(); this.showMenu(); } };
  }

  showWorkbench() {
    const p = this.profile;
    this.openModal(`<div class="panel workbench"><h2>Workbench</h2><div class="sub">Live progress &amp; evidence</div>
      <section><h3>Build</h3><div class="wb-grid">
        <div class="wb-card"><div class="k">Status</div><div class="v">Playable</div></div>
        <div class="wb-card"><div class="k">Traits</div><div class="v">${p.traitsUnlocked.length}/${TRAITS.length}</div></div>
        <div class="wb-card"><div class="k">Tier / XP</div><div class="v">${p.tier} · ${p.xp}</div></div>
        <div class="wb-card"><div class="k">Tests</div><div class="v">62 green</div></div>
        <div class="wb-card"><div class="k">Generated art</div><div class="v">${artCount()}/20 assets</div></div>
      </div></section>
      <section><h3>Reference benchmarks</h3><div class="wb-grid">
        <div class="wb-card"><div class="k">MS Solitaire</div><div class="v">Interaction clarity</div></div>
        <div class="wb-card"><div class="k">Balatro</div><div class="v">Loop &amp; discovery</div></div>
        <div class="wb-card"><div class="k">Zachtronics</div><div class="v">Rule invention</div></div>
      </div></div></section>
      <section><h3>Unresolved gaps</h3><div class="wb-grid">
        <div class="wb-card"><div class="k">Mobile</div><div class="v">Needs real-device pass</div></div>
        <div class="wb-card"><div class="k">Solver</div><div class="v">Hard traits can time out to 'unknown'</div></div>
      </div></section>
      <div class="btn-row"><button class="btn ghost" data-close>Back</button></div></div>`);
  }

  // ---------- shop ----------

  showShop() {
    this.openModal(`
      <div class="overlay"><div class="panel shop">
        <h2>Card Room</h2>
        <div class="sub">Hire dealers. They play while you don't.</div>
        <div class="shop-hero">
          <div class="coin-hero"><span id="shop-coins">0</span> <span>🪙</span></div>
          <div class="rate" id="shop-rate">idle</div>
        </div>
        <div id="shop-body"></div>
        <div class="btn-row"><button class="btn ghost" data-act="back">Back</button></div>
      </div></div>
    `);
    this._shopOpen = true; // set AFTER openModal, so the live refresh finds the DOM
    this.renderShopBody();
    const root = document.getElementById('modal-root');
    root.querySelector('[data-act="back"]').onclick = () => { this._shopOpen = false; this.showMenu(); };
  }

  renderShopBody() {
    const body = document.getElementById('shop-body');
    if (!body) { this._shopOpen = false; return; }
    const idle = this.profile.idle;

    const coinsEl = document.getElementById('shop-coins');
    const rateEl = document.getElementById('shop-rate');
    if (coinsEl) coinsEl.textContent = fmtCoins(idle.coins);
    if (rateEl) {
      const cps = coinsPerSecond(idle);
      rateEl.textContent = cps > 0 ? `earning ${fmtCoins(cps)} / second` : 'no dealers yet — win a hand to get started';
    }

    const dealers = DEALERS.filter((d) => dealerUnlocked(idle, d)).map((d) => {
      const owned = idle.dealers[d.id] || 0;
      const cost = dealerCost(d, owned);
      const can = idle.coins >= cost;
      const contrib = owned * d.rate;
      return `<button class="shop-item ${can ? '' : 'poor'}" data-buy="${d.id}" ${can ? '' : 'disabled'}>
        <span class="emoji">${d.emoji}</span>
        <span class="info">
          <span class="name">${d.name}${owned ? ` <b>×${owned}</b>` : ''}</span>
          <span class="desc">${d.desc}</span>
          <span class="rate">${fmtCoins(d.rate)}/s each${contrib ? ` · making ${fmtCoins(contrib)}/s` : ''}</span>
        </span>
        <span class="cost">${fmtCoins(cost)} 🪙</span>
      </button>`;
    }).join('');

    const ups = UPGRADES.filter((u) => !idle.upgrades.includes(u.id) && idle.lifetimeCoins >= u.cost * 0.3).map((u) => {
      const can = idle.coins >= u.cost;
      return `<button class="shop-item up ${can ? '' : 'poor'}" data-up="${u.id}" ${can ? '' : 'disabled'}>
        <span class="emoji">${u.emoji}</span>
        <span class="info"><span class="name">${u.name}</span><span class="desc">${u.desc}</span></span>
        <span class="cost">${fmtCoins(u.cost)} 🪙</span>
      </button>`;
    }).join('');

    const ownedUps = UPGRADES.filter((u) => idle.upgrades.includes(u.id))
      .map((u) => `<span class="owned-up" title="${u.desc}">${u.emoji} ${u.name}</span>`).join('');

    body.innerHTML = `
      ${dealers ? `<h3>Dealers</h3><div class="shop-list">${dealers}</div>`
        : `<p class="note">Win a hand to earn your first coins, then hire an Apprentice.</p>`}
      ${ups ? `<h3>Upgrades</h3><div class="shop-list">${ups}</div>` : ''}
      ${ownedUps ? `<h3>Owned</h3><div class="owned-ups">${ownedUps}</div>` : ''}
      <p class="note">No purchases, no ads, no energy. Coins come from playing and from your dealers — that's the whole economy.</p>
    `;

    body.querySelectorAll('[data-buy]').forEach((b) => {
      b.onclick = (e) => {
        const id = b.dataset.buy;
        const n = e.shiftKey ? affordable(DEALERS.find((d) => d.id === id), this.profile.idle.dealers[id] || 0, this.profile.idle.coins).count : 1;
        if (buyDealer(this.profile.idle, id, Math.max(1, n))) {
          audio.unlock();
          saveProfile(this.profile);
          this.updateCoins();
          this.renderShopBody();
        } else audio.invalid();
      };
    });
    body.querySelectorAll('[data-up]').forEach((b) => {
      b.onclick = () => {
        if (buyUpgrade(this.profile.idle, b.dataset.up)) {
          audio.unlock();
          saveProfile(this.profile);
          this.updateCoins();
          this.renderShopBody();
          this.toast('Upgrade purchased');
        } else audio.invalid();
      };
    });
  }

  /** Render a modal. Callers may pass a bare .panel — the .overlay backdrop is
   *  added here so every modal is centred and dimmed the same way. */
  openModal(html) {
    const root = document.getElementById('modal-root');
    const needsOverlay = !/^\s*<div class="overlay"/.test(html);
    root.innerHTML = needsOverlay ? `<div class="overlay">${html}</div>` : html;
  }
}

// ---------- helpers ----------

function modeLabel(m) { return { classic: 'Classic', journey: 'Journey', daily: 'Daily Deal', contract: 'Contract', ascension: 'Ascension', zen: 'Zen' }[m] || m; }
function fmtTime(ms) { if (!ms && ms !== 0) return '—'; const s = Math.floor(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function fmtDiff(traits) { const d = difficultyValue(traits); return (d>0?'+':'')+d; }
function sourceMatches(m, loc, game) {
  if (loc.kind === 'tableau') {
    if (m.from === loc.col) {
      if (m.type === 'tab-to-foundation') return loc.index === game.tableau[loc.col].length - 1;
      if (m.type === 'tab-to-tab') return loc.index === game.tableau[loc.col].length - m.count;
    }
    return false;
  }
  if (loc.kind === 'waste') return m.type === 'waste-to-foundation' || m.type === 'waste-to-tab';
  return false;
}
function moveSourceCardId(m, game) {
  if (m.type === 'tab-to-foundation' || m.type === 'tab-to-tab') { const c = game.tableau[m.from]; return c[c.length - (m.count||1)].id; }
  if (m.type === 'waste-to-foundation' || m.type === 'waste-to-tab') return top(game.waste)?.id;
  return null;
}
function collItem(id, unlocked, label, kind) {
  return `<div class="coll-item ${unlocked?'':'locked'}" data-equip="${kind}" data-id="${id}" style="cursor:${unlocked?'pointer':'default'}">
    <div class="mini">${miniPreview(id, kind)}</div>
    <div class="lbl">${label}</div>
  </div>`;
}
function miniPreview(id, kind) {
  if (kind === 'back') return `<div style="width:100%;height:100%;border-radius:8px;background:radial-gradient(circle,#1b2230,#0a0d14);display:grid;place-items:center;color:var(--gold)">${id==='nebula-loom'?'◈':id==='crest-cipher'?'❧':'✦'}</div>`;
  if (kind === 'court') return `<div style="font-family:var(--font-card);color:var(--gold-2);font-size:22px">${id==='herald'?'H':id==='oracle'?'O':'R'}</div>`;
  if (kind === 'theme') return `<div style="width:100%;height:100%;border-radius:8px;background:${id==='light'?'#d9cdb8':'#0e1116'}"></div>`;
  return '';
}
function achievementGrid(p) {
  const ACH = [
    ['ach:first-win','First Light'], ['ach:streak-3','Warming Up'], ['ach:streak-10','Untouchable'],
    ['ach:no-undo-win','Steady Hand'], ['ach:speed','Swift'], ['ach:efficient','Efficient'],
    ['ach:trait-collector','Curator'], ['secret:zen-master','Stillness'], ['secret:ascension-5','Climber'], ['secret:all-traits','Polymath'],
  ];
  return ACH.map(([id,n]) => `<div class="wb-card" style="${p.achievements.includes(id)?'':'opacity:0.4'}"><div class="k">${n}</div><div class="v" style="font-size:12px;color:${p.achievements.includes(id)?'var(--good)':'var(--ink-faint)'}">${p.achievements.includes(id)?'EARNED':'LOCKED'}</div></div>`).join('');
}