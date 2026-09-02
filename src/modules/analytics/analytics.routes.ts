import { Router } from 'express';
import { getPublisherAnalytics, getAdAnalytics } from './analytics.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// Get publisher analytics (for regular users who post content)
router.get('/publisher', authenticate, getPublisherAnalytics);

// Get ad analytics (for regular users who post ads)
router.get('/ads', authenticate, getAdAnalytics);

export default router;
