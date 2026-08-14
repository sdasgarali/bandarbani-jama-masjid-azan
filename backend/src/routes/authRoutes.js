import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiters.js';
import { loginSchema, refreshSchema, logoutSchema } from '../validators/schemas.js';
import { login, refresh, logout, me } from '../controllers/authController.js';

const router = Router();

router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/refresh', authLimiter, validate(refreshSchema), refresh);
router.post('/logout', authLimiter, validate(logoutSchema), logout);
router.get('/me', requireAuth, me);

export default router;
