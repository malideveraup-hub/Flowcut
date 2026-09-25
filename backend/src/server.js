import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import User from './models/User.js';

async function start() {
  try {
    await connectDB();
  } catch {
    // connectDB() already logged the reason. Exiting non-zero means a
    // process manager (or a developer watching the terminal) can never
    // mistake "server process alive" for "database connected" — Section
    // 2's requirement that the server fail clearly.
    console.error('[server] Startup aborted: could not connect to MongoDB.');
    process.exit(1);
  }

  await User.syncIndexes();
  console.log('[db] User indexes synchronized');

  const app = createApp();

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`[server] FlowCut API listening on http://localhost:${env.port}`);
    console.log(`[server] Environment: ${env.nodeEnv}`);
    console.log(`[server] Health check: http://localhost:${env.port}/api/health`);
  });
}

start();