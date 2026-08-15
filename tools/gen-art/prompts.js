// tools/gen-art/prompts.js — the art bible, as machine-readable prompts.
// Build-side only. Never imported by the browser.
//
// Direction: "Sunlit" — bright, sweet, modern mobile-game art. Think a friendly
// cartoon card kingdom: candy colours, chunky rounded shapes, soft cel shading,
// big smiles. Everything should look cheerful on a WHITE card and inviting on a
// sunny table. Absolutely no gloom, no dark backgrounds, no gothic ornament.
//
// HARD RULE: never ask the model for text, numerals, letters, or rank/suit
// indices. Those are drawn programmatically in CSS so they are always crisp
// and always correct. Generated art is *illustration only*.

const STYLE = [
  'Bright, cheerful modern mobile-game illustration.',
  'Clean chunky rounded shapes, bold confident outlines, smooth cel shading with soft gradients.',
  'Candy-bright saturated palette on a light, airy background.',
  'Friendly, charming, fun and full of personality — the art style of a beloved casual puzzle game.',
  'Crisp vector-like finish, glossy highlights, playful and welcoming.',
  'Centered composition with generous margin, clearly readable at small size.',
  'ABSOLUTELY NO text, NO letters, NO numbers, NO words, NO signature, NO watermark.',
].join(' ');

const NEG = 'No text. No letters. No numerals. No captions. No watermark. No signature. Not dark, not gloomy, not gothic, not vintage, not sepia.';

const SUIT_MOOD = {
  spades: { name: 'Spades', mood: 'cool and confident — a breezy blue-sky adventurer', color: 'bright electric blue, sky blue and white' },
  hearts: { name: 'Hearts', mood: 'warm and loving — all hugs and cheer', color: 'coral pink, strawberry red and cream' },
  diamonds: { name: 'Diamonds', mood: 'sparkly and clever — sunshine and shiny gems', color: 'tangerine orange, golden yellow and peach' },
  clubs: { name: 'Clubs', mood: 'bouncy and hearty — fresh leaves and good humour', color: 'fresh mint green, lime and cream' },
};

// Court characters — cute, expressive, each with a clear silhouette.
const COURT_ARCH = {
  J: {
    name: 'Jack',
    who: 'a cheeky young joker-page with a big grin, round friendly face, floppy jester-ish cap and a little cape',
    pose: 'winking and giving a playful thumbs-up, bouncing on one foot',
  },
  Q: {
    name: 'Queen',
    who: 'a sweet, glamorous young queen with sparkling eyes, rosy cheeks, a cute chunky crown and a puffy dress',
    pose: 'beaming with a big warm smile, holding up a heart-shaped flower',
  },
  K: {
    name: 'King',
    who: 'a jolly round king with a huge fluffy beard, chunky crown tilted slightly, cosy robe',
    pose: 'laughing heartily with both arms open in a big welcome',
  },
};

/** All court illustrations: 12 (J/Q/K x 4 suits). */
export function courtPrompts() {
  const out = [];
  for (const [suit, s] of Object.entries(SUIT_MOOD)) {
    for (const [rank, a] of Object.entries(COURT_ARCH)) {
      out.push({
        id: `court-${suit}-${rank}`,
        kind: 'court',
        suit, rank,
        size: '1024x1536',
        prompt: [
          `Cute cartoon character portrait of ${a.who}, ${a.pose}.`,
          `This is the ${a.name} of ${s.name}: ${s.mood}.`,
          `Palette: ${s.color}, on a soft light pastel background with a simple bright halo behind the character.`,
          `Waist-up, centered, big readable head and expressive face, filling the frame with comfortable margin.`,
          `Adorable, funny, full of joy — a character a player would smile at every time they see it.`,
          STYLE,
          NEG,
        ].join(' '),
      });
    }
  }
  return out;
}

