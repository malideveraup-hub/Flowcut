import { Router } from 'express';
import * as adminController from '../controllers/adminController.js';
import * as shopController from '../controllers/shopController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { validateObjectIdParam } from '../utils/mongoId.js';

const router = Router();

router.use(requireAuth, requireRole('super_admin'));

router.get('/shops', adminController.listAllShops);
router.get('/shops/:shopId/documents/:key', validateObjectIdParam('shopId'), shopController.getAdminShopApplicationDocument);
router.get('/shops/:shopId', validateObjectIdParam('shopId'), adminController.getShop);
router.patch('/shops/:shopId/approve', validateObjectIdParam('shopId'), adminController.approveShop);
router.patch('/shops/:shopId/reject', validateObjectIdParam('shopId'), adminController.rejectShop);
router.post('/shops/:shopId/queue-qr', validateObjectIdParam('shopId'), adminController.generateQueueQr);
router.post('/shops/:shopId/queue-qr/regenerate', validateObjectIdParam('shopId'), adminController.regenerateQueueQr);
router.patch('/shops/:shopId/queue-qr', validateObjectIdParam('shopId'), adminController.setQueueQrStatus);

router.get('/users', adminController.listUsers);
router.get('/analytics/basic', adminController.basicAnalytics);
router.get('/analytics/completed-services', adminController.completedServiceAnalytics);

export default router;
