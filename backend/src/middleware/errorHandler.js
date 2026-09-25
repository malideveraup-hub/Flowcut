// A typed application error. Controllers/services throw this (or let
// Mongoose errors bubble up, which errorHandler() below translates into
// the same consistent shape) and the errorHandler middleware turns it
// into the response shape used everywhere: { success, message, errors }.
export class AppError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

export function notFoundHandler(req, res, _next) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: [],
  });
}

/**
 * Translates a raw Mongoose error into an AppError-shaped {statusCode,
 * message, errors} triple. This exists so a schema-level failure (e.g.
 * the `match` regex on User.mobileNumber, or a `required` field) comes
 * back as a clean 400/409 instead of the generic 500 an un-recognized
 * error gets — without ever forwarding Mongoose's own internal error
 * object (which can reference internal paths/driver details) to the
 * client. Only short, field-level messages are extracted.
 */
function translateMongooseError(err) {
  if (err.name === 'ValidationError') {
    const errors = {};
    for (const [field, fieldErr] of Object.entries(err.errors || {})) {
      // Mongoose's own validator messages here are ones WE wrote in the
      // schema (e.g. "mobileNumber must be exactly 11 digits starting
      // with 09") — safe to surface. Never include fieldErr.reason /
      // fieldErr.stack, which can carry the raw driver error.
      errors[field] = fieldErr.message;
    }
    return { statusCode: 400, message: 'Please check your input and try again.', errors };
  }

  if (err.name === 'CastError') {
    return { statusCode: 400, message: `Invalid ${err.path}.`, errors: [] };
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    return { statusCode: 409, message: `This ${field} is already in use.`, errors: [] };
  }

  return null;
}

// Express 5 recognizes error-handling middleware by arity (4 args) — do
// not remove any of these parameters even if unused.
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, message: err.message, errors: err.errors });
  }

  const translated = translateMongooseError(err);
  if (translated) {
    return res.status(translated.statusCode).json({
      success: false,
      message: translated.message,
      errors: translated.errors,
    });
  }

  // Anything else (a genuine bug, a driver-level failure, etc.) is
  // logged in full server-side for debugging, but the client only ever
  // gets a generic message — never a stack trace, connection string,
  // internal file path, or raw error text (Section 4/11/16).
  console.error('[unhandled error]', err);
  res.status(500).json({
    success: false,
    message: 'Something went wrong on our end. Please try again.',
    errors: [],
  });
}
