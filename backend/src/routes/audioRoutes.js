import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requireDevice } from '../middleware/deviceAuth.js';
import { adminLimiter } from '../middleware/rateLimiters.js';
import { audioUpload } from '../middleware/upload.js';
import { audioVersionParamSchema } from '../validators/schemas.js';
import {
  uploadAudio,
  listAudio,
  audioMeta,
  streamAudio,
} from '../controllers/audioController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/errors.js';

const router = Router();

// Allow either admin OR device auth for read-only file/meta access.
const requireAdminOrDevice = asyncHandler(async (req, res, next) => {
  if (req.headers.authorization) return requireAuth(req, res, next);
  if (req.get('X-Device-Id')) return requireDevice(req, res, next);
  throw new AppError('AUTH_INVALID', 'Authentication required');
});

router.post('/', requireAuth, adminLimiter, audioUpload.single('file'), uploadAudio);
router.get('/', requireAuth, adminLimiter, listAudio);
router.get(
  '/:version/meta',
  requireAdminOrDevice,
  validate(audioVersionParamSchema, 'params'),
  audioMeta
);
router.get(
  '/:version/file',
  requireAdminOrDevice,
  validate(audioVersionParamSchema, 'params'),
  streamAudio
);

export default router;
