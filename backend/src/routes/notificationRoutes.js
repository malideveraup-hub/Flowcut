import { Router } from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { validateObjectIdParam } from '../utils/mongoId.js';

const router = Router();

router.use(requireAuth, requireRole('customer'));
router.get('/push-configuration', notificationController.pushConfiguration);
router.put('/push-subscription', notificationController.savePushSubscription);
router.delete('/push-subscription', notificationController.removePushSubscription);
router.get('/', notificationController.listMine);
router.patch('/read-all', notificationController.markAllMineRead);
router.patch('/:notificationId/read', validateObjectIdParam('notificationId'), notificationController.markMineRead);

export default router;
