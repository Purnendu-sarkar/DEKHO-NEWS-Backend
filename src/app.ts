import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

//health check
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'DEKHO NEWS API is running successfully',
    timestamp: new Date().toISOString(),
  });
});


// Health Check Route
app.get('/api/v1/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'DEKHO NEWS API is running successfully',
    timestamp: new Date().toISOString(),
  });
});
import authRoutes from './modules/auth/auth.routes';
import newsRoutes from './modules/news/news.routes';
import adminRoutes from './modules/admin/admin.routes';
import notificationRoutes from './modules/notification/notification.routes';
import integrationRoutes from './modules/integrations/integrations.routes';
import adsRoutes from './modules/ads/ads.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import userRoutes from './modules/user/user.routes';
import uploadRoutes from './modules/upload/upload.routes';

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/upload', uploadRoutes);

// Basic 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

export default app;
