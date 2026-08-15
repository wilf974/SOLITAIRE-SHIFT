// tools/gen-voice/lines.js — every spoken line in the game.
//
// Build-side only. The generated .mp3 files are committed; the API key is not.
//
// Voice casting: the model is multilingual, so an English-labelled voice still
// speaks French — what matters is the timbre, which is what gives each boss a
// distinct presence. One line per boss for the entrance, one for victory and
// one for defeat, kept short so they never delay play.

// Chosen from the account's available voices, by character rather than accent.
const VOICES = {
  // Le Gardien — stone, slow, immovable
  gardien: 'nPczCjzI2devNBz1zQrb',      // Brian: deep, resonant
  // L'Illusionniste — theatrical, mischievous
  illusionniste: 'N2lVS1w4EtoT3dr4eOWO', // Callum: husky trickster
  // L'Horloger — precise, severe, formal
  horloger: 'onwK4e9ZLuTAKqWW03F9',      // Daniel: steady, formal
  // La Souveraine — regal, commanding
  souveraine: 'pFZP5JQG7iQjIQuC4Bku',    // Lily: velvety, confident
  // The narrator, for shared battle moments
  narrator: '4p5WXd3ZuWR9pPtRQuxC',      // Jean Petit: French, serious
};

/** A boss speaks three times: entering, winning, losing. */
function bossLines(id, voiceId, { enter, win, lose }) {
  return [
    { id: `boss-${id}-enter`, voiceId, text: enter },
    { id: `boss-${id}-win`,   voiceId, text: win },
    { id: `boss-${id}-lose`,  voiceId, text: lose },
  ];
}

export const LINES = [
  ...bossLines('gardien', VOICES.gardien, {
    enter: 'Rien ne passe. Rien ne bouge. Vous non plus.',
    win: 'La pierre ne cède jamais.',
    lose: 'Impossible… vous m’avez… déplacé.',
  }),

  ...bossLines('illusionniste', VOICES.illusionniste, {
    enter: 'Regardez bien. Ou plutôt, ne regardez pas.',
    win: 'Vous avez vu ce que je voulais que vous voyiez.',
    lose: 'Vous avez percé le truc. Bravo, sincèrement.',
  }),

  ...bossLines('horloger', VOICES.horloger, {
    enter: 'Chaque seconde vous appartient de moins en moins.',
    win: 'Le temps était de mon côté. Il l’est toujours.',
    lose: 'Vous avez battu l’horloge. Cela n’arrive jamais.',
  }),

  ...bossLines('souveraine', VOICES.souveraine, {
    enter: 'Vous jouez sur ma table. N’oubliez pas.',
    win: 'La partie est terminée. Elle l’était avant de commencer.',
    lose: 'La table est à vous. Prenez-en soin.',
  }),

  // Shared battle beats, in the narrator's voice
  { id: 'battle-combo', voiceId: VOICES.narrator, text: 'Enchaînement !' },
  { id: 'battle-victory', voiceId: VOICES.narrator, text: 'Boss vaincu.' },
  { id: 'battle-defeat', voiceId: VOICES.narrator, text: 'Vous êtes tombé.' },
];
