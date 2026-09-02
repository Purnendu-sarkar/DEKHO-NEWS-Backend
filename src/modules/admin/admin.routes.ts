import { Router, Response, NextFunction } from 'express';
import { getPendingNews, updateNewsStatus, getPendingAds, updateAdStatus, getDashboardMetrics, getUsers, suspendUser, getConfig, updateConfig, getAuditLogs, getAdminCategories, createCategory, updateCategory, streamVideo } from './admin.controller';
import { authenticate, AuthRequest } from '../../middleware/auth.middleware';

const router = Router();

// Middleware to check if user is super admin
export const isSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Forbidden: Super Admin access required' });
    return;
  }
  next();
};

router.get('/dashboard', authenticate, isSuperAdmin, getDashboardMetrics);

router.get('/categories', authenticate, isSuperAdmin, getAdminCategories);
router.post('/categories', authenticate, isSuperAdmin, createCategory);
router.put('/categories/:id', authenticate, isSuperAdmin, updateCategory);

router.get('/users', authenticate, isSuperAdmin, getUsers);
router.post('/users/:id/suspend', authenticate, isSuperAdmin, suspendUser);

router.get('/news/pending', authenticate, isSuperAdmin, getPendingNews);
router.put('/news/:id/status', authenticate, isSuperAdmin, updateNewsStatus);
router.use('/news/stream', streamVideo);

router.get('/ads/pending', authenticate, isSuperAdmin, getPendingAds);
router.put('/ads/:id/status', authenticate, isSuperAdmin, updateAdStatus);

router.get('/config', authenticate, isSuperAdmin, getConfig);
router.put('/config', authenticate, isSuperAdmin, updateConfig);

router.get('/audit-logs', authenticate, isSuperAdmin, getAuditLogs);

export default router;
