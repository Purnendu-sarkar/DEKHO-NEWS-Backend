import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { NewsType } from '../../generated/prisma';
import { AuthRequest } from '../../middleware/auth.middleware';
import { checkForSpam } from '../../services/moderation.service';
import { uploadFileToS3 } from '../../services/s3.service';
import { videoQueue } from '../../lib/queue';
import fs from 'fs';

export const getCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    console.error('Get Categories Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const news = await prisma.news.findMany({
      where: {
        status: 'APPROVED',
        type: { in: ['VIDEO', 'PHOTO', 'READ'] }
      },
      include: {
        author: { select: { id: true, profile: { select: { name: true, photoUrl: true } } } },
        category: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ success: true, data: news });
  } catch (error) {
    console.error('Get Feed Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getRecommendedNews = async (req: Request, res: Response): Promise<void> => {
  try {
    // Advanced Recommendation Engine
    // 1. Fetch recent approved news (last 30 days) to keep recommendations fresh
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentNews = await prisma.news.findMany({
      where: { 
        status: 'APPROVED',
        createdAt: { gte: thirtyDaysAgo }
      },
      include: {
        author: { select: { id: true, profile: { select: { name: true, photoUrl: true } } } },
        category: { select: { name: true } }
      }
    });

    // 2. Score them based on recency and popularity
    const now = new Date().getTime();
    
    const scoredNews = recentNews.map(item => {
      // Popularity score: viewCount + (likeCount * 2)
      const popularityScore = item.viewCount + (item.likeCount * 2);
      
      // Recency score: Inverse of age in hours
      const ageInHours = (now - new Date(item.createdAt).getTime()) / (1000 * 60 * 60);
      const recencyScore = 100 / (ageInHours + 1); // +1 to avoid division by zero
      
      // Total Score
      const totalScore = (popularityScore * 0.6) + (recencyScore * 0.4);
      
      return {
        ...item,
        score: totalScore
      };
    });

    // 3. Sort by score and take top 10
    const recommendations = scoredNews
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Remove the 'score' property before sending to client
    const cleanRecommendations = recommendations.map(({ score, ...rest }) => rest);

    res.status(200).json({ success: true, data: cleanRecommendations });
  } catch (error) {
    console.error('Recommendation Engine Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getShorts = async (req: Request, res: Response): Promise<void> => {
  try {
    const shorts = await prisma.news.findMany({
      where: {
        status: 'APPROVED',
        type: 'SHORT'
      },
      include: {
        author: { select: { id: true, profile: { select: { name: true, photoUrl: true } } } },
        category: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ success: true, data: shorts });
  } catch (error) {
    console.error('Get Shorts Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const createNews = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, description, type, categoryId, tags, subCategory, location, newsDate, communityStandardAgreed, videoKey } = req.body;
    const authorId = req.user?.userId;

    if (!title || !type || !categoryId || !authorId) {
      res.status(400).json({ success: false, message: 'Missing required fields' });
      return;
    }

    if (communityStandardAgreed !== 'true' && communityStandardAgreed !== true) {
      res.status(400).json({ success: false, message: 'You must agree to the Community Standards' });
      return;
    }

    let videoUrl = null;
    let photoUrl = null;
    let thumbnailUrl = null;
    let additionalPhotos: string[] = [];

    if (videoKey && (type === 'VIDEO' || type === 'SHORT')) {
      videoUrl = 'processing';
    } else if (req.files) {
      const uploadToS3 = async (file: any, folder: string) => {
        const fileExt = file.originalname.split('.').pop() || '';
        const fileName = `${folder}/${authorId}-${Date.now()}-${Math.round(Math.random() * 1e9)}.${fileExt}`;
        const fileBuffer = fs.readFileSync(file.path);
        await uploadFileToS3(fileBuffer, fileName, file.mimetype);
        fs.unlinkSync(file.path);
        return fileName;
      };

      if (req.files.video && req.files.video[0]) {
        if (type === 'VIDEO' || type === 'SHORT') {
          videoUrl = 'processing';
        } else {
          videoUrl = await uploadToS3(req.files.video[0], 'videos');
        }
      }
      if (req.files.photo && req.files.photo[0]) {
        photoUrl = await uploadToS3(req.files.photo[0], 'photos');
      }
      if (req.files.thumbnail && req.files.thumbnail[0]) {
        thumbnailUrl = await uploadToS3(req.files.thumbnail[0], 'thumbnails');
      }
      if (req.files.additionalPhotos && req.files.additionalPhotos.length > 0) {
        for (const file of req.files.additionalPhotos) {
          additionalPhotos.push(await uploadToS3(file, 'photos'));
        }
      }
    }

    // Phase 5: Automated Basic Moderation
    const isSpam = checkForSpam(title, description || '');
    let initialStatus = 'PENDING';
    
    if (isSpam) {
      initialStatus = 'REJECTED';
    }

    const news = await prisma.news.create({
      data: {
        title,
        description,
        type: type as NewsType,
        categoryId,
        authorId,
        videoUrl,
        photoUrl,
        thumbnailUrl,
        additionalPhotos,
        subCategory,
        location,
        newsDate: newsDate ? new Date(newsDate) : null,
        tags: tags ? tags.split(',').map((t: string) => t.trim()) : [],
        status: initialStatus as any
      }
    });

    if (isSpam) {
      await prisma.notification.create({
        data: {
          userId: authorId,
          title: 'Content Rejected (Automated)',
          message: 'Your content was flagged by our automated moderation system and rejected.'
        }
      });
      res.status(201).json({ success: true, data: news, message: 'Content flagged as spam' });
      return;
    }

    if ((type === 'VIDEO' || type === 'SHORT') && videoKey) {
      // Trigger background processing in BullMQ
      await videoQueue.add('process', { newsId: news.id, authorId, videoKey });
      res.status(201).json({ success: true, data: news, message: 'Video uploaded and is processing...' });
      return;
    } else if ((type === 'VIDEO' || type === 'SHORT') && req.files && !Array.isArray(req.files) && req.files.video && req.files.video[0]) {
      // Support for old clients that still upload to the backend directly
      const localVideoPath = req.files.video[0].path;
      await videoQueue.add('process', { newsId: news.id, authorId, localVideoPath });
      res.status(201).json({ success: true, data: news, message: 'Video uploaded and is processing...' });
      return;
    }

    res.status(201).json({ success: true, data: news, message: 'Content submitted for review' });
  } catch (error) {
    console.error('Create News Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getMyContent = async (req: any, res: Response): Promise<void> => {
  try {
    const authorId = req.user?.userId;

    const news = await prisma.news.findMany({
      where: { authorId },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate Stats
    const totalUploads = news.length;
    const totalApproved = news.filter(n => n.status === 'APPROVED').length;
    const totalPending = news.filter(n => n.status === 'PENDING').length;
    const totalRejected = news.filter(n => n.status === 'REJECTED').length;
    const totalViews = news.reduce((acc, curr) => acc + curr.viewCount, 0);

    res.status(200).json({
      success: true,
      stats: {
        totalUploads,
        totalApproved,
        totalPending,
        totalRejected,
        totalViews
      },
      data: news
    });
  } catch (error) {
    console.error('Get My Content Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
