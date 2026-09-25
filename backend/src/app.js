import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import shopRoutes from './routes/shopRoutes.js';
import queueRoutes from './routes/queueRoutes.js';
import shopAdminRoutes from './routes/shopAdminRoutes.js';
import barberRoutes from './routes/barberRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      // A single explicit origin, not a wildcard — required for
      // cookie-based auth (`credentials: true` + `origin: '*'` is
      // rejected by browsers anyway, but being explicit here is also
      // just the correct security posture: Section 20/17).
      origin: env.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Health check: reports whether the API process is up AND whether it
  // currently has a live MongoDB connection — deliberately two different
  // things, so "the server responds" is never mistaken for "data is
  // actually being persisted" (Section 19: don't fake success).
  app.get('/api/health', (req, res) => {
    const dbState = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
    res.json({
      success: true,
      message: 'FlowCut API is running',
      db: {
        connected: dbState === 1,
        state: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown',
      },
    });
  });

  // Feature routes.
  app.use('/api/auth', authRoutes);
  app.use('/api/shops', shopRoutes);
  app.use('/api/queue', queueRoutes);
  app.use('/api/shop-admin', shopAdminRoutes);
  app.use('/api/barber', barberRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
