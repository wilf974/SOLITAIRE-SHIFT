// src/ui/render.js — board renderer. Single card layer, measured slot geometry,
// CSS transitions move cards smoothly between slots (no re-parenting = smooth).

import { SUITS, isRed, rankValue } from '../engine/deck.js';
import { cardArtUrl, backArtUrl } from './art.js';

const SUIT_GLYPH = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const PIP_LAYOUT = {
  1: [0], 2: [0, 1], 3: [0, 1, 2], 4: [0, 1, 2, 3], 5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6], 8: Array.from({ length: 8 }, (_, i) => i),
  9: Array.from({ length: 9 }, (_, i) => i), 10: Array.from({ length: 10 }, (_, i) => i),
};

/** Build one index corner (rank + suit glyph) using DOM nodes, not innerHTML. */
function makeIndex(cls, card) {
  const el = document.createElement('div');
  el.className = 'index ' + cls;
  const r = document.createElement('span');
  r.className = 'r';
  r.textContent = card.rank;
  const s = document.createElement('span');
  s.className = 's';
  s.textContent = SUIT_GLYPH[card.suit];
  el.append(r, s);
  return el;
}

function makeCardEl(card, backId) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = card.id;
  el.dataset.back = backId || 'sunburst-pop';
  el.dataset.suit = card.suit;
  el.dataset.rank = card.rank;
  el.classList.add(isRed(card.suit) ? 'red' : 'black');

  // .card carries POSITION only (translate3d). .card-inner carries the flip +
  // any animation. Keeping them on separate elements means a shake or a flip
  // can never clobber the card's board position.
  const inner = document.createElement('div');
  inner.className = 'card-inner';

  const face = document.createElement('div');
  face.className = 'face';

  const rv = rankValue(card.rank);
  let center;
  if (rv >= 11 || rv === 1) {
    // Court + Ace: generated illustration when available, else a styled monogram.
    center = document.createElement('div');
    center.className = 'court';
    const art = cardArtUrl(card);
    if (art) {
      const img = document.createElement('img');
      img.src = art;
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;
      // if the PNG is missing on disk, silently drop back to the monogram
      img.onerror = () => { img.remove(); center.classList.add('no-art'); face.classList.remove('art-face'); };
      center.appendChild(img);
      center.classList.add('has-art');
      face.classList.add('art-face'); // explicit hook, so we don't rely on :has()
    } else {
      const mono = document.createElement('div');
      mono.className = 'monogram';
      mono.textContent = card.rank;
      const mark = document.createElement('div');
      mark.className = 'suit-mark';
      mark.textContent = SUIT_GLYPH[card.suit];
      center.append(mono, mark);
    }
  } else {
    center = document.createElement('div');
    center.className = `pips r${rv}`;
    for (const _ of PIP_LAYOUT[rv]) {
      const pip = document.createElement('span');
      pip.className = 'pip';
      pip.textContent = SUIT_GLYPH[card.suit];
      center.appendChild(pip);
    }
  }
  face.append(makeIndex('tl', card), center, makeIndex('br', card));

  const back = document.createElement('div');
  back.className = 'back';
  applyBackArt(back, backId);

  inner.append(face, back);
  el.append(inner);
  return el;
}

/** Paint a generated back illustration onto a .back element, if one exists. */
function applyBackArt(backEl, backId) {
  const art = backArtUrl(backId || 'sunburst-pop');
  if (art) {
    backEl.style.backgroundImage = `url("${art}")`;
    backEl.classList.add('has-art');
  } else {
    backEl.style.backgroundImage = '';
    backEl.classList.remove('has-art');
  }
}

export class BoardRenderer {
  constructor(boardEl, cardLayer) {
    this.boardEl = boardEl;
    this.cardLayer = cardLayer;
    this.slots = {}; // name -> element
    this.slotPos = {}; // name -> {x,y} (top-left of slot relative to cardLayer)
    this.cards = new Map(); // id -> element
    this.backId = 'sunburst-pop';
  }

  build(game) {
    this.boardEl.innerHTML = '';
    // top row
    const top = document.createElement('div');
    top.className = 'row top';
    const stock = mkSlot('stock', '↺');
    stock.dataset.label = '↺';
    const waste = mkSlot('waste', '');
    const spacer = document.createElement('div');
    spacer.className = 'spacer';
    const foundations = ['f0', 'f1', 'f2', 'f3'].map((n) => mkSlot(n, SUIT_GLYPH[SUITS[parseInt(n.slice(1))]] || '◆'));
    top.append(stock, waste, spacer, ...foundations);
    this.slots.stock = stock; this.slots.waste = waste;
    foundations.forEach((f, i) => (this.slots['f' + i] = f));

    // tableau row
    const tab = document.createElement('div');
    tab.className = 'row tableau';
    for (let i = 0; i < 7; i++) {
      const col = document.createElement('div');
      col.className = 'col';
      col.dataset.col = i;
      const slot = mkSlot('t' + i, '');
      slot.classList.add('tableau');
      col.appendChild(slot);
      tab.appendChild(col);
      this.slots['t' + i] = slot;
      this.slots['col' + i] = col;
    }
    this.boardEl.append(top, tab);
    this.measure();
  }

