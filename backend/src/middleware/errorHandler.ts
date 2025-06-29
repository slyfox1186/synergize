import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ErrorHandler');

interface HttpError extends Error {
  status?: number;
}

export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err.status ?? 500;
  const message = err.message || 'Internal server error';

  // Log with full context
  logger.error('Request failed', err, {
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        // Don't log sensitive headers
      },
      query: req.query,
      // Only log body for non-production or small payloads
      body: process.env.NODE_ENV === 'development' ? req.body : undefined,
    },
    status
  });

  res.status(status).json({
    error: {
      message,
      status,
      timestamp: new Date().toISOString(),
    },
  });
}