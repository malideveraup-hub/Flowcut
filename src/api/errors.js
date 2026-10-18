// A typed error the mock API layer throws so pages can render a specific,
// safe message instead of a generic failure. The `code` values mirror the
// kinds of responses a real Express API should return (with the matching
// HTTP status in a comment) — this is the vocabulary the frontend expects
// once real endpoints exist.

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

// code              -> suggested real HTTP status
// NOT_FOUND         -> 404
// FORBIDDEN         -> 403 (authenticated, but not allowed to touch this resource)
// UNAUTHORIZED      -> 401 (not authenticated at all)
// INACTIVE          -> 409 (shop/service exists but isn't active)
// INVALID_STATE     -> 409 (illegal queue transition)
// VALIDATION        -> 400
// CONFLICT          -> 409 (e.g. duplicate active queue entry)

export const ERROR_MESSAGES = {
  NOT_FOUND: 'That could not be found.',
  FORBIDDEN: "You don't have access to that.",
  UNAUTHORIZED: 'Please log in to continue.',
  INACTIVE: 'This is not currently active.',
  INVALID_STATE: "That action isn't allowed right now.",
  VALIDATION: 'Please check your input and try again.',
  CONFLICT: 'That conflicts with something already in progress.',
  NETWORK: "Couldn't reach the server. Check your connection and try again.",
};

export function friendlyMessage(error) {
  if (error instanceof ApiError) {
    return error.message || ERROR_MESSAGES[error.code] || 'Something went wrong.';
  }
  return ERROR_MESSAGES.NETWORK;
}
