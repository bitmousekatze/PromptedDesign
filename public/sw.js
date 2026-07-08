/* Prompted service worker — Web Push delivery for desktop notifications.
 *
 * Registered by src/lib/desktopNotifications.js. Two jobs:
 *   1. 'push'            — draw the OS notification from the encrypted payload
 *                          (sent by the send-push-notification edge function).
 *   2. 'notificationclick' — focus an open Prompted tab (or open one) and
 *                          deep-link to the post/stream the notification is about.
 *
 * Payload shape (JSON): { title, body, data: { type, post_id?, stream_id?, ... } }
 */

self.addEventListener('install', () => {
  // Activate this worker immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Prompted', body: event.data ? event.data.text() : 'You have a new notification' };
  }

  const title = payload.title || 'Prompted';
  const data = payload.data || {};
  const options = {
    body: payload.body || 'You have a new notification',
    icon: payload.icon || '/logo-icon.svg',
    badge: '/logo-icon.svg',
    // Coalesce repeats of the same notification (the edge fn passes notification_id).
    tag: data.notification_id || data.type || undefined,
    renotify: false,
    data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Map a notification's data payload to an in-app URL to focus/open.
function urlForData(data) {
  if (!data) return '/';
  if (data.post_id) return '/post/' + data.post_id;
  if (data.type === 'stream_live') return '/?stream=' + (data.stream_id || '');
  // follow / community / generic → land on the app; App.jsx opens the bell.
  return '/?notifications=1';
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = urlForData(event.notification.data);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Prefer focusing an already-open Prompted tab and navigating it.
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          // Tell the SPA where to go (it listens for this in App.jsx); also try
          // navigate() for browsers that support it.
          client.postMessage({ type: 'prompted:notification-click', data: event.notification.data, url: targetUrl });
          if ('navigate' in client && targetUrl.startsWith('/post/')) {
            client.navigate(targetUrl).catch(() => {});
          }
          return;
        }
      }
      // No open tab — open a new one at the deep link.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
