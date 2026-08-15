# SOLITAIRE: SHIFT

A bright, playful **Klondike solitaire** for the browser, with spendable
powers and three modes you won't find in a standard deck.
**The game's UI is in French.**

### ▶ [Play it here](https://wilf974.github.io/SOLITAIRE-SHIFT/)

> **Reprendre le travail ?** Lisez [`ETAT.md`](ETAT.md) : où en est le projet,
> ce qu'il reste à faire, et les décisions à ne pas défaire.

Best on a wide window — the board wants seven columns side by side. Installable
from the browser menu, and playable offline once installed. An Android build
lives in [`android/`](android/).

Play a hand, earn coins, spend them on powers you trigger mid-game. Real
Klondike underneath — a genuine solver validates every progression deal, so a
fair game is always winnable.

- Vanilla JS ES modules. **No build step. No runtime dependencies. No npm install.**
- Card and table art generated with OpenAI at build time, committed as PNGs.
  **Players never need an API key.**

---

## Run it

```bash
npm run serve          # → http://127.0.0.1:4317/
```

That's the whole setup. `tools/serve.js` is a dependency-free static server; if
the port is busy it steps to the next free one. Override it if you like:

```bash
node tools/serve.js 8080
PORT=8080 npm run serve
```

Any static host works too — the project is plain files.

## Test it

```bash
npm test               # 125 tests: engine, shuffle, traits, solver, save, progression, powers
npm run check          # parse every JS file (node --check per file)
```

The solver test really solves a deal and replays the solution to a win, so the
suite takes ~20s.

---

## The game

### Playing a hand
Drag a card, or tap it to auto-move, or double-tap to send it to a foundation.
Keyboard: `Z` undo · `H` hint · `A` auto-complete · `Space` draw · `N` new · `Esc` menu.

The moment a hand becomes a formality — every card face-up, nothing left to
decide — the game **finishes it for you**, cascading the rest home instead of
asking for fifty more clicks.

### Difficulty
Classique, Zen, Chrono, Marée and the Daily let you pick how cards stack:

| Level | Rule | Pays |
|---|---|---|
| 🌱 Tranquille | Any card opens an empty column | ×0.7 |
| ♠️ Classique | Red on black, black on red | ×1 |
| 🔥 Corsé | Draw three, two recycles only | ×1.4 |
| ❤️ Même enseigne | Hearts on hearts, spades on spades | ×1.9 |
| 💀 Impitoyable | Same suit, draw three, no undo | ×2.8 |

Harder levels multiply both coins and XP. Authored modes (Aventure, Contrats,
Ascension, Parcours) carry their own rules and ignore this setting.

### Powers
Coins are earned by playing. They buy **charges** of tactical powers, shown on a
bar along the bottom of the screen and spent during a hand.

| Power | Cost | What it does |
|---|---|---|
| 👁️ Clairvoyance | 40 | Reveals the deepest face-down card |
| ⏪ Remontée | 60 | Undoes the last three moves at once |
| 🔀 Rebattre | 70 | Shuffles the remaining stock |
| ⏳ Sursis | 80 | Adds 45 seconds (Chrono only) |
| 🎯 Appel d'As | 90 | Sends an available Ace straight home |
| 📥 Réserve | 120 | Sets one card aside; play it back whenever |

Every use costs a charge, so powers create decisions rather than erasing
difficulty. **Nothing plays itself.**

**What this game will never do:** no purchases, no premium currency, no ads, no
loot boxes, no energy meter, no timed FOMO. Coins come from playing. That is the
entire economy.

### Modes
| Mode (in game) | What it is |
|---|---|
| **Aventure** | Eight authored chapters, each with its own rule and story |
| **Chrono** | Beat the clock at 3, 5 or 10 minutes — the deal is always solvable |
| **Marée** | Every N moves the sea rises and deals a card onto every column |
| **Classique** | Pure Klondike, random deal — the traditional gamble |
| **Parcours** | The main path; traits appear as you climb ranks |
| **Donne du jour** | One solver-validated deal a day, identical for everyone |
| **Contrats** | Six curated challenges with strange rules (rank 2+) |
| **Ascension** | Escalating win-streak run, one harder trait per level (rank 3+) |
| **Zen** | Relaxed, always solver-validated |

### Traits
Fourteen unlockable **rule** modifiers — not powers. Each is one sentence, each
carries a difficulty value, and harder combinations pay more XP. Veterans get
*more options*, never *stronger abilities*.

**Placement:** `Même enseigne (+4)` — cœur sur cœur · `Même teinte (+2)` — rouge
sur rouge · `Enseigne changeante (+1)` · `Couleur libre (−2)` · `Monde inversé (+2)`
· `Tableau ascendant (+2)` · `Boucle (+1)`

