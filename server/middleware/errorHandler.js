import config from '../config/index.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

/**
 * Wrap an async route handler so rejected promises are forwarded to the central
 * error handler instead of crashing the process or hanging the request.
 *   router.post('/', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** 404 for any unmatched /api route. */
export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

/** Central Express error handler. Must be registered LAST, after all routes. */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity (4 args).
export function errorHandler(err, req, res, next) {
  // Normalise known framework errors into clean client responses.
  if (err.name === 'MulterError') {
    err.isOperational = true;
    err.statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') err.message = 'File too large.';
  }

  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} failed`, { error: err.message, stack: err.stack });
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${statusCode}`, { error: err.message });
  }

  const body = { error: err.isOperational ? err.message : 'Something went wrong.' };
  if (err.code) body.code = err.code;
  // Expose internal error details only in development to aid debugging.
  if (!config.isProduction && !err.isOperational) body.detail = err.message;

  res.status(statusCode).json(body);
}

export { AppError };
