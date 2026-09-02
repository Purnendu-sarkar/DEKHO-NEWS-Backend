import { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth.middleware';

export const getAdPlans = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const plans = await prisma.adPlan.findMany({
      orderBy: { price: 'asc' }
    });
    res.status(200).json({ success: true, data: plans });
  } catch (error) {
    console.error('Get Ad Plans Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const purchaseAd = async (req: any, res: Response): Promise<void> => {
  try {
    const { title, description, ctaText, targetUrl, planId } = req.body;
    const authorId = req.user?.userId;

    if (!title || !planId || !authorId) {
      res.status(400).json({ success: false, message: 'Missing required fields' });
      return;
    }

    let mediaUrl = '';
    if (req.files && req.files.media && req.files.media[0]) {
      mediaUrl = `/uploads/${req.files.media[0].filename}`;
    } else {
      res.status(400).json({ success: false, message: 'Media file is required' });
      return;
    }

    // Mock Payment verification logic
    console.log(`Simulating payment for AdPlan ${planId}... Payment Successful!`);

    const ad = await prisma.advertisement.create({
      data: {
        title,
        description,
        mediaUrl,
        ctaText,
        targetUrl,
        planId,
        authorId,
        status: 'PENDING'
      }
    });

    res.status(201).json({ success: true, data: ad, message: 'Payment successful, ad submitted for review' });
  } catch (error) {
    console.error('Purchase Ad Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getMyAds = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const authorId = req.user?.userId;
    const ads = await prisma.advertisement.findMany({
      where: { authorId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: ads });
  } catch (error) {
    console.error('Get My Ads Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
