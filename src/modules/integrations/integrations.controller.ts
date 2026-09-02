import { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth.middleware';
import { getYouTubeChannelInfo } from '../../services/youtube.service';
import { getFacebookPageInfo } from '../../services/facebook.service';

export const getConnectedAccounts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accounts = await prisma.socialAccount.findMany({
      select: { id: true, provider: true, accountId: true, channelName: true, createdAt: true }
    });
    res.status(200).json({ success: true, data: accounts });
  } catch (error) {
    console.error('Get Connected Accounts Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const connectSocialAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { provider, accessToken } = req.body;

    if (!['YOUTUBE', 'FACEBOOK'].includes(provider) || !accessToken) {
      res.status(400).json({ success: false, message: 'Provider and accessToken required' });
      return;
    }

    let accountId = '';
    let channelName = '';

    if (provider === 'YOUTUBE') {
      const info = await getYouTubeChannelInfo(accessToken);
      accountId = info.id;
      channelName = info.title;
    } else if (provider === 'FACEBOOK') {
      const info = await getFacebookPageInfo(accessToken);
      accountId = info.id;
      channelName = info.name;
    }

    // Check if already connected
    const existing = await prisma.socialAccount.findFirst({
      where: { provider, accountId }
    });

    if (existing) {
      res.status(400).json({ success: false, message: 'Account is already connected' });
      return;
    }

    const account = await prisma.socialAccount.create({
      data: {
        userId: req.user!.userId,
        provider,
        accountId,
        channelName,
        accessToken,
      }
    });

    res.status(201).json({ success: true, data: account, message: `${provider} connected successfully` });
  } catch (error) {
    console.error('Connect Social Account Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Expose a manual sync endpoint for testing
export const triggerManualSync = async (req: AuthRequest, res: Response): Promise<void> => {
  // In a real app, this would dispatch the cron logic immediately.
  // We will just mock the success response.
  res.status(200).json({ success: true, message: 'Manual sync triggered in background' });
};
