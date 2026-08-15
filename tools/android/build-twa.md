# Publier SOLITAIRE: SHIFT sur le Play Store

Le jeu est un **TWA** (Trusted Web Activity) : une app Android qui affiche
votre site en plein écran, sans barre d'adresse. C'est la méthode que Google
recommande pour publier une PWA, et c'est ce qu'utilisent Twitter Lite,
Starbucks ou Uber.

L'app fait ~1 Mo et n'embarque pas le jeu : elle charge votre site. Il faut
donc d'abord héberger le jeu en HTTPS.

---

## Étape 1 — Héberger le jeu en HTTPS (obligatoire)

Un service worker ne fonctionne **que** en HTTPS. Sans ça, pas de PWA et pas
de TWA. Le projet est constitué de fichiers statiques, donc l'hébergement est
gratuit partout.

**Option la plus simple — GitHub Pages :**

```bash
# depuis le dossier du projet
git remote add origin https://github.com/VOTRE-COMPTE/solitaire-shift.git
git push -u origin main
```

Puis dans le dépôt GitHub : **Settings → Pages → Source: Deploy from a branch
→ main → / (root) → Save**.

Votre URL sera `https://VOTRE-COMPTE.github.io/solitaire-shift/`.

> Autres options équivalentes : Netlify (glisser-déposer du dossier),
> Cloudflare Pages, Vercel. Toutes gratuites, toutes en HTTPS.

**Vérifiez avant de continuer :** ouvrez l'URL sur un téléphone Android dans
Chrome. Le menu ⋮ doit proposer « Installer l'application ». Si l'option
n'apparaît pas, le TWA ne marchera pas non plus.

---

## Étape 2 — Générer l'app Android

Il faut **Java 17+** installé ([Temurin](https://adoptium.net), gratuit).
Bubblewrap télécharge le reste du SDK Android tout seul.

```bash
npm install -g @bubblewrap/cli

cd tools/android
bubblewrap init --manifest https://VOTRE-URL/manifest.webmanifest
```

Répondez aux questions (les valeurs par défaut conviennent presque toutes) :

| Question | Réponse |
|---|---|
| Application ID | `fr.votrenom.solitaireshift` — **définitif**, impossible à changer après publication |
| App name | `Solitaire Shift` |
| Display mode | `standalone` |
| Orientation | `default` |
| Signing key | Créez-en une et **sauvegardez le fichier `.keystore` + les mots de passe** |

> ⚠️ **La clé de signature est irremplaçable.** Si vous la perdez, vous ne
> pourrez plus jamais mettre l'app à jour. Sauvegardez-la ailleurs que sur
> votre PC.

Puis compilez :

```bash
bubblewrap build
```

Vous obtenez `app-release-bundle.aab` — c'est le fichier à téléverser.

---

## Étape 3 — Lier le domaine à l'app

Sans cette étape, l'app affichera une barre d'adresse Chrome en haut, ce qui
casse l'illusion d'une vraie app.

`bubblewrap init` a affiché une empreinte SHA-256. Reprenez-la et remplacez
les deux valeurs dans **`assetlinks.json`** (à la racine du projet) :

- `package_name` → votre Application ID
- `sha256_cert_fingerprints` → l'empreinte

Ce fichier doit ensuite être accessible à cette adresse exacte :

```
https://VOTRE-URL/.well-known/assetlinks.json
```

Sur GitHub Pages, créez le dossier `.well-known/` à la racine du dépôt et
placez-y le fichier.

> L'empreinte définitive est celle de **Play App Signing** : après le premier
> envoi, récupérez-la dans la Play Console (**Configuration → Intégrité de
> l'app**) et mettez `assetlinks.json` à jour avec cette valeur-là.

---

## Étape 4 — Publier

Dans la [Play Console](https://play.google.com/console) :

1. **Créer une application** → nom, français, Jeu, Gratuit.
2. **Test interne** d'abord — téléversez le `.aab`, ajoutez votre e-mail
   comme testeur, installez sur votre téléphone. Vérifiez qu'il n'y a pas de
   barre d'adresse.
3. Remplissez le contenu de la fiche (voir `tools/android/store-listing.md`,
   tout est déjà rédigé).
4. **Production** → déployer.

Comptez quelques jours de validation pour un premier envoi.

---

## Ce que Google va demander

| Exigence | Réponse pour ce jeu |
|---|---|
| Politique de confidentialité | Obligatoire même sans collecte. Modèle fourni dans `docs/PRIVACY.md` — hébergez-le et donnez l'URL. |
| Sécurité des données | **Aucune donnée collectée, aucune donnée partagée.** Tout est en `localStorage`. |
| Classification du contenu | Questionnaire : répondez non partout. Le jeu vise « Tout public ». |
| Publicités | Non. |
| Achats intégrés | Non. |
| Jeux d'argent | **Non** — les « pièces » ne s'achètent pas et n'ont aucune valeur réelle. |

Ce dernier point mérite attention : Google examine de près les jeux de cartes.
La fiche insiste donc sur l'absence d'achats et de mise réelle.
