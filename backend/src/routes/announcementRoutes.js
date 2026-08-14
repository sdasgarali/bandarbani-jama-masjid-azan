import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { adminLimiter } from '../middleware/rateLimiters.js';
import { audioUpload } from '../middleware/upload.js';
import { announcementIdParamSchema } from '../validators/schemas.js';
import {
  createAnnouncement,
  listAnnouncements,
  updateAnnouncement,
  deleteAnnouncement,
} from '../controllers/announcementController.js';

const router = Router();

// All announcement routes are admin-only + admin rate limited.
// POST is multipart: optional `audio` MP3 file (creates an ANNOUNCEMENT audio) or `audioId`.
router.post('/', requireAuth, adminLimiter, audioUpload.single('audio'), createAnnouncement);
router.get('/', requireAuth, adminLimiter, listAnnouncements);
router.put(
  '/:id',
  requireAuth,
  adminLimiter,
  validate(announcementIdParamSchema, 'params'),
  updateAnnouncement
);
router.delete(
  '/:id',
  requireAuth,
  adminLimiter,
  validate(announcementIdParamSchema, 'params'),
  deleteAnnouncement
);

export default router;
