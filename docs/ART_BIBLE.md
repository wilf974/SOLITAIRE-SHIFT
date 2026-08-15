# Art Bible — SOLITAIRE: SHIFT

Identity: **"Sunlit"** — bright, sweet, modern casual-game art. A friendly card
kingdom in the sunshine. Everything should make a player want to tap it.

The single rule that governs every decision: **the cards must be instantly
readable, and the game must look like fun.** Anything that fights either one is
wrong, however pretty it is.

---

## Palette

| Token | Value | Role |
|---|---|---|
| `--sky-1 / 2 / 3` | `#ffd8a8` `#ff9eb5` `#9b8cff` | sunrise sweep behind the table |
| `--felt` | `#1fc0ad` | the table: fresh candy teal |
| `--felt-2 / 3` | `#35dcc6` `#10a091` | table highlight / shade |
| `--gold` | `#ffc93c` | sunshine — the accent, coins, primary buttons |
| `--gold-2 / deep` | `#ffe27a` `#f08a24` | light sunshine / tangerine |
| `--card-face` | `#ffffff` | cards are white, always |
| `--ink` | `#1e2433` | text |
| `--good / bad` | `#17c964` `#ff4d6d` | valid drop / invalid drop |

### Suit colours — non-negotiable
Spades and clubs are **black** (`#1e2433`). Hearts and diamonds are **red**
(`#e03131`). A four-colour deck was tried and rejected: a green club reads as a
different suit at a glance and costs the player a beat of thought on every move.
Traditional colours are what a solitaire player's eye already knows.

The card face carries no suit tint anywhere else — the inner ring is neutral
grey — so nothing competes with that signal.

---

## Card anatomy

```
┌──────────────┐
│ A            │  rank + suit index, top-left
│ ♥            │
│              │
│       art    │  pips (2–10) or generated illustration (A, J, Q, K)
│              │
│            ♥ │  index repeated, rotated 180°, bottom-right
│            A │
└──────────────┘
```

- **Indices and pips are drawn in CSS**, never generated. They must be crisp at
  40px wide and never wrong. Generated art is illustration *only*.
- **2–10** use classic pip grids, lower half rotated 180° per convention.
- **A, J, Q, K** use a generated illustration filling the card, with the two
  indices floating on top in soft white pills so they stay legible over art.
- Corner radius is generous, shadows are soft and warm — cards look like objects
  you want to pick up, not documents.

## Motion

Springy, quick, never floaty. `--pop: cubic-bezier(0.34, 1.56, 0.64, 1)` gives
buttons and purchases a small overshoot.

`.card` carries **position only** (`translate3d`). `.card-inner` carries the 3D
flip and every animation. They are separate elements so a shake or a flip can
never clobber a card's board position.

| Event | Motion |
|---|---|
| Move | 0.22s ease to the new slot |
| Flip | 0.3s `rotateY` on `.card-inner` |
| Invalid drop | 0.32s shake on `.card-inner` |
| Hint | two 0.7s glow pulses |
| Win | confetti fall + rising arpeggio |

`prefers-reduced-motion` and the in-game Reduce Motion setting both disable all
of it.

## Sound

Fully synthesised WebAudio — no asset files. Short, soft, never shrill.
Foundation placements rise a semitone per consecutive card, so a good run
*sounds* like a good run.

---

## Generated art

Twelve courts (J/Q/K × 4 suits), four aces, three card backs, one table.
Generated at build time by `tools/gen-art/generate.js`, committed as PNGs.

### Direction
Bright cheerful mobile-game illustration. Chunky rounded shapes, bold outlines,
smooth cel shading, glossy highlights, candy-bright saturated colour on light
airy backgrounds. Characters are cute and expressive with big readable faces —
the Jack winks, the Queen beams, the King laughs.

Each suit tints its own personality: spades cool blue, hearts warm coral,
diamonds sunny tangerine, clubs fresh mint.

### Hard constraints
1. **Never ask for text.** No letters, numerals, words, signatures, watermarks.
   Every prompt states this twice. Ranks come from CSS.
2. **Never dark.** No gloom, no gothic, no sepia. The negative prompt says so.
3. **Readable small.** A court illustration must still read as a character at
   40×56px.
4. **The table must recede.** Its decoration sits in near-identical tints of the
   same teal so cards on top stay perfectly readable.

### Fallback
If the manifest or a PNG is missing, every art lookup returns `null` and the
renderer falls back to programmatic CSS art — pip aces, monogram courts, gradient
backs. **The game always runs**, with or without generated assets.

### Cache
Generation is keyed on a hash of `(model, size, prompt)`. Editing a prompt
regenerates only what changed. The runtime appends that hash as a `?v=` query so
regenerated art is never served stale from cache.