**Stock:** `Pioche par trois (+1)` · `Pioche par cinq (+3)` · `Deux passes (+1)` ·
`Passe unique (+2)` · `Sans recyclage (+3)`

**Columns:** `Colonnes libres (−2)` · `Colonnes scellées (+4)` · `Rois seulement (0)`

**Restrictions:** `Cartes seules (+2)` · `Sans retour (+1)` · `Retours comptés (+1)`
· `Mains nues (+2)` — no powers this deal

### Progression
XP and ranks, plus unlocks gated on **deeds** rather than raw XP: win with No
Recycle, hold a 5-game streak, clear a Daily, win with three hard traits at
once. Adventure tracks cleared chapters; Chrono keeps your best time; Marée
keeps your deepest survival. Card backs, court families, themes and secrets.

### Fairness
Adventure, Journey, Daily, Contract, Ascension, Chrono and Zen deals are
validated by a real bounded-DFS solver with a transposition table. A deal that
comes back `unsolvable` **or** `unknown` is rejected and a new seed is tried —
validation is never faked. Two modes are deliberately unvalidated and say so:
**Classique** stays random because that's the traditional game, and **Marée**
cannot be validated at all — the board changes as you play, so there is no fixed
solution to prove. It is a survival mode, not a puzzle.

---

## Regenerating the art

Art lives in `src/assets/art/` with a `manifest.json`, and is committed. You only
need this if you want to change the art direction.

```bash
cp .env.example .env       # then put your key in it
node tools/gen-art/generate.js --dry-run   # show the plan, call nothing
node tools/gen-art/generate.js             # generate whatever is missing
node tools/gen-art/generate.js court --force
```

Groups: `table` · `back` · `ace` · `court` · `all`. Generation is cached by a hash
of `(model, size, prompt)`, so editing a prompt in `tools/gen-art/prompts.js`
regenerates only what changed.

### Key handling
`OPENAI_API_KEY` is read at build time from the environment or a local `.env`.
It is **never** printed, logged, written into any output file, embedded in any
asset, or shipped to the browser — anything key-shaped is scrubbed from error
output before it can reach a log. `.env` is gitignored; `.env.example` holds only
the empty key name. The finished game is static files and needs no key at all.

### Art rules
Prompts never ask for text, letters, or numerals — ranks and suit indices are
drawn programmatically in CSS so they're always crisp and always correct.
Generated images are illustration only. If the manifest or a PNG is missing,
every lookup returns null and the renderer falls back to its programmatic CSS
art: **the game always runs.**

---

## Layout

```
index.html              shell, HUD, modal root
styles/
  base.css              tokens, sunrise sky, board grid, slots
  cards.css             card faces, pips, court panels, backs, motion
  ui.css                menus, panels, overlays
  bright.css            the "Sunlit" look + idle UI (loaded last, wins ties)
src/
  main.js               bootstrap
  app.js                orchestrator: engine ↔ renderer ↔ meta ↔ modes ↔ UI
  modes.js              deal generation per mode (solver-validated)
  engine/               pure, DOM-free, deterministic
    rng.js              mulberry32 + string seed hashing
    deck.js  game.js    cards, rules, legal moves, undo, scoring
    traits.js           the 14 rule modifiers
    solver.js           bounded iterative DFS solvability validator
    powers-fx.js        what each power does to a game state (pure)
    serialize.js        save/restore a game
  meta/
    storage.js          versioned localStorage profile + export/import
    mastery.js          XP, tiers, condition-based unlocks
    powers.js           coins, power charges, purchases
    difficulty.js       the five-rung difficulty ladder
  ui/
    render.js           measured-geometry board renderer
    interaction.js      pointer drag/tap/keyboard
    audio.js            synthesised WebAudio SFX (no asset files)
    art.js              runtime lookup of the generated art manifest
tools/
  serve.js              zero-dep static server
  check-syntax.js       parse every JS file
  gen-art/              build-side OpenAI art pipeline
tests/                  node:test, 125 tests
```

### Design notes
- **Determinism.** No `Math.random()` in the engine. A seed reproduces a deal exactly.
- **Position vs. motion.** `.card` carries only `translate3d` position; `.card-inner`
  carries the 3D flip and every animation, so a shake can never clobber board position.
- **Measured geometry.** Stack offsets come from real measured card height, and
  compress automatically so the deepest column always fits the screen.
- **Persistence.** Versioned schema with migration; idle state is settled on tick,
  on tab-hide, and on unload, so coins survive a crash.

## Save data

Everything is local (`localStorage`, key `solitaire-shift:profile:v1`). Settings →
Export copies a base64 save to the clipboard; Import restores it. No account, no
server, no telemetry.
