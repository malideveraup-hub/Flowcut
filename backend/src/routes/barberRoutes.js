import { Router } from 'express';
import * as barberController from '../controllers/barberController.js';
import * as queueController from '../controllers/queueController.js';
import { requireAuth, requireRole, attachBarberProfile } from '../middleware/authMiddleware.js';
import { validateObjectIdParam } from '../utils/mongoId.js';

const router = Router();

router.use(requireAuth, requireRole('barber'), attachBarberProfile);

router.get('/dashboard', barberController.getMyDashboard);
router.patch('/availability', barberController.setMyAvailability);

router.patch('/queue/:entryId/start', validateObjectIdParam('entryId'), queueController.startService);
router.patch('/queue/:entryId/finish', validateObjectIdParam('entryId'), queueController.finishService);
router.patch('/queue/:entryId/delay', validateObjectIdParam('entryId'), queueController.applyDelay);

export default router;
