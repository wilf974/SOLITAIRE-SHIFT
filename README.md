# SOLITAIRE: SHIFT

A bright, playful **idle Klondike solitaire** for the browser.

Play a hand yourself, hire dealers who keep playing while you're away, and spend
the coins on upgrades. Real Klondike underneath — a genuine solver validates
every progression deal, so a fair game is always winnable.

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
npm test               # 83 tests: engine, shuffle, traits, solver, save, progression, idle
npm run check          # parse every JS file (node --check per file)
```

The solver test really solves a deal and replays the solution to a win, so the
suite takes ~20s.

---

## The game

### Playing a hand
Drag a card, or tap it to auto-move, or double-tap to send it to a foundation.
Keyboard: `Z` undo · `H` hint · `A` auto-complete · `Space` draw · `N` new · `Esc` menu.

### The idle loop
| | |
|---|---|
| **Play** | Finish a hand → earn coins |
| **Hire** | Coins buy dealers (Apprentice → Croupier → Hustler → Magician → Automaton → Oracle) |
| **Idle** | Dealers earn coins every second, online and off |
| **Upgrade** | Permanent multipliers on idle income and on your own wins |

Dealers you've hired actually play a **visible game on the table behind the
menu** — the faster your income, the faster they play.

Offline earnings accrue while the tab is closed, capped at 8 hours. Nothing
decays, nothing expires, nothing is lost by not logging in.

**What this game will never do:** no purchases, no premium currency, no ads, no
loot boxes, no energy meter, no timed FOMO. Coins come from playing and from
dealers you bought with coins. That is the entire economy.

### Modes
| Mode | What it is |
|---|---|
| **Classic** | Pure Klondike, random deal — the traditional gamble |
| **Journey** | The main path; traits appear as you climb tiers |
| **Daily Deal** | One solver-validated deal a day, identical for everyone |
| **Contracts** | Six curated challenges with strange rules (tier 2+) |
| **Ascension** | Escalating win-streak run, one harder trait per level (tier 3+) |
| **Zen** | Relaxed, always solver-validated |

### Traits
Fourteen unlockable **rule** modifiers — not powers. Each is one sentence, each
carries a difficulty value, and harder combinations pay more XP. Veterans get
*more options*, never *stronger abilities*.

`Draw Three (+1)` · `Single Pass (+2)` · `No Recycle (+3)` · `Free Empties (−2)` ·
`Locked Empties (+4)` · `Same Suit (+2)` · `Any Colour (−2)` · `No Sequences (+2)` ·
`Foundations Down (+1)` · `Wrap Around (+1)` · `Reverse Tableau (+2)` ·
`No Undo (+1)` · `Limited Undo (+1)` · `Kings Only (0)`

### Progression
XP and tiers, plus unlocks gated on **deeds** rather than raw XP: win with No
Recycle, hold a 5-game streak, clear a Daily, win with three hard traits at
once. Card backs, court families, themes, achievements and a few secrets.

### Fairness
Journey, Daily, Contract, Ascension and Zen deals are validated by a real
bounded-DFS solver with a transposition table. A deal that comes back
`unsolvable` **or** `unknown` is rejected and a new seed is tried — validation is
never faked. Classic stays random on purpose, because that's the traditional game.

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
    serialize.js        save/restore a game
  meta/
    storage.js          versioned localStorage profile + export/import
    mastery.js          XP, tiers, condition-based unlocks
    idle.js             coins, dealers, upgrades, offline accrual
  ui/
    render.js           measured-geometry board renderer
    interaction.js      pointer drag/tap/keyboard
    audio.js            synthesised WebAudio SFX (no asset files)
    art.js              runtime lookup of the generated art manifest
tools/
  serve.js              zero-dep static server
  check-syntax.js       parse every JS file
  gen-art/              build-side OpenAI art pipeline
tests/                  node:test, 83 tests
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