/** Ace centerpieces — one showpiece illustration per suit. */
export function acePrompts() {
  return Object.entries(SUIT_MOOD).map(([suit, s]) => ({
    id: `ace-${suit}`,
    kind: 'ace',
    suit, rank: 'A',
    size: '1024x1536',
    prompt: [
      `A big glossy cartoon ${s.name.toLowerCase().replace(/s$/, '')} playing-card suit symbol as a cute mascot emblem,`,
      `centered on a soft light pastel background, with a bright starburst, sparkles and little confetti around it.`,
      `Chunky rounded shape with a glossy highlight, cheerful and bouncy, like a sticker or a game icon.`,
      `Mood: ${s.mood}. Palette: ${s.color}.`,
      `Symmetrical, centered, joyful and celebratory — the showpiece card of the suit.`,
      STYLE,
      NEG,
    ].join(' '),
  }));
}

/** Card backs — collectible, three distinct designs. */
export function backPrompts() {
  return [
    {
      id: 'back-sunburst-pop',
      kind: 'back',
      size: '1024x1536',
      prompt: [
        'Playing-card back design: a big smiling cartoon sun with rosy cheeks at the centre,',
        'chunky rounded sunrays radiating outward, fluffy little clouds and sparkles,',
        'on a warm coral-pink and tangerine background with a clean rounded white border.',
        'Symmetrical, bold, sticker-like, extremely cheerful.',
        STYLE, NEG,
      ].join(' '),
    },
    {
      id: 'back-bubblegum-nebula',
      kind: 'back',
      size: '1024x1536',
      prompt: [
        'Playing-card back design: a dreamy candy galaxy — swirling bubblegum pink, lilac and turquoise clouds',
        'with cute chunky stars, sparkles and a little crescent moon with a smiling face,',
        'clean rounded white border. Symmetrical, magical, sweet and playful.',
        STYLE, NEG,
      ].join(' '),
    },
    {
      id: 'back-mint-crest',
      kind: 'back',
      size: '1024x1536',
      prompt: [
        'Playing-card back design: a cute rounded shield crest with a smiling four-leaf clover in the middle,',
        'surrounded by chunky leaves, bubbles and sparkles, mint green and turquoise with cream accents,',
        'clean rounded white border. Symmetrical, fresh, bouncy and friendly.',
        STYLE, NEG,
      ].join(' '),
    },
  ];
}

/** The table surface the whole game sits on. */
export function tablePrompts() {
  return [
    {
      id: 'table-sunlit-felt',
      kind: 'table',
      size: '1536x1024',
      prompt: [
        'A cheerful game table surface seen straight from above, filling the whole frame.',
        'Bright fresh turquoise-mint felt with a soft clean texture and a gentle light glow in the centre,',
        'decorated with very subtle large pastel shapes: soft rounded card-suit silhouettes and gentle stripes,',
        'in slightly lighter tints of the same turquoise so they barely stand out.',
        'Sunny, clean, modern and inviting — like a playmat in a bright sunlit room.',
        'Extremely subtle and low-contrast so playing cards placed on top remain perfectly readable.',
        'Even bright lighting, no shadows, no objects, no cards, empty surface only.',
        STYLE, NEG,
      ].join(' '),
    },
  ];
}

/**
 * App icons for the installable build (PWA / Play Store).
 * Square, and deliberately simple: an icon is read at 48px on a home screen.
 * The maskable variant keeps everything inside the safe circle, because
 * Android crops icons to whatever shape the launcher uses.
 */
export function iconPrompts() {
  const ICON_SUBJECT = [
    'App icon for a cheerful solitaire card game.',
    'A single playing card standing at a slight angle with a big smiling cartoon sun',
    'peeking from behind it, plus one small heart and one small spade shape.',
    'Bold, chunky, instantly readable at very small size.',
    'Bright turquoise-to-mint background, warm coral and sunny yellow accents.',
  ].join(' ');

  return [
    {
      id: 'icon-source',
      kind: 'icon',
      size: '1024x1024',
      prompt: [
        ICON_SUBJECT,
        'Fills the frame edge to edge with a small even margin. Centered composition.',
        STYLE, NEG,
      ].join(' '),
    },
    {
      id: 'icon-maskable-source',
      kind: 'icon',
      size: '1024x1024',
      prompt: [
        ICON_SUBJECT,
        'IMPORTANT: keep the entire subject well inside the central circle, with a',
        'generous solid-colour border all around, because the outer edges will be',
        'cropped away. The background colour must extend fully to every edge.',
        STYLE, NEG,
      ].join(' '),
    },
  ];
}