  measure() {
    const layerRect = this.cardLayer.getBoundingClientRect();
    // Derive stack offsets from the REAL measured card height. The CSS custom
    // properties are calc() expressions, so parseFloat() on them yields NaN and
    // every card would stack at the same point.
    const probe = this.slots.t0 || this.slots.stock;
    const cardH = probe ? probe.getBoundingClientRect().height : 0;
    const cs = getComputedStyle(document.documentElement);
    const ratio = (name, fallback) => {
      const v = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };
    // px values resolve directly; calc() values fall back to the design ratios
    this.offUp = ratio('--stack-offset-up', cardH * 0.30) || cardH * 0.30;
    this.offDn = ratio('--stack-offset-dn', cardH * 0.055) || cardH * 0.055;
    this.cardH = cardH;

    for (const [name, el] of Object.entries(this.slots)) {
      const r = el.getBoundingClientRect();
      this.slotPos[name] = { x: r.left - layerRect.left, y: r.top - layerRect.top, w: r.width, h: r.height };
    }

    // Guarantee the deepest realistic column still fits inside the layer;
    // compress both offsets proportionally if it would overflow the bottom.
    const tabTop = this.slotPos.t0 ? this.slotPos.t0.y : 0;
    const budget = layerRect.height - tabTop - cardH;
    if (budget > 0) {
      const worst = 6 * this.offDn + 12 * this.offUp;
      if (worst > budget) {
        const scale = Math.max(0.35, budget / worst);
        this.offUp *= scale;
        this.offDn *= scale;
      }
    }
  }

  /** Compute target (x,y) for a card given its location descriptor. */
  posFor(loc, stackIndex, card) {
    const base = this.slotPos[loc.slot];
    if (!base) return { x: 0, y: 0 };
    let y = base.y;
    if (loc.slot.startsWith('t')) {
      // tableau: cumulative offset — face-down uses offDn, face-up uses offUp
      // stackIndex is the card's index in the column; offset accumulates by predecessors
      // (handled by sync via running offset)
      y = base.y + (loc.offset || 0);
    } else if (loc.slot === 'waste') {
      // fan last 3 cards horizontally for draw-3
      y = base.y;
    } else {
      y = base.y;
    }
    return { x: base.x + (loc.dx || 0), y };
  }

  sync(game, opts = {}) {
    const back = this.backId;
    const positions = [];
    // Tableau
    for (let c = 0; c < 7; c++) {
      const pile = game.tableau[c];
      let offset = 0;
      for (let i = 0; i < pile.length; i++) {
        const card = pile[i];
        positions.push({
          id: card.id, card,
          loc: { slot: 't' + c, offset },
          faceUp: card.faceUp,
          draggable: card.faceUp,
          z: i,
        });
        offset += card.faceUp ? this.offUp : this.offDn;
      }
    }
    // Stock — show only top as a back; rest implied
    for (let i = 0; i < game.stock.length; i++) {
      const card = game.stock[i];
      positions.push({ id: card.id, card, loc: { slot: 'stock' }, faceUp: false, draggable: i === game.stock.length - 1 && game.stock.length > 0 ? 'draw' : false, z: i });
    }
    // Waste — top draggable; fan last 3 for draw-3
    const dc = game.rules.drawCount || 1;
    for (let i = 0; i < game.waste.length; i++) {
      const card = game.waste[i];
      const fromTop = game.waste.length - 1 - i;
      const fan = dc === 3 ? Math.min(2, fromTop) : 0;
      const dx = fan * (this.slotPos.waste ? this.slotPos.waste.w * 0.22 : 0);
      positions.push({
        id: card.id, card, loc: { slot: 'waste', dx: -dx }, faceUp: true,
        draggable: fromTop === 0, z: i,
      });
    }
    // Foundations
    for (let f = 0; f < 4; f++) {
      const pile = game.foundations[f];
      for (let i = 0; i < pile.length; i++) {
        const card = pile[i];
        positions.push({ id: card.id, card, loc: { slot: 'f' + f }, faceUp: true, draggable: i === pile.length - 1, z: i });
      }
    }

    // ensure elements
    for (const p of positions) {
      let el = this.cards.get(p.id);
      if (!el) {
        el = makeCardEl(p.card, back);
        el.dataset.back = back;
        this.cardLayer.appendChild(el);
        this.cards.set(p.id, el);
      }
      // face state
      const wasUp = el.classList.contains('faceup');
      if (p.faceUp) { el.classList.add('faceup'); el.classList.remove('facedown'); }
      else { el.classList.remove('faceup'); el.classList.add('facedown'); }
      // position
      const pos = this.posFor(p.loc, 0, p.card);
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      el.style.zIndex = 10 + p.z;
      el.dataset.loc = p.loc.slot;
      el.dataset.draggable = p.draggable ? '1' : '';
      el.dataset.cardId = p.id;
    }
    // remove cards no longer present (shouldn't happen mid-game but safe)
    const ids = new Set(positions.map((p) => p.id));
    for (const [id, el] of this.cards) if (!ids.has(id)) { el.remove(); this.cards.delete(id); }
  }

  setBack(backId) {
    this.backId = backId;
    for (const el of this.cards.values()) {
      el.dataset.back = backId;
      const back = el.querySelector('.back');
      if (back) applyBackArt(back, backId);
    }
  }

  getById(id) { return this.cards.get(id); }
  slotEl(name) { return this.slots[name]; }

  highlightSlot(name, cls) {
    this.clearHighlights();
    const el = this.slots[name];
    if (el) el.classList.add(cls);
  }
  clearHighlights() {
    for (const el of Object.values(this.slots)) el.classList.remove('drop-ok', 'drop-bad');
  }
}

function mkSlot(name, label) {
  const s = document.createElement('div');
  s.className = 'slot ' + (name.startsWith('f') ? 'foundation' : name);
  s.dataset.slot = name;
  if (label) s.dataset.label = label;
  return s;
}