import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.js';
import { requestLogger, errorLogger } from './middleware/logger.js';

/**
 * Create and configure Express application
 */
export function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  
  // Request logging middleware (before routes)
  app.use(requestLogger);

  // API routes
  app.use('/api', apiRoutes);

  // Error logging middleware (after routes)
  app.use(errorLogger);

  return app;
}