/**
 * Play Store feature graphic. Google shows it at 1024x500 and crops the sides
 * on narrow screens, so the subject must sit in the middle. It must carry no
 * text: Google overlays the app name itself, and our prompts never ask for
 * lettering anyway.
 */
export function bannerPrompts() {
  return [
    {
      id: 'feature-graphic-source',
      kind: 'banner',
      size: '1536x1024',
      prompt: [
        'Wide banner artwork for a cheerful solitaire card game.',
        'A fan of bright playing cards spread across the middle of the frame,',
        'with a big smiling cartoon sun rising behind them, fluffy clouds and',
        'floating sparkles. Chunky rounded shapes, glossy highlights.',
        'Turquoise-to-mint sky with warm coral and sunny yellow accents.',
        'Keep the main subject centred with plenty of clear background on the',
        'left and right, because the sides will be cropped.',
        STYLE, NEG,
      ].join(' '),
    },
  ];
}

/**
 * Power icons. These sit in a bar at ~26px, so they must read as a silhouette
 * first and detail second — the opposite of the court cards. Each is drawn on
 * a transparent background so it can sit on the white power button without a
 * visible tile behind it.
 */
export function powerIconPrompts() {
  const ICON_STYLE = [
    'Single game-icon object, centered, filling most of the square with a small margin.',
    'Chunky rounded shapes, thick confident outline, smooth cel shading, one glossy highlight.',
    'Bold and instantly readable as a silhouette at very small size.',
    'Plain flat white background, no scene, no frame, no border, no shadow beneath.',
    'ABSOLUTELY NO text, NO letters, NO numbers, NO words, NO watermark.',
  ].join(' ');

  const ICONS = [
    ['power-peek', 'A friendly cartoon eye with a bright turquoise iris, long lashes and a sparkle, peeking over the top edge of a playing card. Palette: turquoise, white and coral.'],
    ['power-ace-call', 'A red heart-suit ace card flying upward with a golden motion trail and sparkles behind it, as if launched. Palette: coral red, sunny yellow and white.'],
    ['power-reshuffle', 'Two playing cards crossing in an X with curved arrows swirling around them, suggesting a shuffle. Palette: violet, sky blue and white.'],
    ['power-reserve', 'An open drawer or slot with a single playing card tucked halfway into it, glowing softly. Palette: mint green, cream and white.'],
    ['power-undo', 'A thick curved arrow looping backwards over a small stack of playing cards. Palette: sky blue, deep blue and white.'],
    ['power-time', 'A cheerful hourglass with sunny yellow sand and a little plus-shaped sparkle beside it. Palette: sunny yellow, tangerine and white.'],
  ];

  return ICONS.map(([id, subject]) => ({
    id,
    kind: 'power-icon',
    size: '1024x1024',
    prompt: [subject, ICON_STYLE, NEG].join(' '),
  }));
}

/** Shared recipe for the small square icons used across the menus. */
const SMALL_ICON_STYLE = [
  'Single game-icon object, centered, filling most of the square with a small margin.',
  'Chunky rounded shapes, thick confident outline, smooth cel shading, one glossy highlight.',
  'Bold and instantly readable as a silhouette at very small size.',
  'Plain flat white background, no scene, no frame, no border, no shadow beneath.',
  'ABSOLUTELY NO text, NO letters, NO numbers, NO words, NO watermark.',
].join(' ');

