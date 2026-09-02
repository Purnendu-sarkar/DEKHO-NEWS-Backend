import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth.middleware';

export const getPublisherAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const authorId = req.user?.userId;

    const news = await prisma.news.findMany({
      where: { authorId },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        viewCount: true,
        likeCount: true,
        shareCount: true,
        createdAt: true,
        rejectionReason: true,
        adminComment: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    const totalViews = news.reduce((acc, curr) => acc + curr.viewCount, 0);
    const totalLikes = news.reduce((acc, curr) => acc + curr.likeCount, 0);
    const totalShares = news.reduce((acc, curr) => acc + curr.shareCount, 0);

    const totalVideos = news.filter(n => n.type === 'VIDEO').length;
    const totalShorts = news.filter(n => n.type === 'SHORT').length;
    const totalPhotos = news.filter(n => n.type === 'PHOTO').length;
    const totalRead = news.filter(n => n.type === 'READ').length;

    const totalApproved = news.filter(n => n.status === 'APPROVED').length;
    const totalPending = news.filter(n => n.status === 'PENDING').length;
    const totalRejected = news.filter(n => n.status === 'REJECTED').length;

    res.status(200).json({
      success: true,
      data: {
        totalViews,
        totalLikes,
        totalShares,
        totalContent: news.length,
        totalVideos,
        totalShorts,
        totalPhotos,
        totalRead,
        totalApproved,
        totalPending,
        totalRejected,
        topPerforming: news // Rename in UI or keep name but it returns all now
      }
    });
  } catch (error) {
    console.error('Publisher Analytics Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getAdAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const authorId = req.user?.userId;

    const ads = await prisma.advertisement.findMany({
      where: { authorId },
      include: {
        plan: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // In a real system, we'd have an AdImpression and AdClick model.
    // For this implementation plan, we will mock the impression/click counts.
    const enrichedAds = ads.map(ad => {
      // Mock metrics for demo
      const impressions = Math.floor(Math.random() * 10000);
      const clicks = Math.floor(impressions * (Math.random() * 0.05)); // 0-5% CTR
      const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0.00';

      return {
        ...ad,
        metrics: {
          impressions,
          clicks,
          ctr: `${ctr}%`
        }
      };
    });

    res.status(200).json({ success: true, data: enrichedAds });
  } catch (error) {
    console.error('Ad Analytics Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
