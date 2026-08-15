// tools/gen-voice/lines.js — every spoken line in the game.
//
// Build-side only. The generated .mp3 files are committed; the API key is not.
//
// Voice casting: the model is multilingual, so an English-labelled voice still
// speaks French — what matters is the timbre, which is what gives each boss a
// distinct presence. One line per boss for the entrance, one for victory and
// one for defeat, kept short so they never delay play.

// Chosen from the account's available voices, by character rather than accent.
// Twenty bosses share a smaller cast of timbres, matched to temperament: what
// separates them on screen is the writing and the portrait, not a unique voice
// each, which would cost far more to generate for little gain.
const V = {
  deep:    'nPczCjzI2devNBz1zQrb', // Brian — deep, resonant: stone and giants
  trick:   'N2lVS1w4EtoT3dr4eOWO', // Callum — husky trickster: thieves, liars
  formal:  'onwK4e9ZLuTAKqWW03F9', // Daniel — steady, formal: scholars, clocks
  regal:   'pFZP5JQG7iQjIQuC4Bku', // Lily — velvety, confident: queens
  bright:  'cgSgspJ2msm6clMCkdW9', // Jessica — playful, bright: youth, twins
  fierce:  'SOYHLrjzK2X1ezoPC6cr', // Harry — rough warrior: brawlers, smiths
  calm:    'Xb7hH8MSUJpSbSDYk0k2', // Alice — clear, measured: seers, sirens
  narrator:'4p5WXd3ZuWR9pPtRQuxC', // Jean Petit — French narrator
};

/** A boss speaks three times: entering, winning, losing. */
function boss(id, voiceId, enter, win, lose) {
  return [
    { id: `boss-${id}-enter`, voiceId, text: enter },
    { id: `boss-${id}-win`,   voiceId, text: win },
    { id: `boss-${id}-lose`,  voiceId, text: lose },
  ];
}

export const LINES = [
  ...boss('gardien', V.deep,
    'Rien ne passe. Rien ne bouge. Vous non plus.',
    'La pierre ne cède jamais.',
    'Impossible… vous m’avez… déplacé.'),

  ...boss('apprenti', V.bright,
    'Je débute, mais je frappe déjà plus vite que vous.',
    'Même un apprenti peut vous battre. Réfléchissez à ça.',
    'Bon. J’ai encore des choses à apprendre.'),

  ...boss('illusionniste', V.trick,
    'Regardez bien. Ou plutôt, ne regardez pas.',
    'Vous avez vu ce que je voulais que vous voyiez.',
    'Vous avez percé le truc. Bravo, sincèrement.'),

  ...boss('ferrailleur', V.fierce,
    'Vous cognez fort. Moi aussi.',
    'Le métal plie. Vous aussi.',
    'Belle frappe. La prochaine sera pour moi.'),

  ...boss('horloger', V.formal,
    'Chaque seconde vous appartient de moins en moins.',
    'Le temps était de mon côté. Il l’est toujours.',
    'Vous avez battu l’horloge. Cela n’arrive jamais.'),

  ...boss('corbeau', V.trick,
    'Ce qui brille, je le prends.',
    'Votre chance est déjà dans mon nid.',
    'Gardez-la. Elle ne valait rien.'),

  ...boss('jumelles', V.bright,
    'Deux fois plus de mains. Deux fois plus de coups.',
    'À deux contre une, ce n’était pas très équitable.',
    'On a perdu. Ensemble, au moins.'),

  ...boss('souveraine', V.regal,
    'Vous jouez sur ma table. N’oubliez pas.',
    'La partie est terminée. Elle l’était avant de commencer.',
    'La table est à vous. Prenez-en soin.'),

  ...boss('gardienne', V.regal,
    'Ma garde ne se lève jamais.',
    'Vous vous êtes brisé sur mon bouclier.',
    'Vous avez trouvé la faille. Une seule suffisait.'),

  ...boss('alchimiste', V.formal,
    'Je transforme vos réussites en cendres.',
    'Tout se dissout. Vous compris.',
    'Ma formule était juste. Mon adversaire, non.'),

  ...boss('marionnettiste', V.trick,
    'Vos mains bougent. Ce sont mes fils.',
    'Vous avez très bien dansé.',
    'Les fils sont coupés. Allez-y.'),

  ...boss('faucheur', V.deep,
    'Je moissonne ce que vous semez.',
    'La récolte était bonne.',
    'Cette année, le champ est à vous.'),

  ...boss('sirene', V.calm,
    'Écoutez encore un peu. Juste un peu.',
    'Vous avez fermé les yeux. C’était l’erreur.',
    'Vous n’écoutiez pas. Tant mieux pour vous.'),

  ...boss('colosse', V.deep,
    'Frappez. Je ne le sentirai pas.',
    'Je n’ai rien senti du tout.',
    'Là… j’ai senti quelque chose.'),

  ...boss('archiviste', V.formal,
    'Chaque coup que vous jouez, je l’ai déjà lu.',
    'Votre partie est classée. Rangée. Oubliée.',
    'Je vais devoir ajouter un chapitre.'),

  ...boss('astrologue', V.calm,
    'Votre défaite était écrite. J’en ai lu la date.',
    'Les astres avaient raison, comme toujours.',
    'J’ai mal lu le ciel. Cela arrive une fois par siècle.'),

  ...boss('forgeron', V.fierce,
    'Je refonds les rois en clous.',
    'Encore du métal pour la forge.',
    'Vous avez tenu la chaleur. Peu y arrivent.'),

  ...boss('oracle', V.calm,
    'Je ne vois rien. Je sais tout.',
    'Je l’avais annoncé. Vous n’avez pas écouté.',
    'Ce que je n’avais pas vu, c’est vous.'),

  ...boss('jumeau', V.trick,
    'Vous savez déjà comment je joue.',
    'Vous vous êtes battu contre vous-même. Vous avez perdu.',
    'Vous êtes meilleur que moi. Donc meilleur que vous.'),

  ...boss('croupier', V.regal,
    'La maison gagne toujours. Prouvez le contraire.',
    'La maison gagne. Comme toujours.',
    'La maison s’incline. Cela n’était jamais arrivé.'),

  // Shared battle beats, in the narrator's voice
  { id: 'battle-combo',   voiceId: V.narrator, text: 'Enchaînement !' },
  { id: 'battle-victory', voiceId: V.narrator, text: 'Boss vaincu.' },
  { id: 'battle-defeat',  voiceId: V.narrator, text: 'Vous êtes tombé.' },
];
