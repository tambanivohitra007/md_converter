// Disable old caching behavior that broke POST requests and conversions.
// This service worker uninstalls itself and stops controlling the page.
self.addEventListener('install', (event) => {
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Unregister this SW
    try {
      const reg = await self.registration.unregister();
      // Claim clients so we can reload pages without SW
      await self.clients.claim();
      // Tell all clients to reload so they're no longer under SW control
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.navigate(client.url);
      }
    } catch (e) {
      // ignore
    }
  })());
});

// No fetch handler — do not intercept any requests.
