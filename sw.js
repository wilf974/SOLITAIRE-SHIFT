// sw.js — offline support. The game is static files with no backend, so a
// cache-first strategy makes it fully playable with no connection at all.
//
// Bump CACHE_VERSION whenever the shipped files change; the old cache is then
// dropped on activate. Nothing here talks to a server: there is no telemetry,
// no account, and no remote save.

const CACHE_VERSION = 'solitaire-shift-v4';

// Everything the game needs to boot and play. Art is added on demand below.
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/base.css',
  './styles/cards.css',
  './styles/ui.css',
  './styles/bright.css',
  './src/main.js',
  './src/app.js',
  './src/modes.js',
  './src/engine/rng.js',
  './src/engine/deck.js',
  './src/engine/game.js',
  './src/engine/traits.js',
  './src/engine/solver.js',
  './src/engine/serialize.js',
  './src/engine/powers-fx.js',
  './src/engine/battle.js',
  './src/engine/battle-powers.js',
  './src/meta/storage.js',
  './src/meta/mastery.js',
  './src/meta/powers.js',
  './src/meta/difficulty.js',
  './src/ui/render.js',
  './src/ui/interaction.js',
  './src/ui/audio.js',
  './src/ui/art.js',
  './src/ui/voice.js',
  './src/data/contracts.json',
  './src/assets/art/manifest.json',
  './src/assets/icons/ui/power-peek.png',
  './src/assets/icons/ui/power-ace-call.png',
  './src/assets/icons/ui/power-reshuffle.png',
  './src/assets/icons/ui/power-reserve.png',
  './src/assets/icons/ui/power-undo.png',
  './src/assets/icons/ui/power-time.png',
  './src/assets/icons/ui/mode-adventure.png',
  './src/assets/icons/ui/mode-timed.png',
  './src/assets/icons/ui/mode-tide.png',
  './src/assets/icons/ui/mode-classic.png',
  './src/assets/icons/ui/mode-journey.png',
  './src/assets/icons/ui/mode-daily.png',
  './src/assets/icons/ui/mode-contract.png',
  './src/assets/icons/ui/mode-ascension.png',
  './src/assets/icons/ui/mode-zen.png',
  './src/assets/icons/ui/diff-gentle.png',
  './src/assets/icons/ui/diff-standard.png',
  './src/assets/icons/ui/diff-sharp.png',
  './src/assets/icons/ui/diff-suited.png',
  './src/assets/icons/ui/diff-brutal.png',
  './src/assets/icons/ui/mode-battle.png',
  './src/assets/icons/ui/battle-strike.png',
  './src/assets/icons/ui/battle-guard.png',
  './src/assets/icons/ui/battle-focus.png',
  './src/assets/icons/ui/battle-surge.png',
  './src/assets/icons/ui/boss-gardien.png',
  './src/assets/icons/ui/boss-illusionniste.png',
  './src/assets/icons/ui/boss-horloger.png',
  './src/assets/icons/ui/boss-souveraine.png',
  './src/assets/voice/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      // addAll fails the whole install if any single file 404s, so add each
      // file independently: a missing optional asset must not brick install.
      await Promise.all(CORE.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch third parties

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: false });
      if (cached) return cached;

      try {
        const response = await fetch(request);
        // cache successful same-origin GETs (this is how the card art lands
        // in the cache the first time it is displayed)
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy)).catch(() => {});
        }
        return response;
      } catch (err) {
        // Offline and not cached: for a navigation, fall back to the shell so
        // the player still gets the game rather than a browser error page.
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});