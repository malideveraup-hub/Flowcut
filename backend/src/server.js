import { setDefaultResultOrder } from 'node:dns';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import {
  MapImage,
  Notification,
  PushSubscription,
  QueueEntry,
  User,
} from './models/index.js';
import { startQueueNotificationMonitor } from './services/queueNotificationService.js';

setDefaultResultOrder('ipv4first');

async function start() {
  try {
    await connectDB();
  } catch {
    // connectDB() already logged the reason.
    console.error('[server] Startup aborted: could not connect to MongoDB.');
    process.exit(1);
  }

  await Promise.all([
    User.syncIndexes(),
    Notification.syncIndexes(),
    PushSubscription.syncIndexes(),
    QueueEntry.syncIndexes(),
    MapImage.syncIndexes(),
  ]);

  console.log(
    '[db] User, notification, push subscription, queue, and map image indexes synchronized'
  );

  startQueueNotificationMonitor();

  const app = createApp();

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`[server] FlowCut API listening on http://localhost:${env.port}`);
    console.log(`[server] Environment: ${env.nodeEnv}`);
    console.log(`[server] Git commit: ${process.env.RENDER_GIT_COMMIT || 'local'}`);
    console.log(`[server] Health check: http://localhost:${env.port}/api/health`);
  });
}

start();