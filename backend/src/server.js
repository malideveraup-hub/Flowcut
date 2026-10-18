import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import {
  MapImage,
  Notification,
  PushSubscription,
  QueueEntry,
  AuthSession,
  GeminiRequestCounter,
  GeminiRequestSlot,
  User,
} from './models/index.js';
import { startQueueNotificationMonitor } from './services/queueNotificationService.js';

export async function startServer({
  connectDatabase = connectDB,
  synchronizeIndexes = () => Promise.all([
    User.syncIndexes(),
    Notification.syncIndexes(),
    PushSubscription.syncIndexes(),
    QueueEntry.syncIndexes(),
    MapImage.syncIndexes(),
    AuthSession.syncIndexes(),
    GeminiRequestCounter.syncIndexes(),
    GeminiRequestSlot.syncIndexes(),
  ]),
  startMonitor = startQueueNotificationMonitor,
  app = createApp(),
  listen = (targetApp, port, callback) => targetApp.listen(port, '0.0.0.0', callback),
  port = env.port,
} = {}) {
  try {
    await connectDatabase();
  } catch {
    // connectDB() already logged the reason.
    console.error('[server] Startup aborted: could not connect to MongoDB.');
    throw new Error('Could not connect to MongoDB.');
  }

  await synchronizeIndexes();

  console.log(
    '[db] Application indexes synchronized'
  );

  startMonitor();

  return listen(app, port, () => {
    console.log(`[server] FlowCut API listening on http://localhost:${port}`);
    console.log(`[server] Environment: ${env.nodeEnv}`);
    console.log(`[server] Git commit: ${process.env.RENDER_GIT_COMMIT || 'local'}`);
    console.log(`[server] Health check: http://localhost:${port}/api/health`);
  });
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  startServer().catch((error) => {
    console.error('[server] Startup failed:', error.message);
    process.exitCode = 1;
  });
}
