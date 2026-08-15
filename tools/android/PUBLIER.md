# Publier SOLITAIRE: SHIFT — marche à suivre

Le jeu part **gratuit, sans aucun achat, sans publicité**. Toute la
documentation (fiche, confidentialité, classification) est déjà écrite dans ce
sens : rien à modifier.

Comptez ~1 h de travail, puis quelques jours de validation par Google.

---

## Avant de commencer

Vous avez déjà :
- ✅ le compte développeur Google Play
- ✅ l'app compilée (`SolitaireShift.apk`, à la racine, pour tester)
- ✅ l'icône 512×512 et la bannière 1024×500
- ✅ la fiche et la politique de confidentialité rédigées

Il vous manque :
- ⬜ la clé de signature (étape 1)
- ⬜ la politique de confidentialité en ligne (étape 2)
- ⬜ 2 captures d'écran minimum (étape 3)

---

## Étape 1 — Créer la clé de signature

```powershell
cd android
.\make-key.ps1
```

Le script demande un mot de passe et génère `solitaire-shift.keystore`.

> ⚠️ **Sauvegardez ce fichier ET le mot de passe ailleurs que sur ce PC.**
> C'est ce qui prouve à Google que les mises à jour viennent bien de vous.
> Perdus, vous ne pourrez plus jamais mettre l'app à jour : il faudrait
> republier une app neuve et perdre installations et avis.

Puis compilez la version signée :

```powershell
.\build.ps1 -Release
```

→ `android/app/build/outputs/bundle/release/app-release.aab` (~17,5 Mo)

---

## Étape 2 — Mettre la politique de confidentialité en ligne

Google exige une **URL publique**, même quand l'app ne collecte rien.

Le plus simple, gratuit : créez un [Gist GitHub](https://gist.github.com)
public, collez le contenu de `docs/PRIVACY.md`, et prenez l'URL.

N'oubliez pas d'y remplacer *[votre adresse e-mail]* par la vôtre.

---

## Étape 3 — Prendre les captures d'écran

Minimum 2, en **paysage** (le jeu est en paysage).

Lancez le jeu sur PC (`npm run serve`), mettez la fenêtre en format large et
bas, et capturez :

1. Le menu principal — montre les neuf modes
2. Une partie en cours avec la barre de pouvoirs
3. La boutique de pouvoirs
4. Le sélecteur de difficulté
5. Le mode Aventure

---

## Étape 4 — Play Console

Sur [play.google.com/console](https://play.google.com/console) :

**Créer l'application**
- Nom : `Solitaire Shift`
- Langue par défaut : Français
- Application ou jeu : **Jeu**
- Gratuite ou payante : **Gratuite**

**Fiche du magasin** → copiez depuis `tools/android/store-listing.md`
(description courte, description complète, icône, bannière, captures).

**Contenu de l'application** — répondez au questionnaire :

| Section | Réponse |
|---|---|
| Politique de confidentialité | l'URL de l'étape 2 |
| Sécurité des données | Aucune donnée collectée ni partagée |
| Classification | Non partout → Tout public |
| Publicités | Non |
| Jeux d'argent | **Non** |
| Public cible | 13 ans et plus (évite les obligations « famille ») |

**Version**
1. **Test interne** d'abord : téléversez le `.aab`, ajoutez votre e-mail
   comme testeur, installez sur votre téléphone.
2. Vérifiez : l'app s'ouvre en paysage, les 7 colonnes tiennent, le jeu se
   joue hors ligne (mettez le téléphone en mode avion).
3. Si tout va bien → **Production**.

---

## Empreinte de votre clé de signature

Celle de la clé locale (`solitaire-shift.keystore`, alias `solitaire`) :

```
SHA-256  D4:FD:54:0E:BF:AF:C8:EA:E0:BE:5D:0F:90:35:E7:EF:D3:67:36:7E:D7:15:A9:9B:44:1C:F0:4C:02:1F:2B:88
```

Utile pour vérifier qu'un `.aab` a bien été signé avec la bonne clé.

> Note : Google resigne les apps avec **Play App Signing**. L'empreinte que
> verront les utilisateurs sera donc différente — vous la trouverez après le
> premier envoi dans **Configuration → Intégrité de l'app**. C'est celle-là
> qu'il faudra utiliser si vous ajoutez un jour un `assetlinks.json`.

---

## Après publication

Les mises à jour peuvent être automatisées avec l'API Google Play Developer
(le premier envoi, lui, doit être manuel — c'est ce qui enregistre votre clé).

Pour publier une mise à jour : incrémentez `versionCode` dans
`android/app/build.gradle`, relancez `.\build.ps1 -Release`, téléversez.

---

## Ce que Google pourrait demander

**« Nous n'avons pas pu tester votre application »** — arrive parfois pour les
apps WebView. Répondez que le jeu est entièrement hors ligne, sans compte ni
connexion, et qu'il suffit de le lancer.

**Une vérification d'identité** — obligatoire pour tous les comptes
développeur particuliers depuis 2024. Prévoyez une pièce d'identité.
