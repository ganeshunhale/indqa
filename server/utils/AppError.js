/**
 * Operational error with an HTTP status code and optional machine-readable code.
 *
 * Thrown deliberately by services/routes for expected failure cases (bad input,
 * upstream quota, not found, ...). The central error handler turns these into
 * clean client responses, while unexpected errors stay 500 with details hidden
 * in production.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = options.code;
    this.isOperational = true;
    if (options.cause) this.cause = options.cause;
  }
}

export default AppError;
