import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requireDevice } from '../middleware/deviceAuth.js';
import { adminLimiter, deviceRegisterLimiter } from '../middleware/rateLimiters.js';
import {
  registerDeviceSchema,
  fcmTokenSchema,
  heartbeatSchema,
} from '../validators/schemas.js';
import {
  register,
  updateFcmToken,
  heartbeat,
  listDevices,
} from '../controllers/deviceController.js';

const router = Router();

router.post('/register', deviceRegisterLimiter, validate(registerDeviceSchema), register);
router.put('/fcm-token', requireDevice, validate(fcmTokenSchema), updateFcmToken);
router.post('/heartbeat', requireDevice, validate(heartbeatSchema), heartbeat);
router.get('/', requireAuth, adminLimiter, listDevices);

export default router;
