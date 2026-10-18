self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try {
      payload = event.data?.json() || {};
    } catch {
      payload = {};
    }

    const title = typeof payload.title === 'string' ? payload.title : 'FlowCut queue update';
    const body = typeof payload.message === 'string' ? payload.message : 'You have a new update about your queue.';
    const notificationId = typeof payload.id === 'string' ? payload.id : `push-${Date.now()}`;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visibleWindow = windows.find((client) => client.visibilityState === 'visible');
    let pageSoundPlayed = false;

    if (visibleWindow) {
      pageSoundPlayed = await new Promise((resolve) => {
        const channel = new MessageChannel();
        let settled = false;
        const finish = (soundPlayed) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          channel.port1.close();
          resolve(soundPlayed);
        };
        const timeout = setTimeout(() => finish(false), 300);
        channel.port1.onmessage = (messageEvent) => {
          finish(messageEvent.data?.soundPlayed === true);
        };
        try {
          visibleWindow.postMessage({
            type: 'FLOWCUT_QUEUE_PUSH',
            notification: { id: notificationId, title, message: body },
          }, [channel.port2]);
        } catch {
          finish(false);
        }
      });
    }

    await self.registration.showNotification(title, {
      body,
      icon: '/flowcut-icon-192.png',
      badge: '/flowcut-icon-192.png',
      tag: `flowcut-queue-${notificationId}`,
      renotify: true,
      silent: pageSoundPlayed,
      ...(!pageSoundPlayed && { vibrate: [160, 90, 160] }),
      data: { url: '/my-queue' },
    });
  })());
});

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
