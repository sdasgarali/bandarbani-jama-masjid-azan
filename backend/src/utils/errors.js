// Documented error codes → HTTP status (API.md).
export const ERROR_STATUS = {
  AUTH_INVALID: 401,
  AUTH_EXPIRED: 401,
  VALIDATION: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  FILE_INVALID: 415,
  FORBIDDEN: 403,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(code, message, details = undefined) {
    super(message || code);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code] ?? 500;
    this.details = details;
  }
}

export const invalidAuth = (msg = 'Invalid credentials') => new AppError('AUTH_INVALID', msg);
export const expiredAuth = (msg = 'Token expired') => new AppError('AUTH_EXPIRED', msg);
export const validation = (msg = 'Validation failed', details) =>
  new AppError('VALIDATION', msg, details);
export const notFound = (msg = 'Not found') => new AppError('NOT_FOUND', msg);
export const forbidden = (msg = 'Forbidden') => new AppError('FORBIDDEN', msg);
export const fileInvalid = (msg = 'Invalid file') => new AppError('FILE_INVALID', msg);
export const internal = (msg = 'Internal server error') => new AppError('INTERNAL', msg);
