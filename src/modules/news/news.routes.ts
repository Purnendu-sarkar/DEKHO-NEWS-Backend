import { Router } from 'express';
import {
  getFeed,
  getRecommendedNews,
  getShorts,
  createNews,
  getMyContent,
  getCategories,
  streamVideo,
  toggleLike,
  incrementView,
  getComments,
  addComment
} from './news.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { upload } from '../../middleware/upload.middleware';

const router = Router();

// Stream endpoint (public)
router.use('/stream', streamVideo);

// Feed endpoints
router.get('/feed', getFeed);
router.get('/shorts', getShorts);
router.get('/recommended', getRecommendedNews);
router.get('/categories', getCategories);

// Social Interactions
router.post('/:id/like', authenticate, toggleLike);
router.post('/:id/view', incrementView); // public
router.get('/:id/comments', getComments); // public
router.post('/:id/comments', authenticate, addComment);

// Publisher endpoints
router.get('/my-content', authenticate, getMyContent);
router.post(
  '/', 
  authenticate, 
  upload.fields([{ name: 'video', maxCount: 1 }, { name: 'photo', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }, { name: 'additionalPhotos', maxCount: 10 }]), 
  createNews
);

export default router;
