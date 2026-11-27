// Minimal Service Worker for PWA & background notification click deep-linking
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification && event.notification.data) || {};
  const params = new URLSearchParams();
  if (data.notification_type) params.set('notif_type', String(data.notification_type));
  if (data.conversation_id) params.set('conversation_id', String(data.conversation_id));
  if (data.post_id) params.set('post_id', String(data.post_id));
  if (data.community_slug) params.set('community_slug', String(data.community_slug));
  if (data.user_id) params.set('user_id', String(data.user_id));

  const query = params.toString();
  const targetUrl = query ? `/?${query}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_TAP', payload: data });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