/** Mode icons for the main menu — one per game mode. */
export function modeIconPrompts() {
  const MODES = [
    ['mode-adventure', 'A rolled-open treasure map with a dotted path and a small red X, one corner curling. Palette: warm parchment cream, coral and turquoise.'],
    ['mode-timed', 'A cheerful round stopwatch tilted slightly, with a sunny yellow face and a little motion swoosh. Palette: coral red, sunny yellow and white.'],
    ['mode-tide', 'A friendly curling ocean wave with a rounded crest and foam bubbles, one playing card riding it. Palette: turquoise, deep sea blue and white.'],
    ['mode-classic', 'A neat stack of playing cards seen at a slight angle, the top one showing a bold black club. Palette: white, deep navy and turquoise.'],
    ['mode-journey', 'A signpost on a small grassy hill with a four-pointed sparkle above it. Palette: mint green, cream and sunny yellow.'],
    ['mode-daily', 'A tear-off desk calendar page with a smiling sun above it. Palette: coral red, cream and sunny yellow.'],
    ['mode-contract', 'A rolled scroll tied with a ribbon, a wax seal at its centre. Palette: parchment cream, deep red and gold.'],
    ['mode-ascension', 'A stepped mountain peak with a small flag planted at the summit and a sparkle. Palette: violet, sky blue and white.'],
    ['mode-zen', 'Three smooth stacked zen pebbles with a small leaf resting on top. Palette: soft sage green, cream and turquoise.'],
  ];
  return MODES.map(([id, subject]) => ({
    id, kind: 'mode-icon', size: '1024x1024',
    prompt: [subject, SMALL_ICON_STYLE, NEG].join(' '),
  }));
}

/** Difficulty icons for the placement-rule picker. */
export function difficultyIconPrompts() {
  const LEVELS = [
    ['diff-gentle', 'A small green sprout with two round leaves growing from soft soil. Palette: fresh green, mint and cream.'],
    ['diff-standard', 'A single playing card standing upright showing a bold black spade. Palette: white, deep navy and turquoise.'],
    ['diff-sharp', 'A cheerful cartoon flame with a rounded friendly shape. Palette: tangerine orange, sunny yellow and coral.'],
    ['diff-suited', 'Two red heart-suit symbols stacked neatly one above the other, glossy and rounded. Palette: coral red, strawberry and cream.'],
    ['diff-brutal', 'A cute cartoon skull with big round eye sockets, more charming than scary, a tiny sparkle beside it. Palette: bone white, deep navy and violet.'],
  ];
  return LEVELS.map(([id, subject]) => ({
    id, kind: 'difficulty-icon', size: '1024x1024',
    prompt: [subject, SMALL_ICON_STYLE, NEG].join(' '),
  }));
}

/**
 * Battle mode art: the four bosses and the four combat abilities.
 * Bosses are characters with a readable silhouette — they appear at ~40px in
 * the health bar, so personality has to survive the shrink.
 */
