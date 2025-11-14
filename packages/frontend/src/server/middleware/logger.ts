import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Request logging middleware
 * Logs all incoming API requests with method, path, query params, and response status
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const { method, path, query, body } = req;

  // Log request
  const requestData: any = {};
  if (Object.keys(query).length > 0) {
    requestData.query = query;
  }
  if (method !== 'GET' && body && Object.keys(body).length > 0) {
    requestData.body = body;
  }
  
  logger.info('HTTP', `${method} ${path}`, Object.keys(requestData).length > 0 ? requestData : undefined);

  // Capture response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Log response based on status code
    if (statusCode >= 500) {
      logger.error('HTTP', `${method} ${path} ${statusCode} (${duration}ms)`, {
        error: typeof data === 'string' ? data : JSON.stringify(data),
      });
    } else if (statusCode >= 400) {
      logger.warn('HTTP', `${method} ${path} ${statusCode} (${duration}ms)`, {
        error: typeof data === 'string' ? data : JSON.stringify(data),
      });
    } else {
      logger.info('HTTP', `${method} ${path} ${statusCode} (${duration}ms)`);
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

