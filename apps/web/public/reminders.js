self.addEventListener('push', (event) => {
  event.waitUntil(self.registration.showNotification('Время для Chunki', {
    body: 'Откройте приложение и позанимайтесь с карточками.',
    icon: new URL('icon-192.png', self.registration.scope).href,
    tag: 'study-reminder',
  }));
});

self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== 'study-reminder') return;
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (app) await app.focus();
    else await self.clients.openWindow(self.registration.scope);
  })());
});
