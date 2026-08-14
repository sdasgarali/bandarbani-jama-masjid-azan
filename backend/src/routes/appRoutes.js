import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { adminLimiter, deviceRegisterLimiter } from '../middleware/rateLimiters.js';
import { apkUpload } from '../middleware/upload.js';
import { appReleaseVersionParamSchema } from '../validators/schemas.js';
import {
  uploadRelease,
  listReleases,
  latestVersion,
  streamRelease,
} from '../controllers/appController.js';

const router = Router();

// Public read-only limiter for unauthenticated app-facing endpoints.
const publicLimiter = deviceRegisterLimiter;

// Admin — upload + list releases.
router.post('/releases', requireAuth, adminLimiter, apkUpload.single('apk'), uploadRelease);
router.get('/releases', requireAuth, adminLimiter, listReleases);

// Public — latest version metadata + APK download.
router.get('/latest-version', publicLimiter, latestVersion);
router.get(
  '/releases/:versionCode/file',
  publicLimiter,
  validate(appReleaseVersionParamSchema, 'params'),
  streamRelease
);

export default router;
