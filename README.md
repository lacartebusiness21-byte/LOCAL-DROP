# LocalDrop

Application desktop (Electron + Node.js) de transfert de fichiers entre téléphone
et PC via QR Code, **sans Internet ni cloud**. Le transfert passe uniquement par
le réseau local (Wi-Fi local ou hotspot du PC) : aucun serveur externe, aucun
compte utilisateur.

## Architecture

```
LocalDrop/
├── package.json
├── README.md
├── electron/
│   ├── main.js        # process principal : fenêtre, démarrage serveur, dialogues
│   ├── preload.js      # pont sécurisé main <-> renderer (contextIsolation)
│   └── tray.js         # icône zone de notification + menu
├── server/
│   ├── server.js        # Express + Socket.IO + routes API + sélection de port
│   ├── network.js       # détection des adresses IPv4 locales (Wi-Fi/Ethernet)
│   ├── sessions.js       # sessions en mémoire (token, clients, fichiers)
│   ├── upload.js         # upload en streaming (busboy), sans tout charger en RAM
│   ├── security.js       # tokens, extensions autorisées, anti-écrasement
│   ├── config.js         # persistance dossier destination / thème / autostart
│   ├── history.js        # historique des transferts (JSON local)
│   ├── notifications.js  # notifications Windows via Electron
│   └── shell-utils.js    # ouverture du dossier de destination
├── public/
│   ├── index.html / mobile.html
│   ├── css/style.css / mobile.css
│   └── js/app.js / mobile.js
├── scripts/
│   ├── dev-server.js       # lance le serveur seul (sans Electron), pour test
│   ├── build.js            # build electron-builder (Windows/Linux)
│   ├── build-linux.sh
│   └── build-windows.ps1
├── assets/   # icon.ico / icon.png à fournir avant build (voir ICONS_REQUIRED.txt)
└── data/     # config.json et history.json créés automatiquement au runtime
```

## Ce qui a été conservé de l'existant

- Les deux interfaces `index.html` (PC) et `mobile.html` (téléphone), leur design
  (cartes arrondies, bleu, mode sombre) et le panneau Diagnostic.
- La structure d'API déjà esquissée côté `app.js` (`/api/session/create`,
  `/api/session/:token`, `/api/diagnostics`, `/api/autostart`, `/api/choose-folder`).

## Ce qui a été corrigé / ajouté

- **Le transfert de fichiers n'existait pas côté serveur** : ajout d'un upload
  en streaming (`busboy`) qui écrit directement sur disque, sans jamais charger
  un fichier entier en mémoire — nécessaire pour les vidéos volumineuses.
- **`mobile.js` lisait le token dans le chemin de l'URL** alors que le QR Code
  généré utilise `?token=...` : corrigé pour lire le paramètre de requête.
- **Aucune application desktop** : ajout d'Electron (fenêtre, tray, démarrage
  automatique, dialogue natif de choix de dossier, notifications Windows).
- **Plusieurs téléphones simultanés** : chaque session suit tous les sockets
  connectés (`clientsCount`), le PC affiche "Appareils connectés : N".
- **Sécurité** : liste blanche d'extensions, nettoyage des noms de fichiers
  (suppression de tout chemin type `../`), taille max par fichier, dossier de
  destination contrôlé uniquement côté PC (jamais choisi par le mobile), token
  de session obligatoire pour uploader.
- **Anti-écrasement** : `photo.jpg` → `photo (1).jpg` → `photo (2).jpg`.
- **Historique** persistant en JSON local (`data/history.json`).
- **Boutons ajoutés** : Copier l'adresse, Actualiser le QR Code, Ouvrir le
  dossier.
- **Bannière pare-feu** : si le PC ne peut pas se joindre lui-même sur son
  adresse LAN, un message explicite s'affiche au lieu d'un `ECONNREFUSED`.

## Démarrage (développement)

```bash
npm install
npm start          # lance l'application Electron complète
# ou, pour tester juste le serveur/les pages dans un navigateur :
npm run dev:server
```

## Build (application autonome)

```bash
npm run build:windows   # -> dist/LocalDrop Setup.exe
npm run build:linux     # -> dist/LocalDrop.AppImage + .deb
```

Les icônes (`assets/icon.ico`, `assets/icon.png`) sont déjà fournies dans le
projet, générées à partir du logo LocalDrop (QR blanc sur fond bleu accent).

Une fois installée, l'application se lance depuis le raccourci bureau/menu
Démarrer : aucun terminal n'est nécessaire ensuite. Le QR Code s'affiche
immédiatement à l'ouverture.

## Fonctionnement réseau (important)

LocalDrop ne nécessite pas Internet, mais **nécessite une connexion réseau
locale** entre le téléphone et le PC :

```
Téléphone ── Wi-Fi local ou hotspot du PC ──> PC
```

Le QR Code encode l'adresse IP locale réelle du PC
(`http://192.168.x.x:PORT/mobile.html?token=...`). Si plusieurs interfaces
réseau existent, l'utilisateur peut choisir celle à utiliser.

## Limites connues / suite possible

- L'auto-régénération du QR Code au changement d'IP n'est pas encore
  déclenchée automatiquement en continu (bouton manuel "Actualiser le QR
  Code" disponible) ; un watcher `os.networkInterfaces()` périodique est le
  prochain ajout naturel.
- Le build Windows (`.exe` via NSIS) n'a pas pu être exécuté dans
  l'environnement de développement utilisé pour cette phase (pas de Windows
  ni de Wine disponibles). La configuration electron-builder est identique
  pour les trois plateformes et a été validée par un build Linux réel
  (AppImage + .deb, tous deux générés et lancés avec succès) ; `npm run
  build:windows` doit être exécuté sur une machine Windows (ou un runner CI
  Windows type GitHub Actions) pour produire `LocalDrop Setup 2.0.0.exe`.
