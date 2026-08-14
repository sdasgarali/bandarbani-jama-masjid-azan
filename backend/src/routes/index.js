import { Router } from 'express';
import authRoutes from './authRoutes.js';
import scheduleRoutes from './scheduleRoutes.js';
import audioRoutes from './audioRoutes.js';
import deviceRoutes from './deviceRoutes.js';
import adminRoutes from './adminRoutes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ data: { status: 'ok' } }));
router.use('/auth', authRoutes);
router.use('/schedule', scheduleRoutes);
router.use('/audio', audioRoutes);
router.use('/devices', deviceRoutes);
router.use('/admin', adminRoutes);

export default router;
