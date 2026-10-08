self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requestedDestination = new URL(event.notification.data?.url || '/my-queue', self.location.origin);
  const destination = requestedDestination.origin === self.location.origin
    ? requestedDestination
    : new URL('/my-queue', self.location.origin);

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        if ('navigate' in client) await client.navigate(destination.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(destination.href);
  })());
});
