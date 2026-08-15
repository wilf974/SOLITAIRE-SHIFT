// src/ui/interaction.js — pointer drag/tap/keyboard controller.
// Unified mouse/touch/pen via Pointer Events. Drag with floating ghost,
// legal-target highlight, tap-to-auto-move, double-tap to foundation, keyboard.

import { locateCard, movableRun, legalMoves, tableauFits, canStartEmptyColumn, foundationFits, foundationIndexFor, top } from '../engine/game.js';

const DRAG_THRESHOLD = 6; // px before a tap becomes a drag

export class Controller {
  constructor(ctx) {
    this.ctx = ctx; // { renderer, game, do, sync, audio, onStockTap, onWin, bestMove, hint, auto }
    this.ghost = null;
    this.drag = null; // { ids, from, run, originRects, pointerId, startX, startY, moved }
    this.lastTap = { id: null, t: 0 };
  }

  bind(root) {
    this.cardLayer = this.ctx.renderer.cardLayer;
    this.cardLayer.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    // keyboard
    window.addEventListener('keydown', (e) => this.onKey(e));
    // stock slot tap — delegate on the board so it works before build() and
    // when the stock is empty (no card overlays the slot). When stock has cards,
    // the top card sits in the card-layer above the board and handles its own tap.
    this.ctx.renderer.boardEl.addEventListener('click', (e) => {
      const slot = e.target.closest('[data-slot="stock"]');
      if (slot) this.ctx.onStockTap();
    });
    window.addEventListener('resize', () => this.ctx.renderer.measure());
  }

  cardFromEvent(e) {
    const el = e.target.closest('.card');
    if (!el || !el.dataset.cardId) return null;
    return el;
  }

  onDown(e) {
    if (this.drag) return;
    const el = this.cardFromEvent(e);
    if (!el) return;
    const id = el.dataset.cardId;
    const game = this.ctx.game();
    if (!game) return; // idle demo is on the table — not the player's hand
    const loc = locateCard(game, id);
    if (!loc) return;
    // stock handled as a tap-only pseudo-drag (the top card intercepts slot clicks)
    if (loc.kind === 'stock') {
      e.preventDefault();
      this.drag = { pointerId: e.pointerId, stockTap: true, ids: [id], from: loc, startX: e.clientX, startY: e.clientY, moved: false };
      return;
    }

    const run = movableRun(game, id);
    if (!run || !run.length) return;
    // only allow drag if the card is the top (waste/foundation) or a valid run start (tableau)
    e.preventDefault();

    this.drag = {
      pointerId: e.pointerId,
      ids: run.map((c) => c.id),
      run,
      from: loc,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      ghostEls: [],
    };
  }

  beginDragGhost() {
    const d = this.drag;
    this.ghost = document.createElement('div');
    this.ghost.className = 'ghost-layer';
    this.ghost.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;';
    const rect = this.ctx.renderer.cardLayer.getBoundingClientRect();
    const cw = this.ctx.renderer.slotPos.waste.w; // approximate card width
    let yOff = 0;
    for (const id of d.ids) {
      const src = this.ctx.renderer.getById(id);
      const clone = src.cloneNode(true);
      clone.style.position = 'absolute';
      clone.style.left = '0';
      clone.style.top = yOff + 'px';
      clone.style.transform = 'none';
      clone.style.transition = 'none';
      clone.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
      this.ghost.appendChild(clone);
      yOff += this.ctx.renderer.offUp;
      src.style.opacity = '0.25';
    }
    document.body.appendChild(this.ghost);
  }

