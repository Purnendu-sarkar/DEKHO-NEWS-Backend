import { Router } from 'express';
import { getUploadPresignedUrl } from './upload.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.post('/presigned-url', authenticate, getUploadPresignedUrl);

export default router;
