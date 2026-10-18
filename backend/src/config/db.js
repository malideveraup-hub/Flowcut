import mongoose from 'mongoose';
import { env } from './env.js';

// Mongoose 8+ defaults strictQuery to false in a future major version;
// pin it explicitly so query behavior doesn't silently change on upgrade.
mongoose.set('strictQuery', true);

/**
 * Connects to MongoDB using MONGODB_URI. On failure, this throws instead
 * of leaving the process in a half-started state — server.js is
 * responsible for catching this and exiting with a non-zero code, so a
 * broken DB connection is never mistaken for "the server is running fine."
 */
export async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri, {
      // Fail fast and clearly rather than hanging for the default 30s —
      // a developer staring at a stuck terminal is exactly the confusing
      // half-started state Section 2 asks us to avoid.
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[db] Connected to MongoDB (${mongoose.connection.name})`);
  } catch (err) {
    console.error('[db] Failed to connect to MongoDB.');
    console.error(`[db] Reason: ${err.message}`);
    console.error('[db] Check that MONGODB_URI in backend/.env is correct and reachable.');
    throw err;
  }

  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error after initial connect:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected.');
  });
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