  onMove(e) {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const d = this.drag;
    if (d.stockTap) return; // stock is tap-only: it has no run to drag
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      d.moved = true;
      this.beginDragGhost();
    }
    if (!d.moved) return;
    // position ghost centered slightly above pointer (thumb-friendly)
    const halfW = (this.ctx.renderer.slotPos.waste?.w || 60) / 2;
    this.ghost.style.transform = `translate(${e.clientX - halfW}px, ${e.clientY - 30}px)`;
    this.targetHighlight(e.clientX, e.clientY);
  }

  targetHighlight(x, y) {
    const game = this.ctx.game();
    if (!game) return;
    const d = this.drag;
    if (!d || !d.run || !d.run.length) return;
    this.ctx.renderer.clearHighlights();
    const slot = this.slotAt(x, y);
    if (!slot) return;
    const name = slot.dataset.slot;
    const ok = this.canDrop(game, d, name);
    slot.classList.add(ok ? 'drop-ok' : 'drop-bad');
  }

  canDrop(game, d, name) {
    if (!d.run || !d.run.length) return false;
    const lead = d.run[0];
    if (name && name.startsWith('f')) {
      if (d.run.length !== 1) return false;
      const fi = parseInt(name.slice(1));
      if (foundationIndexFor(lead) !== fi) return false;
      return foundationFits(game.rules, lead, game.foundations[fi]);
    }
    if (name && name.startsWith('t')) {
      const to = parseInt(name.slice(1));
      if (d.from.kind === 'tableau' && d.from.col === to) return false;
      const dest = game.tableau[to];
      if (!dest.length) return canStartEmptyColumn(game.rules, lead);
      return tableauFits(game.rules, lead, top(dest));
    }
    return false;
  }

  slotAt(x, y) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      const slot = el.closest && el.closest('.slot');
      if (slot) return slot;
    }
    return null;
  }

  onUp(e) {
    if (!this.drag || e.pointerId !== this.drag.pointerId) { return; }
    const d = this.drag;
    this.drag = null;

    if (!d.moved) {
      // tap
      this.handleTap(d);
      return;
    }

    // drop
    const slot = this.slotAt(e.clientX, e.clientY);
    const name = slot ? slot.dataset.slot : null;
    const game = this.ctx.game();
    if (!game) { this.cleanupGhost(d); return; }
    let move = null;
    if (name && this.canDrop(game, d, name)) {
      move = this.buildMove(d, name);
    }
    this.cleanupGhost(d);
    this.ctx.renderer.clearHighlights();
    if (move) {
      this.ctx.do(move);
    } else {
      // invalid drop: restore opacity + small shake
      for (const id of d.ids) {
        const el = this.ctx.renderer.getById(id);
        if (el) { el.style.opacity = ''; el.classList.add('invalid-shake'); setTimeout(() => el.classList.remove('invalid-shake'), 320); }
      }
      this.ctx.audio.invalid();
      this.ctx.sync();
    }
  }

  buildMove(d, name) {
    const from = d.from;
    if (name.startsWith('f')) {
      if (from.kind === 'tableau') return { type: 'tab-to-foundation', from: from.col };
      if (from.kind === 'waste') return { type: 'waste-to-foundation' };
    }
    if (name.startsWith('t')) {
      const to = parseInt(name.slice(1));
      if (from.kind === 'tableau') return { type: 'tab-to-tab', from: from.col, to, count: d.run.length };
      if (from.kind === 'waste') return { type: 'waste-to-tab', to };
    }
    return null;
  }

  handleTap(d) {
    if (d.stockTap) { this.ctx.onStockTap(); return; }
    const id = d.ids[0];
    const game = this.ctx.game();
    if (!game) return;
    // double-tap → send to foundation
    const now = performance.now();
    if (this.lastTap.id === id && now - this.lastTap.t < 320) {
      this.lastTap = { id: null, t: 0 };
      this.sendToFoundation(game, d.from);
      return;
    }
    this.lastTap = { id, t: now };
    // single tap → auto-move to best target
    const move = this.ctx.bestMove(id);
    if (move) this.ctx.do(move);
  }

  sendToFoundation(game, from) {
    let move = null;
    if (from.kind === 'tableau') {
      const card = top(game.tableau[from.col]);
      if (card) {
        const fi = foundationIndexFor(card);
        if (fi >= 0 && foundationFits(game.rules, card, game.foundations[fi])) move = { type: 'tab-to-foundation', from: from.col };
      }
    } else if (from.kind === 'waste') {
      const card = top(game.waste);
      if (card) {
        const fi = foundationIndexFor(card);
        if (fi >= 0 && foundationFits(game.rules, card, game.foundations[fi])) move = { type: 'waste-to-foundation' };
      }
    }
    if (move) this.ctx.do(move); else this.ctx.audio.invalid();
  }

  cleanupGhost(d) {
    if (this.ghost) { this.ghost.remove(); this.ghost = null; }
    for (const id of d.ids) {
      const el = this.ctx.renderer.getById(id);
      if (el) el.style.opacity = '';
    }
  }

  onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    switch (k) {
      case 'z': this.ctx.undo(); break;
      case 'h': this.ctx.hint(); break;
      case 'a': this.ctx.auto(); break;
      case ' ':
      case 'enter': e.preventDefault(); this.ctx.onStockTap(); break;
      case 'n': this.ctx.newGame(); break;
      case 'escape': this.ctx.menu(); break;
    }
  }
}