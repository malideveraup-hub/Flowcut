import { Router } from 'express';
import * as shopController from '../controllers/shopController.js';
import * as serviceController from '../controllers/serviceController.js';
import * as barberController from '../controllers/barberController.js';
import * as queueController from '../controllers/queueController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { validateObjectIdParam } from '../utils/mongoId.js';

const router = Router();

// Every route below requires an authenticated shop_admin. Every
// controller behind this reads req.user.shopId (set by requireAuth from
// the DATABASE record) — never a shopId param/body value — which is the
// actual multi-shop isolation guarantee (Section 3/13).
router.use(requireAuth, requireRole('shop_admin'));

router.get('/shop', shopController.getOwnShop);
router.patch('/shop', shopController.updateOwnShop);

router.get('/services', serviceController.listOwnServices);
router.post('/services', serviceController.createService);
router.patch('/services/:serviceId', validateObjectIdParam('serviceId'), serviceController.updateService);
router.patch('/services/:serviceId/status', validateObjectIdParam('serviceId'), serviceController.setServiceStatus);

router.get('/barbers', barberController.listShopBarbers);
router.post('/barbers', barberController.createBarber);
router.patch('/barbers/:barberId', validateObjectIdParam('barberId'), barberController.updateBarberStatus);

router.get('/queue', queueController.getShopQueue);
router.post('/queue', queueController.addWalkIn);
router.patch('/queue/:entryId/skip', validateObjectIdParam('entryId'), queueController.skipEntry);
router.patch('/queue/:entryId/cancel', validateObjectIdParam('entryId'), queueController.cancelEntryByStaff);

export default router;
