import { Router } from 'express';
import { getFeed, getShorts, createNews, getMyContent, getRecommendedNews, getCategories } from './news.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { upload } from '../../middleware/upload.middleware';

const router = Router();

// Feed endpoints
router.get('/feed', getFeed);
router.get('/shorts', getShorts);
router.get('/recommended', getRecommendedNews);
router.get('/categories', getCategories);

// Publisher endpoints
router.get('/my-content', authenticate, getMyContent);
router.post(
  '/', 
  authenticate, 
  upload.fields([{ name: 'video', maxCount: 1 }, { name: 'photo', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }, { name: 'additionalPhotos', maxCount: 10 }]), 
  createNews
);

export default router;
