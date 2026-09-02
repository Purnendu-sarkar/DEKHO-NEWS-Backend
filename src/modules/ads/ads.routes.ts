import { Router } from 'express';
import { getAdPlans, purchaseAd, getMyAds } from './ads.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { upload } from '../../middleware/upload.middleware';

const router = Router();

router.get('/plans', authenticate, getAdPlans);
router.post('/purchase', authenticate, upload.fields([{ name: 'media', maxCount: 1 }]), purchaseAd);
router.get('/my-ads', authenticate, getMyAds);

export default router;
