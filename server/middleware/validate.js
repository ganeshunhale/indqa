import AppError from '../utils/AppError.js';

/**
 * Express middleware factory that validates part of the request against a Zod
 * schema. On success the parsed (and coerced) value replaces req[source]; on
 * failure it throws a 400 AppError describing the first problem.
 *
 *   router.post('/', validate(registerSchema), handler)
 *   router.get('/:id/messages', validate(idParamSchema, 'params'), handler)
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue.path.join('.');
      const message = path ? `${path}: ${issue.message}` : issue.message;
      throw new AppError(message, 400, { code: 'VALIDATION_ERROR' });
    }
    req[source] = result.data;
    next();
  };
}

/**
 * Validate an arbitrary payload (e.g. a Socket.IO event) against a Zod schema.
 * Returns the parsed data or throws a 400 AppError.
 */
export function validatePayload(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.join('.');
    const message = path ? `${path}: ${issue.message}` : issue.message;
    throw new AppError(message, 400, { code: 'VALIDATION_ERROR' });
  }
  return result.data;
}

export default validate;
