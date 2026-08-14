import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { adminLimiter } from '../middleware/rateLimiters.js';
import {
  testNotificationSchema,
  deviceIdsSchema,
  configUpsertSchema,
} from '../validators/schemas.js';
import {
  testNotification,
  testAzan,
  upsertConfig,
  listConfig,
} from '../controllers/adminController.js';

const router = Router();

router.use(requireAuth, adminLimiter);

router.post('/test-notification', validate(testNotificationSchema), testNotification);
router.post('/test-azan', validate(deviceIdsSchema), testAzan);
router.post('/config', validate(configUpsertSchema), upsertConfig);
router.get('/config', listConfig);

export default router;
