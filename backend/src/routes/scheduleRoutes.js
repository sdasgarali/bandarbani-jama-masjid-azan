import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requireDevice } from '../middleware/deviceAuth.js';
import { adminLimiter } from '../middleware/rateLimiters.js';
import {
  scheduleMetaSchema,
  prayerParamSchema,
  prayerUpdateSchema,
} from '../validators/schemas.js';
import {
  getDraft,
  updateMeta,
  updatePrayer,
  publish,
  listVersions,
  getCurrent,
} from '../controllers/scheduleController.js';

const router = Router();

// Device / public read (must be before the admin-guarded routes so it isn't shadowed).
router.get('/current', requireDevice, getCurrent);

// Admin
router.get('/', requireAuth, adminLimiter, getDraft);
router.put('/', requireAuth, adminLimiter, validate(scheduleMetaSchema), updateMeta);
router.put(
  '/prayers/:prayer',
  requireAuth,
  adminLimiter,
  validate(prayerParamSchema, 'params'),
  validate(prayerUpdateSchema),
  updatePrayer
);
router.post('/publish', requireAuth, adminLimiter, publish);
router.get('/versions', requireAuth, adminLimiter, listVersions);

export default router;