export function battlePrompts() {
  const BOSSES = [
    ['boss-gardien', 'A stout stone-golem guardian carved from turquoise rock, arms crossed, one glowing eye, moss on its shoulders. Stoic and immovable, more grumpy than frightening. Palette: turquoise stone, mint moss and cream.'],
    ['boss-apprenti', 'A young broom-wielding apprentice in an oversized cloak, sleeves too long, determined frown, a stack of cards tucked under one arm. Eager and slightly clumsy. Palette: sky blue, cream and soft yellow.'],
    ['boss-illusionniste', 'A theatrical masked illusionist with a wide grin-mask held on a stick, a swirl of playing cards fanning around, purple cape. Mischievous, not menacing. Palette: violet, magenta and gold.'],
    ['boss-ferrailleur', 'A burly scrap-metal brawler with a blunt hammer over one shoulder, riveted armour plates, jaw set. Brutish and direct. Palette: iron grey, rust orange and cream.'],
    ['boss-horloger', 'A clockmaker figure whose chest is an open pocket-watch with visible gears, brass goggles, a pendulum swinging beside. Precise and severe. Palette: brass gold, deep blue and cream.'],
    ['boss-corbeau', 'A sleek crow-masked thief in a feathered cloak, one gloved hand holding a stolen golden card, head tilted slyly. Palette: ink black, iridescent violet and gold.'],
    ['boss-jumelles', 'Twin girls standing back to back in matching harlequin outfits, one smiling and one scowling, each holding a fan of cards. Palette: coral pink, teal and cream.'],
    ['boss-souveraine', 'A regal queen on a throne of stacked playing cards, tall crown, flowing crimson robe, chin raised imperiously. Commanding and grand. Palette: crimson, gold and deep navy.'],
    ['boss-gardienne', 'A tall shield-maiden in polished plate, an enormous tower shield planted before her, calm unblinking stare. Palette: silver steel, sky blue and white.'],
    ['boss-alchimiste', 'A hunched alchemist with round spectacles holding a bubbling green flask, vials strapped across the chest, a wisp of smoke curling. Palette: acid green, copper and cream.'],
    ['boss-marionnettiste', 'A tall gaunt puppeteer holding a control bar, thin strings descending, a small card-puppet dangling below, faint smile. Palette: deep plum, dusty rose and cream.'],
    ['boss-faucheur', 'A cloaked harvester carrying a curved scythe made of a giant playing card, wheat stalks at the belt, shadowed face with two calm eyes. Palette: wheat gold, dusk blue and cream.'],
    ['boss-sirene', 'A mermaid perched on a rock, long flowing hair, singing with eyes closed, ribbons of water and cards spiralling around her. Palette: aqua, seafoam and pearl.'],
    ['boss-colosse', 'An enormous armoured titan seen from the chest up, tiny head atop massive shoulders, fists like boulders. Palette: granite grey, ember orange and cream.'],
    ['boss-archiviste', 'A stern librarian buried in scrolls and ledgers, quill behind the ear, one finger raised as if correcting you. Palette: parchment cream, ink blue and burgundy.'],
    ['boss-astrologue', 'A robed stargazer peering through a brass telescope, constellations and small cards orbiting the head. Palette: midnight blue, starlight gold and violet.'],
    ['boss-forgeron', 'A soot-covered blacksmith at an anvil, hammer raised, a molten crown glowing on the anvil, sparks flying. Palette: charcoal, molten orange and ember red.'],
    ['boss-oracle', 'A blindfolded seer with arms outstretched, a third eye glowing on the forehead, cards floating in a halo around the head. Palette: pale gold, deep indigo and white.'],
    ['boss-jumeau', 'A mirror-image duelist: a figure facing the viewer whose reflection ripples slightly out of sync, both holding identical cards. Palette: silver, glacier blue and white.'],
    ['boss-croupier', 'An impeccably dressed eternal croupier in top hat and waistcoat, dealing cards that trail golden light, knowing half-smile. Palette: emerald green, gold and black.'],
  ];

  const ABILITIES = [
    ['battle-strike', 'A glossy cartoon sword striking downward with a bright impact flash and speed lines. Palette: coral red, sunny yellow and white.'],
    ['battle-guard', 'A chunky rounded shield seen head-on with a soft protective glow around it. Palette: sky blue, deep blue and white.'],
    ['battle-focus', 'A swirling spiral of concentration with a bright eye at its centre and small sparkles. Palette: violet, turquoise and white.'],
    ['battle-surge', 'A bold lightning bolt with several playing cards flying upward around it in a burst. Palette: sunny yellow, tangerine and white.'],
  ];

  const bosses = BOSSES.map(([id, subject]) => ({
    id, kind: 'boss', size: '1024x1024',
    prompt: [
      `Cute cartoon character portrait of a game boss: ${subject}`,
      'Waist-up, centered, big readable silhouette, facing the viewer.',
      'Formidable but charming — a boss a player enjoys losing to once.',
      'Plain flat white background, no scene, no frame, no border.',
      STYLE, NEG,
    ].join(' '),
  }));

  const abilities = ABILITIES.map(([id, subject]) => ({
    id, kind: 'battle-icon', size: '1024x1024',
    prompt: [subject, SMALL_ICON_STYLE, NEG].join(' '),
  }));

  return [...bosses, ...abilities];
}

