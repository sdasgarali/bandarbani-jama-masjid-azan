import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { adminLimiter, publicReadLimiter } from '../middleware/rateLimiters.js';
import { audioUpload } from '../middleware/upload.js';
import { audioVersionParamSchema } from '../validators/schemas.js';
import {
  uploadAudio,
  listAudio,
  audioMeta,
  streamAudio,
} from '../controllers/audioController.js';

const router = Router();

router.post('/', requireAuth, adminLimiter, audioUpload.single('file'), uploadAudio);
router.get('/', requireAuth, adminLimiter, listAudio);

// Public read: audio recordings are not sensitive and the admin panel's <audio> element
// (and the Android media player) cannot attach auth headers. Consistent with the public
// APK-file route. Rate-limited to prevent abuse.
router.get(
  '/:version/meta',
  publicReadLimiter,
  validate(audioVersionParamSchema, 'params'),
  audioMeta
);
router.get(
  '/:version/file',
  publicReadLimiter,
  validate(audioVersionParamSchema, 'params'),
  streamAudio
);

export default router;
