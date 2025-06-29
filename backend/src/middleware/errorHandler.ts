import { Request, Response, NextFunction } from 'express';

interface HttpError extends Error {
  status?: number;
}

export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // eslint-disable-next-line no-console
  console.error('Error:', err);

  const status = err.status ?? 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({
    error: {
      message,
      status,
      timestamp: new Date().toISOString(),
    },
  });
}