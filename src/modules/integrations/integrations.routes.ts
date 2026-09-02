import { Router } from 'express';
import { getConnectedAccounts, connectSocialAccount, triggerManualSync } from './integrations.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { isSuperAdmin } from '../admin/admin.routes';

const router = Router();

router.get('/accounts', authenticate, isSuperAdmin, getConnectedAccounts);
router.post('/connect', authenticate, isSuperAdmin, connectSocialAccount);
router.post('/sync', authenticate, isSuperAdmin, triggerManualSync);

export default router;
