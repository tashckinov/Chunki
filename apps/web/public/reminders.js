self.addEventListener('push', (event) => {
  let deliveryId;
  try { deliveryId = event.data?.json()?.deliveryId; } catch { /* Legacy payload. */ }
  event.waitUntil(self.registration.showNotification('Время для Chunki', {
    body: 'В плане на сегодня осталось занятие.',
    icon: new URL('icon-192.png', self.registration.scope).href,
    tag: 'study-reminder',
    data: { deliveryId },
  }));
});

self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== 'study-reminder') return;
  event.notification.close();
  event.waitUntil((async () => {
    const { deliveryId } = event.notification.data ?? {};
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (app) {
      if (deliveryId) app.postMessage({ type: 'chunki-notification-click', id: deliveryId });
      await app.focus();
    } else {
      const url = new URL(self.registration.scope);
      if (deliveryId) url.searchParams.set('reminder', deliveryId);
      await self.clients.openWindow(url.href);
    }
  })());
});