/** The Battle entry in the main menu. */
export function battleModeIconPrompt() {
  return [{
    id: 'mode-battle',
    kind: 'mode-icon',
    size: '1024x1024',
    prompt: [
      'Two crossed cartoon swords in front of a playing card, with a small burst behind them.',
      'Palette: coral red, sunny yellow and deep navy.',
      SMALL_ICON_STYLE, NEG,
    ].join(' '),
  }];
}

/**
 * Boss loot: the card backs and table felts unlocked by beating a boss.
 * Each echoes the boss it came from, so the reward is recognisable.
 */
export function lootPrompts() {
  const BACKS = [
    ['back-stone-seal', 'a carved stone seal with a glowing turquoise rune at its centre, moss creeping at the corners, on slate-grey and mint'],
    ['back-clockwork', 'interlocking brass gears and a clock face with delicate hands, on deep blue with warm brass accents'],
    ['back-raven-feather', 'a single large iridescent raven feather crossed with a small golden key, on ink black with violet sheen'],
    ['back-royal-velvet', 'a crowned monogram medallion on rich crimson velvet with gold braid framing'],
    ['back-tide-glass', 'a swirling wave of translucent sea-glass with tiny bubbles and a pearl at the centre, on aqua and seafoam'],
    ['back-star-chart', 'a constellation map with linked stars and a crescent moon, on midnight blue with gold starlight'],
    ['back-ember-forge', 'a glowing forge ember with sparks rising and a hammer silhouette, on charcoal with molten orange'],
    ['back-mirror-shard', 'a cracked mirror shard reflecting a second, offset pattern, on glacier blue and silver'],
    ['back-house-gold', 'an ornate art-deco fan of gold rays around a small spade emblem, on deep emerald green'],
  ];

  const TABLES = [
    ['table-workshop', 'a worn wooden workbench surface with faint tool marks and pale sawdust'],
    ['table-anvil', 'a dark iron surface with faint hammer dents and a warm ember glow at the edges'],
    ['table-laboratory', 'a pale marble bench with faint alchemical circles etched in soft copper'],
    ['table-theatre', 'deep red stage velvet with faint gold rope patterning'],
    ['table-harvest', 'a warm wheat-gold woven surface with faint stalk textures'],
    ['table-library', 'a green leather desktop with faint gold tooling at the border'],
    ['table-sanctum', 'a pale stone floor with a faint luminous circle and soft indigo shadow'],
  ];

  const backs = BACKS.map(([id, subject]) => ({
    id, kind: 'back', size: '1024x1536',
    prompt: [
      `Playing-card back design: ${subject}.`,
      'Symmetrical, centered, with a clean rounded border. Bold and sticker-like.',
      STYLE, NEG,
    ].join(' '),
  }));

  const tables = TABLES.map(([id, subject]) => ({
    id, kind: 'table', size: '1536x1024',
    prompt: [
      `A game table surface seen straight from above, filling the whole frame: ${subject}.`,
      'Extremely subtle and low-contrast so playing cards placed on top stay perfectly readable.',
      'Even lighting, no objects, no cards, empty surface only.',
      STYLE, NEG,
    ].join(' '),
  }));

  return [...backs, ...tables];
}

/** Everything, in generation order (cheap/high-impact first). */
export function allPrompts() {
  return [
    ...tablePrompts(), ...iconPrompts(), ...bannerPrompts(),
    ...powerIconPrompts(), ...modeIconPrompts(), ...difficultyIconPrompts(),
    ...battlePrompts(), ...battleModeIconPrompt(), ...lootPrompts(),
    ...backPrompts(), ...acePrompts(), ...courtPrompts(),
  ];
}

export const GROUPS = {
  table: tablePrompts, back: backPrompts, ace: acePrompts,
  court: courtPrompts, icon: iconPrompts, banner: bannerPrompts,
  power: powerIconPrompts, mode: modeIconPrompts, difficulty: difficultyIconPrompts,
  battle: () => [...battlePrompts(), ...battleModeIconPrompt()],
  loot: lootPrompts,
  all: allPrompts,
};