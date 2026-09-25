import { Router } from 'express';
import * as shopController from '../controllers/shopController.js';
import * as serviceController from '../controllers/serviceController.js';
import * as queueController from '../controllers/queueController.js';
import { requireAuth, requireRole, requireCurrentConsent } from '../middleware/authMiddleware.js';
import { validateObjectIdParam } from '../utils/mongoId.js';

const router = Router();

// Public browsing — no auth required (Section 2 of the original public-
// access brief; still the rule this phase preserves). Consent is a
// registration-time/account-action gate, never a browsing gate — a guest
// never sees it just for looking at shops/queues.
router.get('/', shopController.listPublicShops);

router.get(
  '/my-application',
  requireAuth,
  shopController.getMyShopApplication
);

router.get(
  '/:shopId',
  validateObjectIdParam('shopId'),
  shopController.getPublicShop
);
router.get('/:shopId/services', validateObjectIdParam('shopId'), serviceController.listPublicServices);
router.get('/:shopId/queue', validateObjectIdParam('shopId'), queueController.getPublicQueue);

// Submitting a shop application requires being logged in (any role) —
// ownerId is taken from req.user.id server-side, never the request body.
// Also requires current consent: an account created before a Terms/
// Privacy version bump must re-accept before this "account functionality"
// action, per the consent-timing requirement.
router.post('/', requireAuth, requireCurrentConsent, shopController.submitShopApplication);

// Joining a queue requires being logged in as a customer specifically,
// and requires current consent for the same reason as above.
router.post(
  '/:shopId/queue',
  validateObjectIdParam('shopId'),
  requireAuth,
  requireRole('customer'),
  requireCurrentConsent,
  queueController.joinQueue
);

export default router;
