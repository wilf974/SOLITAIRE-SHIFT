// src/app.js — orchestrator. Wires engine + renderer + interaction + meta + modes + UI.

import { createGame, applyMove, undo, legalMoves, checkWin, isStuck, remaining, locateCard, top } from './engine/game.js';
import { makeRng } from './engine/rng.js';
import { composeRules, difficultyValue, rewardMultiplier, TRAITS, getTrait } from './engine/traits.js';
import { serialize, deserialize } from './engine/serialize.js';
import { makeDeal, CONTRACTS, todayStr } from './modes.js';
import { loadProfile, saveProfile, exportProfile, importProfile, defaultProfile } from './meta/storage.js';
import { xpForResult, evaluateUnlocks, applyUnlocks, tierFromXp, tierProgress, UNLOCKS } from './meta/mastery.js';
import { BoardRenderer } from './ui/render.js';
import { Controller } from './ui/interaction.js';
import { audio } from './ui/audio.js';
import { loadArt, tableArtUrl, artCount } from './ui/art.js';
import {
  POWERS, getPower, shopList, chargesOf, buyCharges, spendCharge,
  coinsForResult, awardCoins, fmtCoins,
} from './meta/powers.js';
import { EFFECTS } from './engine/powers-fx.js';
import { CHAPTERS } from './modes.js';
import { DIFFICULTIES, getDifficulty, difficultyReward, supportsDifficulty } from './meta/difficulty.js';

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
      tryReserve: (id) => this.tryReserve(id),
      cancelReserve: () => this.cancelReserve(),
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

    this.updateCoins();

    // resume if a saved game exists, else show menu
    const resume = this.profile.history && this.profile.history.resume;
    if (resume && !resume.won) this.resume(resume);
    else this.showMenu();
  }

  // ---------- powers ----------

  updateCoins() {
    const pw = this.profile.powers;
    const c = document.getElementById('hud-coins');
    if (c) c.textContent = fmtCoins(pw.coins);
    const r = document.getElementById('hud-rate');
    if (r) r.textContent = 'pièces';
    this.renderPowerBar();
    if (this._shopOpen) this.renderShopBody();
  }

  /** The power bar along the bottom of the screen. */
  renderPowerBar() {
    const bar = document.getElementById('power-bar');
    if (!bar) return;
    const pw = this.profile.powers;
    const owned = POWERS.filter((p) => chargesOf(pw, p.id) > 0);
    const inHand = !!this.game && !this.game.won;

    if (!owned.length) {
      bar.innerHTML = `<button class="power-empty" data-open-shop>
        <span class="emoji">✨</span>
        <span>Achetez des pouvoirs — ${fmtCoins(pw.coins)} 🪙</span>
      </button>`;
      bar.querySelector('[data-open-shop]').onclick = () => this.showShop();
      return;
    }

    const barred = !!this.game && this.game.rules.powersAllowed === false;
    bar.innerHTML = owned.map((p) => {
      const n = chargesOf(pw, p.id);
      const dead = !inHand || barred || (p.timedOnly && !(this.game && this.game.timeLimitMs));
      return `<button class="power-btn${dead ? ' dead' : ''}" data-power="${p.id}"
        title="${p.name} — ${p.desc}" ${dead ? 'disabled' : ''}>
        ${powerIcon(p)}
        <span class="nm">${p.name}</span>
        <span class="chg">${n}</span>
      </button>`;
    }).join('') + `<button class="power-add" data-open-shop title="Boutique de pouvoirs">＋</button>`;

    bindIconFallbacks(bar);
    bar.querySelectorAll('[data-power]').forEach((b) => {
      b.onclick = () => this.usePower(b.dataset.power);
    });
    const add = bar.querySelector('[data-open-shop]');
    if (add) add.onclick = () => this.showShop();
  }

  /** Spend a charge and apply the effect. Refunds the charge if it fails. */
  usePower(id) {
    const p = getPower(id);
    if (!p || !this.game || this.game.won) { audio.invalid(); return; }
    // the "Mains nues" trait bars powers for the whole deal
    if (this.game.rules.powersAllowed === false) {
      audio.invalid();
      this.toast('Mains nues : aucun pouvoir sur cette donne');
      return;
    }
    const pw = this.profile.powers;
    if (chargesOf(pw, id) <= 0) { audio.invalid(); this.toast('Aucune charge'); return; }

    // Réserve is a two-step power: arm it, then the next card tap is consumed.
    if (id === 'free-cell') {
      if (this.game.reserve) { this.toast('La réserve est déjà occupée'); audio.invalid(); return; }
      this.armReserve();
      return;
    }

    const fx = EFFECTS[id];
    if (!fx) { audio.invalid(); return; }
    const res = id === 'reshuffle' ? fx(this.game, makeRng(this.game.seed + ':rs' + this.game.moves)) : fx(this.game);
    if (!res || !res.ok) {
      audio.invalid();
      this.toast(res?.reason || 'Impossible ici');
      return;
    }

    spendCharge(pw, id);
    saveProfile(this.profile);
    audio.unlock();
    this.sync();
    this.updateHUD();
    this.updateCoins();
    this.saveResume();
    this.flashPowerFeedback(id, res);
    if (checkWin(this.game)) this.onWin();
  }

  /** Arm the Réserve power: the next top-card tap stores that card. */
  armReserve() {
    this.reserveArmed = true;
    document.body.classList.add('arming-reserve');
    this.toast('Touchez une carte du dessus à mettre en réserve');
  }

  /** Called by the controller when a card is tapped while Réserve is armed. */
  tryReserve(cardId) {
    if (!this.reserveArmed || !this.game) return false;
    const res = EFFECTS['free-cell'](this.game, cardId);
    if (!res.ok) { audio.invalid(); this.toast(res.reason); return true; }
    this.reserveArmed = false;
    document.body.classList.remove('arming-reserve');
    spendCharge(this.profile.powers, 'free-cell');
    saveProfile(this.profile);
    audio.unlock();
    this.sync();
    this.updateCoins();
    this.saveResume();
    return true;
  }

  cancelReserve() {
    if (!this.reserveArmed) return;
    this.reserveArmed = false;
    document.body.classList.remove('arming-reserve');
  }

  flashPowerFeedback(id, res) {
    if (id === 'peek' && res.cardId) {
      const el = this.renderer.getById(res.cardId);
      if (el) { el.classList.add('hint'); setTimeout(() => el.classList.remove('hint'), 1600); }
      this.toast('Carte révélée');
    } else if (id === 'ace-call') this.toast('As envoyé aux fondations');
    else if (id === 'reshuffle') this.toast(`Pioche rebattue (${res.count} cartes)`);
    else if (id === 'undo-burst') this.toast(`${res.undone} coup(s) annulé(s)`);
    else if (id === 'time-gift') this.toast(`+${res.seconds} secondes`);
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
    this.stopAuto();
    this.cancelReserve();
    this.closeModal();
    this.showSpinner('Distribution…');
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
      const traitLine = deal.traits && deal.traits.length
        ? ' · ' + deal.traits.map((t) => getTrait(t)?.name || t).join(', ')
        : '';
      this.toast(`${modeLabel(mode)}${traitLine}`);
      // Be honest when the solver could not prove this deal winnable. It only
      // happens on the hardest rule combinations, and the player deserves to
      // know they may be facing an unwinnable board.
      if (deal.meta && deal.meta.validated === false) {
        setTimeout(() => this.toast('Donne non vérifiée — elle peut être imperdable ou insoluble'), 2400);
      }
    } catch (e) {
      console.error(e);
      this.toast('Échec de la donne — réessayez');
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
      this.toast('Partie reprise');
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
    else this.maybeAutoFinish();
    return true;
  }

  /**
   * The moment the hand becomes a formality — nothing hidden, nothing to
   * decide — finish it automatically instead of making the player click 52
   * more times. Announced with a toast so it never feels like a glitch.
   */
  maybeAutoFinish() {
    if (this.autoRunning || !this.isTriviallyWon()) return;
    this.toast('Partie gagnée — ramassage automatique');
    setTimeout(() => {
      if (this.game && !this.game.won && !this.autoRunning) this.auto({ fast: true });
    }, 500);
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
    if (!moves.length) { this.toast('Aucun coup — piochez'); return; }
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

  /**
   * Is the hand already won — every card face-up and reachable, so the rest is
   * pure clicking? That is the moment to take over and finish it for the player.
   */
  isTriviallyWon() {
    const g = this.game;
    if (!g || g.won) return false;
    // any hidden card means there is still a decision left
    for (const pile of g.tableau) {
      for (const c of pile) if (!c.faceUp) return false;
    }
    // the stock/waste must be exhaustible: with nothing hidden, a stock that
    // can still be cycled is fine, but one that can never be reached is not
    if (g.stock.length && g.rules.maxStockPasses <= g.stockPasses) return false;
    return true;
  }

  /**
   * Auto-finish. Sends everything home, one card at a time so the player can
   * watch the cascade. Runs automatically once the hand is trivially won, or
   * on demand from the toolbar / the A key.
   */
  auto(opts = {}) {
    if (!this.game || this.autoRunning) return;
    this.autoRunning = true;
    document.body.classList.add('auto-finishing');
    const delay = opts.fast ? 55 : 90;
    // 52 cards plus draws and recycles; generous but still bounded
    let guard = 0;
    const MAX_STEPS = 600;

    const step = () => {
      if (!this.game || guard++ > MAX_STEPS || checkWin(this.game)) return this.stopAuto();
      const moves = legalMoves(this.game);

      // 1. anything that can go home, goes home
      const home = moves.find((m) => m.type === 'tab-to-foundation'
        || m.type === 'waste-to-foundation' || m.type === 'reserve-to-foundation');
      if (home) { this.do(home); this.autoTimer = setTimeout(step, delay); return; }

      // 2. otherwise draw, so the waste keeps feeding the foundations
      const draw = moves.find((m) => m.type === 'draw');
      if (draw) { this.do(draw); this.autoTimer = setTimeout(step, delay); return; }
      const recycle = moves.find((m) => m.type === 'recycle');
      if (recycle) { this.do(recycle); this.autoTimer = setTimeout(step, delay); return; }

      // 3. failing that, a move that uncovers a face-down card (manual use only)
      const reveal = moves.find((m) => m.type === 'tab-to-tab' && (() => {
        const s = this.game.tableau[m.from];
        return s.length - m.count - 1 >= 0 && !s[s.length - m.count - 1].faceUp;
      })());
      if (reveal) { this.do(reveal); this.autoTimer = setTimeout(step, delay); return; }

      this.stopAuto();
    };
    step();
  }

  stopAuto() {
    this.autoRunning = false;
    if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null; }
    document.body.classList.remove('auto-finishing');
  }

  // ---------- win/lose ----------

  onWin() {
    this.stopTimer();
    this.stopAuto();
    audio.resetFoundationStreak();
    const timeMs = this.elapsedBase + (Date.now() - this.startTs);
    const res = {
      won: true,
      mode: this.mode,
      traits: (this.deal && this.deal.traits) || [],
      difficulty: (this.deal && this.deal.meta && this.deal.meta.difficulty) || 'standard',
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
    this.stopAuto();
    audio.invalid();
    const res = {
      won: false,
      mode: this.mode,
      traits: (this.deal && this.deal.traits) || [],
      difficulty: (this.deal && this.deal.meta && this.deal.meta.difficulty) || 'standard',
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
    const xp = Math.round(xpForResult(res) * difficultyReward(res.difficulty || 'standard'));
    p.xp += xp;
    p.tier = tierFromXp(p.xp);
    // coins — earned only by playing, spent on power charges.
    // Harder difficulty pays more; the multiplier applies to XP too.
    const diffMul = difficultyReward(res.difficulty || 'standard');
    const coins = Math.round(coinsForResult(res) * diffMul);
    awardCoins(p.powers, coins);
    this.lastCoins = coins;
    this.updateCoins();
    // mode-specific records
    if (res.won && this.mode === 'adventure') {
      const ch = (this.deal && this.deal.meta && this.deal.meta.chapter) ?? 0;
      if (!p.adventure.cleared.includes(ch)) p.adventure.cleared.push(ch);
      p.adventure.chapter = Math.min(CHAPTERS.length - 1, Math.max(p.adventure.chapter, ch + 1));
    }
    if (res.won && this.mode === 'timed' && res.timeMs) {
      if (p.bestTimedMs == null || res.timeMs < p.bestTimedMs) p.bestTimedMs = res.timeMs;
    }
    if (this.mode === 'tide') {
      p.bestTide = Math.max(p.bestTide || 0, res.foundationCards || 0);
    }
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

  sync() { this.renderer.sync(this.game); this.updateHUD(); this.renderPowerBar(); }
  updateHUD() {
    // The coin counter is part of the HUD, so refresh it here too. Leaving it
    // to updateCoins() alone meant the pill kept showing a stale total whenever
    // coins changed outside a finished hand.
    const pw = this.profile.powers;
    const coins = document.getElementById('hud-coins');
    if (coins) coins.textContent = fmtCoins(pw.coins);
    if (!this.game) return;
    document.getElementById('hud-score').textContent = this.game.score;
    document.getElementById('hud-moves').textContent = this.game.moves;
  }
  startTimer() {
    this.stopTimer();
    this.startTs = Date.now();
    const el = document.getElementById('hud-time');
    const label = document.getElementById('hud-time-label');
    const limit = this.game ? this.game.timeLimitMs : 0;
    if (label) label.textContent = limit ? 'Restant' : 'Temps';
    this.timer = setInterval(() => {
      const ms = this.elapsedBase + (Date.now() - this.startTs);
      if (limit) {
        // counting DOWN, plus whatever the Sursis power granted
        const left = limit + (this.game.timeBonusMs || 0) - ms;
        const s = Math.max(0, Math.ceil(left / 1000));
        el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        el.classList.toggle('urgent', s <= 30);
        if (left <= 0) { this.onTimeUp(); return; }
      } else {
        const s = Math.floor(ms / 1000);
        el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      }
    }, 250);
  }

  /** Timed mode ran out. Counts as a loss, but you keep the coins you earned. */
  onTimeUp() {
    this.stopTimer();
    if (!this.game || this.game.won) return;
    audio.invalid();
    const res = {
      won: false,
      mode: this.mode,
      traits: (this.deal && this.deal.traits) || [],
      difficulty: (this.deal && this.deal.meta && this.deal.meta.difficulty) || 'standard',
      moves: this.game.moves,
      timeMs: this.game.timeLimitMs + (this.game.timeBonusMs || 0),
      score: this.game.score,
      undosUsed: this.game.undosUsed,
      foundationCards: this.game.foundations.reduce((s, f) => s + f.length, 0),
    };
    this.recordResult(res);
    this.openModal(`<div class="panel">
      <h2>Temps écoulé</h2>
      <div class="sub">${res.foundationCards}/52 aux fondations · +${fmtCoins(this.lastCoins || 0)} 🪙</div>
      <p class="note">Le pouvoir <strong>Sursis</strong> ajoute 45 secondes si vous en avez une charge.</p>
      <div class="btn-row">
        <button class="btn ghost" data-act="menu">Menu</button>
        <button class="btn primary" data-act="again">Réessayer</button>
      </div>
    </div>`);
    const root = document.getElementById('modal-root');
    root.querySelector('[data-act="menu"]').onclick = () => this.showMenu();
    root.querySelector('[data-act="again"]').onclick = () => this.startMode('timed', { seconds: (this.deal?.meta?.seconds) || 300 });
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
    this.stopAuto();
    this._shopOpen = false;
    this.cancelReserve();
    this.game = null; // the board sits idle; nothing plays itself
    const p = this.profile;
    const tp = tierProgress(p.xp);
    const advDone = p.adventure.cleared.length;
    const modes = [
      { id: 'adventure', ico: '🗺️', icon: 'mode-adventure', t: 'Aventure', d: `Huit chapitres, huit règles. ${advDone}/${CHAPTERS.length} terminés.`, locked: false, feature: true },
      { id: 'timed', ico: '⏱️', icon: 'mode-timed', t: 'Chrono', d: p.bestTimedMs ? `Battez le temps. Record : ${fmtTime(p.bestTimedMs)}.` : 'Cinq minutes pour tout finir.', locked: false, feature: true },
      { id: 'tide', ico: '🌊', icon: 'mode-tide', t: 'Marée', d: `La mer monte et remplit vos colonnes. Record : ${p.bestTide || 0}/52.`, locked: false, feature: true },
      { id: 'classic', ico: '♣', icon: 'mode-classic', t: 'Classique', d: 'Klondike pur. Donne aléatoire — le pari traditionnel.', locked: false },
      { id: 'journey', ico: '✦', icon: 'mode-journey', t: 'Parcours', d: 'La voie principale. Les traits arrivent en progressant.', locked: false },
      { id: 'daily', ico: '☉', icon: 'mode-daily', t: 'Donne du jour', d: `Une donne résoluble par jour — ${todayStr()}.`, locked: false },
      { id: 'contract', ico: '❧', icon: 'mode-contract', t: 'Contrats', d: 'Des défis choisis aux règles étranges.', locked: p.tier < 2, lock: p.tier < 2 ? `Rang 2 requis` : '' },
      { id: 'ascension', ico: '△', icon: 'mode-ascension', t: 'Ascension', d: "Des séries de victoires qui montent. Jusqu'où irez-vous ?", locked: p.tier < 3, lock: p.tier < 3 ? `Rang 3 requis` : '' },
      { id: 'zen', ico: '◐', icon: 'mode-zen', t: 'Zen', d: 'Détendu, toujours résoluble. Aucune pression.', locked: false },
    ];
    const cards = modes.map((m) => `<button class="mode-card${m.feature ? ' feature' : ''}" data-mode="${m.id}" ${m.locked ? 'disabled' : ''}>
${uiIcon(m.icon, m.ico, 'ico')}<span class="t">${m.t}</span><span class="d">${m.d}</span>${m.lock ? `<span class="lock">${m.lock}</span>` : ''}
    </button>`).join('');
    this.openModal(`
      <div class="panel">
        <h2>SOLITAIRE: SHIFT</h2>
        <div class="sub">Rang ${tp.tier}</div>
        <div style="margin-bottom:14px"><div class="sub" style="margin-bottom:6px">Maîtrise · ${p.xp} XP</div>
          <div style="height:8px;border-radius:99px;background:rgba(0,0,0,.3);overflow:hidden;border:1px solid var(--panel-border)">
            <div style="height:100%;width:${Math.round(tp.pct*100)}%;background:linear-gradient(90deg,var(--gold-deep),var(--gold-2))"></div>
          </div>
        </div>
        <button class="btn primary shop-cta" data-act="shop">
          ✨ Pouvoirs — <span id="menu-coins">${fmtCoins(p.powers.coins)}</span> pièces
          <small>${totalCharges(p.powers) ? `${totalCharges(p.powers)} charge(s) en poche` : 'aucune charge'}</small>
        </button>
        <div class="menu-grid">${cards}</div>
        <div class="btn-row">
          <button class="btn ghost" data-act="stats">Statistiques</button>
          <button class="btn ghost" data-act="traits">Traits</button>
          <button class="btn ghost" data-act="collection">Collection</button>
          <button class="btn ghost" data-act="settings">Réglages</button>
          <button class="btn ghost" data-act="workbench">Atelier</button>
        </div>
      </div>
    `);
    bindIconFallbacks(document.getElementById('modal-root'));
    this.wireMenu();
  }

  wireMenu() {
    const root = document.getElementById('modal-root');
    root.querySelectorAll('[data-mode]').forEach((b) => {
      b.onclick = () => {
        const mode = b.dataset.mode;
        if (mode === 'contract') this.showContractPicker();
        else if (mode === 'ascension') this.showAscensionPicker();
        else if (mode === 'adventure') this.showAdventurePicker();
        else if (mode === 'timed') this.showTimedPicker();
        else if (mode === 'tide') this.showTidePicker();
        else if (supportsDifficulty(mode)) {
          this.showDifficultyPicker(
            modeLabel(mode),
            'Choisissez la règle de pose',
            (difficulty) => this.startMode(mode, { difficulty }),
          );
        } else this.startMode(mode);
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
    const reveal = earned.length ? earned.map((u) => `<div style="margin:6px 0"><strong style="color:var(--gold-2)">${u.name}</strong> <span style="color:var(--ink-soft)">— ${u.desc}</span></div>`).join('') : '<div style="color:var(--ink-soft)">Rien de neuf cette fois.</div>';
    this.openModal(`
      <div class="panel victory">
        <div class="title">Victoire !</div>
        <div class="sub">${modeLabel(this.mode)} · +${this.lastXp} XP</div>
        <div class="coin-hero">+${fmtCoins(this.lastCoins || 0)} <span>🪙</span></div>
        <div class="stats" style="margin:14px 0">
          <div class="row"><span class="k">Coups</span><span class="v">${res.moves}</span></div>
          <div class="row"><span class="k">Temps</span><span class="v">${fmtTime(res.timeMs)}</span></div>
          <div class="row"><span class="k">Score</span><span class="v">${res.score}</span></div>
          <div class="row"><span class="k">Série</span><span class="v">${p.streak}</span></div>
        </div>
        ${earned.length ? `<h3>Déverrouillé</h3>${reveal}` : ''}
        <div class="btn-row">
          <button class="btn ghost" data-act="menu">Menu</button>
          <button class="btn primary" data-act="again">Rejouer</button>
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
        <h2>Plus aucun coup</h2>
        <div class="sub">${modeLabel(this.mode)} · ${res.foundationCards}/52 aux fondations</div>
        <p style="color:var(--ink-soft);margin:12px 0">Cette donne est bloquée. ${this.mode === 'classic' ? 'Les donnes Classiques sont aléatoires — réessayez.' : 'Cela arrive même sur une donne équitable avec des traits difficiles.'}</p>
        <div class="btn-row">
          <button class="btn ghost" data-act="menu">Menu</button>
          <button class="btn primary" data-act="again">Nouvelle donne</button>
        </div>
      </div>
    `);
    const root = document.getElementById('modal-root');
    root.querySelector('[data-act="menu"]').onclick = () => this.showMenu();
    root.querySelector('[data-act="again"]').onclick = () => this.startMode(this.mode);
  }

  /**
   * Difficulty picker, shared by every mode that supports one. `next` receives
   * the chosen difficulty id. The player's last choice is remembered.
   */
  showDifficultyPicker(title, sub, next) {
    const chosen = this.profile.difficulty || 'standard';
    const list = DIFFICULTIES.map((d) => {
      const traitNames = d.traits.length
        ? d.traits.map((t) => getTrait(t)?.name || t).join(' · ')
        : 'Règles standard';
      return `<button class="mode-card diff${d.id === chosen ? ' chosen' : ''}" data-diff="${d.id}">
        ${uiIcon(d.icon, d.emoji, 'ico')}
        <span class="t">${d.name}</span>
        <span class="d">${d.desc}</span>
        <span class="chip"><span class="v">${traitNames}</span></span>
        <span class="reward">×${d.reward} récompenses</span>
      </button>`;
    }).join('');
    this.openModal(`<div class="panel">
      <h2>${title}</h2>
      <div class="sub">${sub}</div>
      <div class="menu-grid">${list}</div>
      <div class="btn-row"><button class="btn ghost" data-close>Retour</button></div>
    </div>`);
    bindIconFallbacks(document.getElementById('modal-root'));
    document.getElementById('modal-root').querySelectorAll('[data-diff]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.diff;
        this.profile.difficulty = id;
        saveProfile(this.profile);
        next(id);
      };
    });
  }

  // ---------- new mode pickers ----------

  showAdventurePicker() {
    const p = this.profile;
    const list = CHAPTERS.map((c, i) => {
      const done = p.adventure.cleared.includes(i);
      // you may replay anything cleared, and attempt the next one
      const open = done || i <= p.adventure.chapter;
      const traits = c.traits.length
        ? c.traits.map((t) => getTrait(t)?.name || t).join(' · ')
        : 'Règles classiques';
      return `<button class="mode-card chapter${done ? ' done' : ''}" data-chapter="${i}" ${open ? '' : 'disabled'}>
        <span class="ico">${done ? '✅' : open ? '📖' : '🔒'}</span>
        <span class="t">${i + 1}. ${c.name}</span>
        <span class="d">${c.story}</span>
        <span class="chip"><span class="v">${traits}</span></span>
      </button>`;
    }).join('');
    this.openModal(`<div class="panel">
      <h2>Aventure</h2>
      <div class="sub">${p.adventure.cleared.length}/${CHAPTERS.length} chapitres terminés</div>
      <div class="menu-grid">${list}</div>
      <div class="btn-row"><button class="btn ghost" data-close>Retour</button></div>
    </div>`);
    document.getElementById('modal-root').querySelectorAll('[data-chapter]').forEach((b) => {
      b.onclick = () => this.startMode('adventure', { chapter: parseInt(b.dataset.chapter, 10) });
    });
  }

  showTimedPicker() {
    const p = this.profile;
    const opts = [
      { s: 180, t: '3 minutes', d: 'Pour les mains rapides.' },
      { s: 300, t: '5 minutes', d: 'Le rythme conseillé.' },
      { s: 600, t: '10 minutes', d: 'Confortable mais compté.' },
    ];
    const list = opts.map((o) => `<button class="mode-card" data-seconds="${o.s}">
      <span class="ico">⏱️</span><span class="t">${o.t}</span><span class="d">${o.d}</span>
    </button>`).join('');
    this.openModal(`<div class="panel">
      <h2>Chrono</h2>
      <div class="sub">La donne est toujours résoluble — seul le temps vous arrête</div>
      ${p.bestTimedMs ? `<p class="note">Votre meilleure victoire : ${fmtTime(p.bestTimedMs)}.</p>` : ''}
      <div class="menu-grid">${list}</div>
      <div class="btn-row"><button class="btn ghost" data-close>Retour</button></div>
    </div>`);
    document.getElementById('modal-root').querySelectorAll('[data-seconds]').forEach((b) => {
      b.onclick = () => {
        const seconds = parseInt(b.dataset.seconds, 10);
        this.showDifficultyPicker('Chrono', `${Math.round(seconds / 60)} minutes · règle de pose`,
          (difficulty) => this.startMode('timed', { seconds, difficulty }));
      };
    });
  }

  showTidePicker() {
    const p = this.profile;
    const opts = [
      { n: 16, t: 'Marée douce', d: 'La mer monte tous les 16 coups.' },
      { n: 12, t: 'Marée vive', d: 'Tous les 12 coups. Le rythme conseillé.' },
      { n: 8, t: 'Tempête', d: 'Tous les 8 coups. Bonne chance.' },
    ];
    const list = opts.map((o) => `<button class="mode-card" data-tide="${o.n}">
      <span class="ico">🌊</span><span class="t">${o.t}</span><span class="d">${o.d}</span>
    </button>`).join('');
    this.openModal(`<div class="panel">
      <h2>Marée</h2>
      <div class="sub">Le tableau se remplit pendant que vous le videz</div>
      <p class="note">Toutes les N actions, une carte est distribuée sur chaque colonne.
      Comme le plateau change en cours de route, cette donne n'est pas validée par le
      solveur : il s'agit de tenir, pas de prouver. Record : ${p.bestTide || 0}/52 cartes aux fondations.</p>
      <div class="menu-grid">${list}</div>
      <div class="btn-row"><button class="btn ghost" data-close>Retour</button></div>
    </div>`);
    document.getElementById('modal-root').querySelectorAll('[data-tide]').forEach((b) => {
      b.onclick = () => {
        const tideEvery = parseInt(b.dataset.tide, 10);
        this.showDifficultyPicker('Marée', `Toutes les ${tideEvery} actions · règle de pose`,
          (difficulty) => this.startMode('tide', { tideEvery, difficulty }));
      };
    });
  }

  showContractPicker() {
    const p = this.profile;
    const list = CONTRACTS.map((c) => {
      const locked = (c.tier || 0) > p.tier;
      return `<button class="mode-card" data-contract="${c.id}" ${locked?'disabled':''}>
        <span class="ico">❧</span><span class="t">${c.name}</span>
        <span class="d">${c.desc}</span>
        <span class="chip ${difficultyValue(c.traits)>=2?'hard':difficultyValue(c.traits)<0?'easy':''}"><span class="v">${fmtDiff(c.traits)}</span></span>
        ${locked?`<span class="lock">Rang ${c.tier}</span>`:''}
      </button>`;
    }).join('');
    this.openModal(`<div class="panel"><h2>Contrats</h2><div class="sub">Des défis choisis</div><div class="menu-grid">${list}</div><div class="btn-row"><button class="btn ghost" data-close>Retour</button></div></div>`);
    document.getElementById('modal-root').querySelectorAll('[data-contract]').forEach((b) => b.onclick = () => this.startMode('contract', { contractId: b.dataset.contract }));
  }

  showAscensionPicker() {
    const p = this.profile;
    const level = Math.max(1, p.ascension.bestLevel || 1);
    this.openModal(`<div class="panel">
      <h2>Ascension</h2><div class="sub">Gagnez pour monter. Chaque niveau ajoute un trait plus dur.</div>
      <p style="color:var(--ink-soft);margin:12px 0">Meilleur niveau : ${p.ascension.bestLevel||0}. Démarrer au niveau ${level}.</p>
      <div class="btn-row"><button class="btn ghost" data-close>Retour</button><button class="btn primary" data-act="go">Commencer au niveau ${level}</button></div>
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
        <div style="color:var(--ink-faint);font-size:10px;margin-top:6px;letter-spacing:.12em">${owned?'ACQUIS':`RANG ${t.tier}`}</div>
      </div>`;
    }).join('');
    this.openModal(`<div class="panel"><h2>Traits</h2><div class="sub">${p.traitsUnlocked.length}/${TRAITS.length} déverrouillés</div><div class="wb-grid">${items}</div><div class="btn-row"><button class="btn ghost" data-close>Retour</button></div></div>`);
  }

  showCollection() {
    const p = this.profile;
    const backs = p.backs.map((b) => collItem(b.id, b.unlocked, collectibleName(b.id, 'back'), 'back'));
    const courts = p.courtFamilies.map((c) => collItem(c.id, c.unlocked, collectibleName(c.id, 'court'), 'court'));
    const themes = p.themes.map((t) => collItem(t.id, t.unlocked, collectibleName(t.id, 'theme'), 'theme'));
    this.openModal(`<div class="panel"><h2>Collection</h2><div class="sub">Dos de cartes, figures, thèmes</div>
      <h3>Dos de cartes</h3><div class="collection">${backs.join('')}</div>
      <h3>Familles de figures</h3><div class="collection">${courts.join('')}</div>
      <h3>Thèmes</h3><div class="collection">${themes.join('')}</div>
      <div class="btn-row"><button class="btn ghost" data-close>Retour</button></div></div>`);
    document.getElementById('modal-root').querySelectorAll('[data-equip]').forEach((el) => {
      el.onclick = () => {
        const kind = el.dataset.equip, id = el.dataset.id;
        if (el.classList.contains('locked')) { audio.invalid(); this.toast('Pas encore déverrouillé'); return; }
        if (kind === 'back') { this.profile.activeBack = id; this.renderer.setBack(id); }
        if (kind === 'theme') { this.profile.activeTheme = id; document.documentElement.dataset.theme = id; }
        if (kind === 'court') { this.profile.activeCourt = id; }
        saveProfile(this.profile);
        this.toast('Équipé');
      };
    });
  }

  showStats() {
    const p = this.profile, s = p.stats;
    this.openModal(`<div class="panel"><h2>Statistiques</h2><div class="sub">Depuis toujours</div>
      <div class="stats">
        <div class="row"><span class="k">Parties</span><span class="v">${p.gamesPlayed}</span></div>
        <div class="row"><span class="k">Victoires</span><span class="v">${p.wins}</span></div>
        <div class="row"><span class="k">Taux de victoire</span><span class="v">${p.gamesPlayed?Math.round(p.wins/p.gamesPlayed*100):0}%</span></div>
        <div class="row"><span class="k">Meilleure série</span><span class="v">${p.bestStreak||0}</span></div>
        <div class="row"><span class="k">Coups au total</span><span class="v">${s.totalMoves}</span></div>
        <div class="row"><span class="k">Score total</span><span class="v">${s.totalScore}</span></div>
        <div class="row"><span class="k">Victoire la plus rapide</span><span class="v">${s.fastestWinMs?fmtTime(s.fastestWinMs):'—'}</span></div>
        <div class="row"><span class="k">Moins de coups</span><span class="v">${s.fewestMovesWin??'—'}</span></div>
        <div class="row"><span class="k">Record Ascension</span><span class="v">L${p.ascension.bestLevel||0}</span></div>
        <div class="row"><span class="k">Rang</span><span class="v">${p.tier}</span></div>
      </div>
      <h3>Hauts faits</h3><div class="wb-grid">${achievementGrid(p)}</div>
      <div class="btn-row"><button class="btn ghost" data-close>Retour</button></div></div>`);
  }

  showSettings() {
    const p = this.profile;
    this.openModal(`<div class="panel"><h2>Réglages</h2><div class="sub">Accessibilité et données</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin:12px 0">
        <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer"><span>Son</span><input type="checkbox" id="set-mute" ${p.settings.muted?'':'checked'}></label>
        <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer"><span>Réduire les animations</span><input type="checkbox" id="set-motion" ${p.settings.reduceMotion?'checked':''}></label>
      </div>
      <div class="btn-row">
        <button class="btn ghost" data-act="export">Exporter</button>
        <button class="btn ghost" data-act="import">Importer</button>
        <button class="btn ghost" data-act="reset" style="color:var(--bad)">Réinitialiser</button>
        <button class="btn ghost" data-close>Retour</button>
      </div></div>`);
    const root = document.getElementById('modal-root');
    root.querySelector('#set-mute').onchange = (e) => { p.settings.muted = !e.target.checked; audio.setMuted(p.settings.muted); saveProfile(p); };
    root.querySelector('#set-motion').onchange = (e) => { p.settings.reduceMotion = e.target.checked; document.documentElement.classList.toggle('reduce-motion', e.target.checked); saveProfile(p); };
    root.querySelector('[data-act="export"]').onclick = () => { navigator.clipboard.writeText(exportProfile(p)); this.toast('Sauvegarde copiée dans le presse-papiers'); };
    root.querySelector('[data-act="import"]').onclick = () => { const s = prompt('Collez la sauvegarde exportée :'); if (s) { try { this.profile = importProfile(s); saveProfile(this.profile); this.applyAppearance(); this.showMenu(); this.toast('Importée'); } catch(e){ this.toast('Sauvegarde invalide'); } } };
    root.querySelector('[data-act="reset"]').onclick = () => { if (confirm('Réinitialiser toute la progression ?')) { this.profile = defaultProfile(); saveProfile(this.profile); this.applyAppearance(); this.showMenu(); } };
  }

  showWorkbench() {
    const p = this.profile;
    this.openModal(`<div class="panel workbench"><h2>Atelier</h2><div class="sub">Avancement et preuves</div>
      <section><h3>Build</h3><div class="wb-grid">
        <div class="wb-card"><div class="k">État</div><div class="v">Jouable</div></div>
        <div class="wb-card"><div class="k">Traits</div><div class="v">${p.traitsUnlocked.length}/${TRAITS.length}</div></div>
        <div class="wb-card"><div class="k">Rang / XP</div><div class="v">${p.tier} · ${p.xp}</div></div>
        <div class="wb-card"><div class="k">Tests</div><div class="v">83 au vert</div></div>
        <div class="wb-card"><div class="k">Art généré</div><div class="v">${artCount()}/20 visuels</div></div>
      </div></section>
      <section><h3>Références</h3><div class="wb-grid">
        <div class="wb-card"><div class="k">MS Solitaire</div><div class="v">Clarté des interactions</div></div>
        <div class="wb-card"><div class="k">Balatro</div><div class="v">Boucle et découverte</div></div>
        <div class="wb-card"><div class="k">Zachtronics</div><div class="v">Invention de règles</div></div>
      </div></div></section>
      <section><h3>Points ouverts</h3><div class="wb-grid">
        <div class="wb-card"><div class="k">Mobile</div><div class="v">Passe sur appareil réel à faire</div></div>
        <div class="wb-card"><div class="k">Solveur</div><div class="v">Les traits durs peuvent expirer en « inconnu »</div></div>
      </div></section>
      <div class="btn-row"><button class="btn ghost" data-close>Retour</button></div></div>`);
  }

  // ---------- power shop ----------

  showShop() {
    this.openModal(`
      <div class="overlay"><div class="panel shop">
        <h2>Pouvoirs</h2>
        <div class="sub">Achetez des charges. Dépensez-les pendant une partie.</div>
        <div class="shop-hero">
          <div class="coin-hero"><span id="shop-coins">0</span> <span>🪙</span></div>
          <div class="rate" id="shop-rate"></div>
        </div>
        <div id="shop-body"></div>
        <div class="btn-row"><button class="btn ghost" data-act="back">Retour</button></div>
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
    const pw = this.profile.powers;

    const coinsEl = document.getElementById('shop-coins');
    const rateEl = document.getElementById('shop-rate');
    if (coinsEl) coinsEl.textContent = fmtCoins(pw.coins);
    if (rateEl) {
      const n = totalCharges(pw);
      rateEl.textContent = n ? `${n} charge(s) en poche` : 'Gagnez des parties pour gagner des pièces';
    }

    const items = shopList().map((p) => {
      const owned = chargesOf(pw, p.id);
      const can = pw.coins >= p.cost;
      return `<button class="shop-item ${can ? '' : 'poor'}" data-buy="${p.id}" ${can ? '' : 'disabled'}>
        ${powerIcon(p)}
        <span class="info">
          <span class="name">${p.name}${owned ? ` <b>×${owned}</b>` : ''}</span>
          <span class="desc">${p.desc}</span>
          <span class="rate">${p.hint}</span>
        </span>
        <span class="cost">${fmtCoins(p.cost)} 🪙</span>
      </button>`;
    }).join('');

    body.innerHTML = `
      <div class="shop-list">${items}</div>
      <p class="note">Chaque usage consomme une charge : les pouvoirs créent des choix,
      ils ne jouent pas à votre place. Aucun achat réel, aucune publicité, aucune énergie —
      les pièces se gagnent uniquement en jouant. Maj+clic pour acheter cinq charges.</p>
    `;

    bindIconFallbacks(body);
    body.querySelectorAll('[data-buy]').forEach((b) => {
      b.onclick = (e) => {
        const n = e.shiftKey ? 5 : 1;
        if (buyCharges(this.profile.powers, b.dataset.buy, n)) {
          audio.unlock();
          saveProfile(this.profile);
          this.updateCoins();
          this.renderShopBody();
        } else { audio.invalid(); this.toast('Pas assez de pièces'); }
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

function modeLabel(m) {
  return {
    classic: 'Classique', journey: 'Parcours', daily: 'Donne du jour', contract: 'Contrat',
    ascension: 'Ascension', zen: 'Zen', adventure: 'Aventure', timed: 'Chrono', tide: 'Marée',
  }[m] || m;
}
/**
 * Icon markup for anything with an `icon` (generated art) and a fallback glyph.
 * Used by the power bar, the mode menu and the difficulty picker.
 * The fallback is wired by bindIconFallbacks() rather than an inline onerror,
 * so a strict Content-Security-Policy cannot break it.
 */
function uiIcon(icon, fallback, cls = 'emoji') {
  if (!icon) return `<span class="${cls}">${fallback}</span>`;
  return `<span class="${cls} art" data-fallback="${fallback}"><img
    src="src/assets/icons/ui/${icon}.png" alt="" draggable="false" loading="lazy"></span>`;
}

/** Convenience wrapper for a power object. */
function powerIcon(p, cls = 'emoji') {
  return uiIcon(p.icon, p.emoji, cls);
}

/** If generated art fails to load, drop back to the glyph. */
function bindIconFallbacks(root) {
  root.querySelectorAll('.art[data-fallback] img').forEach((img) => {
    img.addEventListener('error', () => {
      const span = img.parentElement;
      if (span) { span.textContent = span.dataset.fallback; span.classList.remove('art'); }
    }, { once: true });
  });
}

/** Total power charges held across every power. */
function totalCharges(pw) {
  return Object.values(pw.charges || {}).reduce((a, b) => a + (b || 0), 0);
}
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
/** French display names for collectibles. Ids stay English (they're persisted). */
const COLLECTIBLE_NAMES = {
  back: { 'sunburst-pop': 'Soleil pop', 'bubblegum-nebula': 'Nébuleuse bonbon', 'mint-crest': 'Blason menthe' },
  court: { regalia: 'Cour royale', herald: 'Cour du Héraut', oracle: "Cour de l'Oracle" },
  theme: { sunlit: 'Plein soleil', night: 'Arcade nocturne' },
};
function collectibleName(id, kind) {
  return (COLLECTIBLE_NAMES[kind] && COLLECTIBLE_NAMES[kind][id]) || id;
}

function miniPreview(id, kind) {
  if (kind === 'back') {
    const grad = {
      'sunburst-pop': 'linear-gradient(150deg,#ff8fab,#ffb43c)',
      'bubblegum-nebula': 'linear-gradient(150deg,#7c6cff,#45c8ff)',
      'mint-crest': 'linear-gradient(150deg,#17c964,#45c8ff)',
    }[id] || 'linear-gradient(150deg,#ff8fab,#ffb43c)';
    const glyph = { 'bubblegum-nebula': '✦', 'mint-crest': '❤' }[id] || '★';
    return `<div style="width:100%;height:100%;border-radius:8px;background:${grad};display:grid;place-items:center;color:#fff;font-size:20px">${glyph}</div>`;
  }
  if (kind === 'court') return `<div style="font-size:24px">${id === 'herald' ? '🎺' : id === 'oracle' ? '🔮' : '👑'}</div>`;
  if (kind === 'theme') return `<div style="width:100%;height:100%;border-radius:8px;background:${id === 'night' ? 'linear-gradient(150deg,#3b2d7a,#1b1f4b)' : 'linear-gradient(150deg,#ffd8a8,#1fc0ad)'}"></div>`;
  return '';
}
function achievementGrid(p) {
  // Derived from UNLOCKS so the names can never drift out of sync with mastery.js
  const ACH = UNLOCKS.filter((u) => u.kind === 'achievement' || u.kind === 'secret');
  return ACH.map((u) => {
    const got = p.achievements.includes(u.id);
    return `<div class="wb-card" style="${got ? '' : 'opacity:0.4'}" title="${u.desc}">
      <div class="k">${u.name}</div>
      <div class="v" style="font-size:12px;color:${got ? 'var(--good)' : 'var(--ink-faint)'}">${got ? 'OBTENU' : 'À FAIRE'}</div>
    </div>`;
  }).join('');
}