import { AppError } from '../utils/errors.js';

// Validates a request part against a zod schema, replacing it with parsed data.
export const validate =
  (schema, part = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const details = result.error.flatten();
      return next(new AppError('VALIDATION', 'Validation failed', details));
    }
    // params/query can be read-only getters in some Express versions; assign safely.
    if (part === 'body') req.body = result.data;
    else req.validated = { ...(req.validated || {}), [part]: result.data };
    next();
  };

export default validate;
