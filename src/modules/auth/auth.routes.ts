import { Router } from 'express';
import { sendOtp, verifyOtp, refreshSession, logout, adminLogin, verifyTotp, setup2fa, verifySetup2fa } from './auth.controller';
import { requestOtpSchema, verifyOtpSchema, refreshTokenSchema, adminLoginSchema, verifyTotpSchema, verifySetupTotpSchema } from './auth.validation';
import { validate } from '../../middleware/validate.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

// Strict rate limiter for OTP requests (e.g. max 5 requests per 15 mins)
const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5,
  message: { success: false, message: 'Too many OTP requests from this IP, please try again after 15 minutes.' }
});

router.post('/request-otp', otpRateLimiter, validate(requestOtpSchema), sendOtp);
router.post('/verify-otp', validate(verifyOtpSchema), verifyOtp);
router.post('/refresh-token', validate(refreshTokenSchema), refreshSession);
router.post('/logout', validate(refreshTokenSchema), logout);

// Admin / Super Admin routes
router.post('/admin-login', validate(adminLoginSchema), adminLogin);
router.post('/verify-totp', validate(verifyTotpSchema), verifyTotp);
router.post('/2fa/setup', setup2fa);
router.post('/2fa/verify-setup', validate(verifySetupTotpSchema), verifySetup2fa);

export default router;
