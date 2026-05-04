const CACHE_NAME = 'kubera-omega-v1';

// Install the service worker and immediately take control
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

// Clean up old caches if needed
self.addEventListener('activate', (e) => {
    self.clients.claim();
});

// A dummy fetch event is strictly required by browsers to pass the PWA Install check
self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request).catch(() => new Response('Kubera is running offline.'))
    );
});
