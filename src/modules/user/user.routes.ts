import { Router } from 'express';
import multer from 'multer';
import { getProfile, updateProfile, toggleFollow } from './user.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, upload.single('photo'), updateProfile);
router.post('/:id/follow', authenticate, toggleFollow);

export default router;
