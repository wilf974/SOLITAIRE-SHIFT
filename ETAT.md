# État du projet — SOLITAIRE: SHIFT

*Dernière mise à jour : 15 août 2026*

Ce fichier existe pour reprendre le travail sans contexte préalable. Il dit où
en est le jeu, ce qui reste à faire, et les décisions qu'il ne faut pas défaire
sans le vouloir.

---

## En un coup d'œil

| | |
|---|---|
| **Jouable** | https://wilf974.github.io/SOLITAIRE-SHIFT/ |
| **Dépôt** | https://github.com/wilf974/SOLITAIRE-SHIFT (public) |
| **Tests** | 183, tous verts — `npm test` |
| **Serveur local** | `npm run serve` → http://127.0.0.1:4317/ |
| **Langue** | Interface 100 % française. Les `id` internes restent en anglais. |
| **Modèle éco.** | Gratuit. Aucun achat, aucune publicité, aucune collecte. |

---

## Ce qui est fait

### Le jeu
- Moteur Klondike pur (sans DOM, déterministe, seed reproductible)
- **10 modes** : Battle, Aventure (9 chapitres), Chrono, Marée, Classique,
  Parcours, Donne du jour, Contrats (7), Ascension, Zen
- **5 difficultés** de pose : de « Tranquille » à « Impitoyable »
- **20 traits** de règles, chacun validé comme jouable par le solveur
- **6 pouvoirs** achetés avec des pièces gagnées en jouant
- Ramassage automatique dès que la partie n'a plus rien à décider

### Mode Battle
- **20 boss** en 4 actes, difficulté croissante et pressions qui tournent
- Combo, barres de vie, riposte cadencée en *coups* (jamais au chronomètre)
- **4 pouvoirs de combat** à cooldown, sans charges à acheter
- Animations d'impact : la carte flashe, un éclair part vers le boss, il recule
- **23 récompenses** cosmétiques (12 dos, 8 tapis, 3 bordures), 16 gardées par
  un boss

### Habillage
- 60+ visuels générés (OpenAI) : figures, as, dos, tapis, icônes, boss
- **63 répliques vocales** (ElevenLabs) : chaque boss provoque, se moque, s'incline
- Identité « Sunlit » : ciel lever de soleil, table turquoise, cartes blanches
- Couleurs d'enseignes **traditionnelles** (pique/trèfle noirs, cœur/carreau rouges)

### Distribution
- PWA installable, jouable hors ligne (service worker v6)
- App Android qui **embarque** le jeu dans l'APK — aucun serveur requis
- Fiche Play Store, politique de confidentialité, captures : tout est prêt

---

## Ce qu'il reste à faire

### Pour publier sur le Play Store
1. **Héberger la politique de confidentialité** → déjà en ligne :
   https://wilf974.github.io/SOLITAIRE-SHIFT/privacy.html
2. **Premier envoi manuel** dans la Play Console (obligatoire : c'est ce qui
   enregistre votre clé de signature). Marche à suivre complète dans
   `tools/android/PUBLIER.md`.
3. **Tester sur un vrai téléphone** — voir l'avertissement ci-dessous.

### Non vérifié
- ⚠️ **L'app Android n'a jamais tourné sur un appareil réel.** L'émulateur de
  la machine est bloqué hors ligne. L'APK a été validé statiquement (manifeste,
  targetSdk 35, zéro permission, tous les fichiers présents), mais le premier
  lancement reste à faire. Passer par **Test interne** avant Production, et
  vérifier le **mode avion**.

### Pistes évoquées, non tranchées
- Boucle de rétention non prédatrice (récompense quotidienne, séries, missions)
- Automatiser les mises à jour via l'API Google Play Developer (possible
  seulement après le premier envoi manuel)

---

## Décisions à ne pas défaire par accident

**Gratuit, sans achat.** La fiche Play Store, la politique de confidentialité et
les réponses au questionnaire de classification l'affirment toutes. Ajouter des
gems achetables obligerait à tout reprendre — et un jeu de cartes avec achats
attire un examen bien plus sévère de Google.

**Les récompenses sont purement cosmétiques.** Un test échoue si une récompense
porte un champ `traits`, `multiplier` ou `damage`. Un jeu décoré ne doit jamais
battre un jeu simple.

**Les `id` sont persistés dans les sauvegardes** (`draw-three`, `stone-seal`,
`gardien`…). Les renommer casse les profils existants. Seuls les noms affichés
sont traduits.

**Les clés API ne sortent jamais du build.** `OPENAI_API_KEY` et
`ELEVENLABS_API_KEY` sont lues au moment de la génération, nettoyées de toute
sortie d'erreur, jamais écrites dans un asset. Le jeu fini est statique et n'en
a pas besoin.

**Sauvegardez `android/solitaire-shift.keystore` hors de ce PC.** Perdue, cette
clé rend toute mise à jour impossible : il faudrait republier une app neuve et
perdre installations et avis. Empreinte SHA-256 consignée dans
`tools/android/PUBLIER.md`.

**Deux modes ne sont pas validés par le solveur, et le disent :** Classique
(aléatoire par tradition) et Marée (le plateau change en jouant, il n'existe
aucune solution fixe à prouver).

---

## Commandes utiles

```bash
npm test                         # 183 tests
npm run check                    # parse tous les fichiers JS
npm run serve                    # serveur local

node tools/gen-art/generate.js --dry-run   # plan de génération, sans appel API
node tools/gen-art/generate.js <groupe>    # table|back|ace|court|icon|power|mode|difficulty|battle|loot|all
node tools/gen-voice/generate.js           # répliques ElevenLabs
node tools/make-ui-icons.js                # détoure et redimensionne les icônes
node tools/optimise-art.js                 # réduit les PNG (à relancer après génération)

cd android && .\build.ps1                  # APK de test
cd android && .\build.ps1 -Release         # AAB signé pour le Play Store
```

---

## Structure

```
src/engine/     moteur pur, sans DOM : game, traits, solver, battle, powers-fx
src/meta/       profil, maîtrise, pouvoirs, difficulté, récompenses
src/ui/         rendu, interactions, audio, art, voix
src/assets/     art généré (46 Mo), voix (2,6 Mo), icônes (3,2 Mo)
tools/          génération d'art et de voix, icônes, serveur, build Android
android/        app native embarquant le jeu
tests/          183 tests node:test
```

Détails complets dans `README.md`.
