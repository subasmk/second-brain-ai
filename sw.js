/* ==========================================
   SW.JS — Service Worker
   Cache-first offline + push notifications
   ========================================== */

const CACHE_NAME    = 'second-brain-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/main.css',
  '/css/animations.css',
  '/js/db.js',
  '/js/nlp.js',
  '/js/ai.js',
  '/js/voice.js',
  '/js/notifications.js',
  '/js/tasks.js',
  '/js/ui.js',
  '/js/app.js',
];

/* ---- Install — pre-cache shell ---- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* ---- Activate — clean old caches ---- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ---- Fetch — cache-first strategy ---- */
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses for our origin
        if (response.ok && event.request.url.startsWith(self.location.origin)) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => {
        // Offline fallback
        if (event.request.headers.get('Accept')?.includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/* ---- Push Notifications ---- */
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Second Brain AI', {
      body:    data.body || 'You have a task reminder.',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      tag:     data.tag || 'secondbrain',
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: 'done',    title: '✅ Done' },
        { action: 'snooze5', title: '⏰ 5 min' },
        { action: 'snooze10',title: '⏰ 10 min' },
        { action: 'snooze30',title: '⏰ 30 min' },
      ],
      data: data.taskData || {},
    })
  );
});

/* ---- Notification Click ---- */
self.addEventListener('notificationclick', (event) => {
  const { action }  = event;
  const { taskId }  = event.notification.data || {};
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Send message to app
      const msg = { action: action || 'open', taskId };
      if (clients.length > 0) {
        clients[0].postMessage(msg);
        clients[0].focus();
      } else {
        self.clients.openWindow('/').then(client => {
          if (client) client.postMessage(msg);
        });
      }
    })
  );
});

/* ---- Notification Close ---- */
self.addEventListener('notificationclose', () => {
  // Analytics hook if needed
});
