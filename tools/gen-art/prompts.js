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

/** Everything, in generation order (cheap/high-impact first). */
export function allPrompts() {
  return [
    ...tablePrompts(), ...iconPrompts(), ...bannerPrompts(),
    ...powerIconPrompts(), ...modeIconPrompts(), ...difficultyIconPrompts(),
    ...backPrompts(), ...acePrompts(), ...courtPrompts(),
  ];
}

export const GROUPS = {
  table: tablePrompts, back: backPrompts, ace: acePrompts,
  court: courtPrompts, icon: iconPrompts, banner: bannerPrompts,
  power: powerIconPrompts, mode: modeIconPrompts, difficulty: difficultyIconPrompts,
  all: allPrompts,
};