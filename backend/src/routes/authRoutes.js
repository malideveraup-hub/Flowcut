import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authLimiter, gmailOtpLimiter } from '../middleware/rateLimiters.js';

const router = Router();

router.post('/register', authLimiter, gmailOtpLimiter, authController.register);
router.post('/login', authLimiter, gmailOtpLimiter, authController.login);
router.post('/verify-email', gmailOtpLimiter, authController.verifyEmail);
router.post('/resend-email', gmailOtpLimiter, authController.resendEmail);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.patch('/me', requireAuth, authController.updateMe);
router.delete('/me', requireAuth, authController.deleteMe);
// No requireCurrentConsent here — this IS how consent becomes current.
router.post('/consent', requireAuth, authController.recordConsent);

export default router;
