import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Request logging middleware
 * Logs only errors (status >= 400)
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const { method, path } = req;

  // Capture response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Log only errors (status >= 400)
    if (statusCode >= 400) {
      logger.error('HTTP', `${method} ${path} ${statusCode} (${duration}ms)`, {
        error: typeof data === 'string' ? data : JSON.stringify(data),
      });
    }
    
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Error logging middleware
 */
export function errorLogger(err: Error, req: Request, res: Response, next: NextFunction) {
  logger.error('HTTP', 'Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  next(err);
}

