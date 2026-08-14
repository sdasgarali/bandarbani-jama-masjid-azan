import multer from 'multer';
import { AppError, ERROR_STATUS } from '../utils/errors.js';
import { logger } from '../config/logger.js';

// 404 for unmatched routes.
export function notFoundHandler(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
}

// Central error mapper → documented codes/status.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let code = 'INTERNAL';
  let message = 'Internal server error';
  let status = 500;

  if (err instanceof AppError) {
    code = err.code;
    message = err.message;
    status = err.status;
  } else if (err instanceof multer.MulterError) {
    code = 'FILE_INVALID';
    status = ERROR_STATUS.FILE_INVALID;
    message =
      err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds maximum allowed size' : err.message;
  } else if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    code = 'VALIDATION';
    status = ERROR_STATUS.VALIDATION;
    message = 'Malformed JSON body';
  }

  if (status >= 500) {
    logger.error({ err: err.message, stack: err.stack, path: req.path }, 'Unhandled error');
  } else {
    logger.debug({ code, path: req.path }, message);
  }

  const body = { error: { code, message } };
  if (err instanceof AppError && err.details) body.error.details = err.details;
  res.status(status).json(body);
}
