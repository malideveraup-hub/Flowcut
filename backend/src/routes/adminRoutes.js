import { Router } from 'express';
import * as adminController from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { validateObjectIdParam } from '../utils/mongoId.js';

const router = Router();

router.use(requireAuth, requireRole('super_admin'));

router.get('/shops', adminController.listAllShops);
router.get('/shops/:shopId', validateObjectIdParam('shopId'), adminController.getShop);
router.patch('/shops/:shopId/approve', validateObjectIdParam('shopId'), adminController.approveShop);
router.patch('/shops/:shopId/reject', validateObjectIdParam('shopId'), adminController.rejectShop);

router.get('/users', adminController.listUsers);
router.get('/analytics/basic', adminController.basicAnalytics);

export default router;
