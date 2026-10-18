import { Router } from 'express';
import * as queueController from '../controllers/queueController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

router.use(requireAuth, requireRole('customer'));

router.get('/my', queueController.getMyQueue);
router.get('/my/history', queueController.getMyQueueHistory);
router.post('/my/check-in', queueController.checkInMyQueue);
router.delete('/my', queueController.cancelMyQueue);

export default router;
