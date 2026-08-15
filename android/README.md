# App Android — SOLITAIRE: SHIFT

Une vraie application Android qui **embarque le jeu dans l'APK**. Pas de
serveur, pas de domaine, pas de HTTPS, pas de connexion : le jeu est dans
l'application et fonctionne dès l'installation.

L'app est une `WebView` plein écran qui charge le jeu depuis les assets de
l'APK, servis sous une origine `https://` virtuelle (`WebViewAssetLoader`).
C'est ce qui permet à `localStorage` et aux modules ES de fonctionner
exactement comme sur le web, sans qu'aucune requête réseau ne quitte
l'appareil.

**L'application ne demande aucune permission. Pas même INTERNET.**

---

## Prérequis (déjà installés sur cette machine)

| Outil | Version | Emplacement |
|---|---|---|
| JDK | Temurin 21 | `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot` |
| SDK Android | platform 35, build-tools 35.0.0 | `%LOCALAPPDATA%\Android\Sdk` |
| Gradle | 8.10.2 | `%USERPROFILE%\gradle-8.10.2` |

Pour réinstaller ailleurs :

```powershell
winget install EclipseAdoptium.Temurin.21.JDK
# puis les command-line tools Android depuis developer.android.com,
# et : sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

---

## Compiler

```powershell
# depuis le dossier android/
.\build.ps1              # APK de test
.\build.ps1 -Release     # AAB signé pour le Play Store
```

Le script met à jour les assets du jeu automatiquement : la version Android ne
peut donc jamais diverger de la version web.

Sortie :
- test → `app/build/outputs/apk/debug/app-debug.apk`
- release → `app/build/outputs/bundle/release/app-release.aab`

## Installer sur un téléphone

**Par câble :**
```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r app\build\outputs\apk\debug\app-debug.apk
```

**Sans câble :** copiez le `.apk` sur le téléphone et ouvrez-le. Android
demandera d'autoriser l'installation depuis cette source — c'est normal pour
une app hors Play Store.

---

## Signer pour le Play Store

Le Play Store refuse les APK de test. Il faut une clé de signature.

**1. Créez la clé (une seule fois) :**

```powershell
& "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot\bin\keytool.exe" `
  -genkeypair -v -keystore solitaire-shift.keystore `
  -alias solitaire -keyalg RSA -keysize 2048 -validity 10000
```

> ⚠️ **Sauvegardez ce fichier et ses mots de passe ailleurs que sur ce PC.**
> Sans eux, vous ne pourrez plus jamais publier de mise à jour.

**2. Créez `android/keystore.properties`** (déjà gitignoré) :

```properties
storeFile=solitaire-shift.keystore
storePassword=VOTRE_MOT_DE_PASSE
keyAlias=solitaire
keyPassword=VOTRE_MOT_DE_PASSE
```

**3. Compilez :**

```powershell
.\build.ps1 -Release
```

---

## Publier

Voir `../tools/android/build-twa.md` (étape 4) et
`../tools/android/store-listing.md`, qui contient la fiche complète déjà
rédigée en français.

Résumé : Play Console → Créer une application → Test interne → téléverser le
`.aab` → vérifier sur votre téléphone → Production.

---

## Structure

```
android/
  build.ps1                     script de compilation
  settings.gradle               modules
  app/
    build.gradle                dépendances, signature, copie des assets
    src/main/
      AndroidManifest.xml       aucune permission
      java/fr/solitaireshift/app/
        MainActivity.java       la WebView plein écran
        LocalAssetWebViewClient.java   sert le jeu depuis les assets
      res/                      icônes, thème, couleurs
      assets/                   le jeu, copié automatiquement (gitignoré)
```

## Détails d'implémentation

- **Bouton retour** : ferme d'abord un menu ouvert, sinon annule un coup,
  et ne quitte l'app qu'en dernier recours.
- **Écran allumé** : `FLAG_KEEP_SCREEN_ON`, pour qu'une réflexion longue
  n'éteigne pas l'écran.
- **Taille de police système ignorée** (`setTextZoom(100)`) : le plateau est
  dimensionné en `vw`/`vmin`, une police agrandie casserait la mise en page.
- **Sauvegarde** : `localStorage`, dans le stockage privé de l'app. Elle
  survit aux redémarrages et disparaît proprement à la désinstallation.
- **Taille** : ~18 Mo, dont ~12 Mo d'illustrations.
