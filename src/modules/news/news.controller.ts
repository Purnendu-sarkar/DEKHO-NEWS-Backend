import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { NewsType } from '../../generated/prisma/client';
import { AuthRequest } from '../../middleware/auth.middleware';
import { checkForSpam } from '../../services/moderation.service';
import { uploadFileToS3, s3Client, BUCKET_NAME } from '../../services/s3.service';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { videoQueue } from '../../lib/queue';
import { redis } from '../../lib/redis';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

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
    const typeParam = req.query.type as string;
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt((req.query.limit as string) || '10', 10);

    let typeFilter: any = { in: ['VIDEO', 'PHOTO', 'READ'] };
    
    if (typeParam === 'Videos') typeFilter = 'VIDEO';
    else if (typeParam === 'Photos') typeFilter = 'PHOTO';
    else if (typeParam === 'Read') typeFilter = 'READ';
    else if (typeParam) typeFilter = typeParam; // Fallback for raw enum string

    const news = await prisma.news.findMany({
      where: {
        status: 'APPROVED',
        type: typeFilter
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        author: { select: { id: true, profile: { select: { name: true, photoUrl: true } } } },
        category: { select: { name: true } },
        _count: { select: { comments: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    let nextCursor: string | null = null;
    if (news.length > limit) {
      const nextItem = news.pop();
      nextCursor = nextItem!.id;
    }

    res.status(200).json({ success: true, data: news, nextCursor });
  } catch (error) {
    console.error('Get Feed Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getRelatedNews = async (req: Request, res: Response): Promise<void> => {
  try {
    const newsId = req.params.id as string;
    
    // Find the current news to get its category
    const currentNews = await prisma.news.findUnique({
      where: { id: newsId }
    });

    if (!currentNews) {
      res.status(404).json({ success: false, message: 'News not found' });
      return;
    }

    // Fetch related news (same category, excluding the current one)
    const relatedNews = await prisma.news.findMany({
      where: {
        status: 'APPROVED',
        categoryId: currentNews.categoryId,
        id: { not: newsId }
      },
      take: 10,
      include: {
        author: { select: { id: true, profile: { select: { name: true, photoUrl: true } } } },
        category: { select: { name: true } },
        _count: { select: { comments: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // If not enough related news in the same category, fetch recent ones to fill up
    if (relatedNews.length < 5) {
      const moreNews = await prisma.news.findMany({
        where: {
          status: 'APPROVED',
          id: { not: newsId },
          NOT: { id: { in: relatedNews.map(r => r.id) } }
        },
        take: 10 - relatedNews.length,
        include: {
          author: { select: { id: true, profile: { select: { name: true, photoUrl: true } } } },
          category: { select: { name: true } },
          _count: { select: { comments: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
      relatedNews.push(...moreNews);
    }

    res.status(200).json({ success: true, data: relatedNews });
  } catch (error) {
    console.error('Get Related News Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getNewsById = async (req: Request, res: Response): Promise<void> => {
  try {
    const newsId = req.params.id as string;
    
    const news = await prisma.news.findUnique({
      where: { id: newsId },
      include: {
        author: { select: { id: true, profile: { select: { name: true, photoUrl: true } } } },
        category: { select: { name: true } },
        _count: { select: { comments: true } }
      }
    });

    if (!news) {
      res.status(404).json({ success: false, message: 'News not found' });
      return;
    }

    res.status(200).json({ success: true, data: news });
  } catch (error) {
    console.error('Get News By Id Error:', error);
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
        category: { select: { name: true } },
        _count: { select: { comments: true } }
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
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt((req.query.limit as string) || '10', 10);

    const cacheKey = `shorts_feed:${cursor || 'first'}:${limit}`;
    const cachedData = await redis.get(cacheKey);

    let responseData;

    if (cachedData) {
      responseData = JSON.parse(cachedData);
    } else {
      const shorts = await prisma.news.findMany({
        where: {
          status: 'APPROVED',
          type: 'SHORT'
        },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        include: {
          author: { select: { id: true, profile: { select: { name: true, photoUrl: true } } } },
          category: { select: { name: true } },
          _count: { select: { comments: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      let nextCursor: string | null = null;
      if (shorts.length > limit) {
        const nextItem = shorts.pop();
        nextCursor = nextItem!.id;
      }

      responseData = { success: true, data: shorts, nextCursor };

      // Cache for 60 seconds
      await redis.setex(cacheKey, 60, JSON.stringify(responseData));
    }

    // Determine if logged in user has liked any of these
    let userId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
        userId = decoded.userId;
      } catch (e) {
        // ignore invalid token
      }
    }

    let finalData = responseData;
    if (userId) {
      const newsIds = responseData.data.map((n: any) => n.id);
      const likes = await prisma.like.findMany({
        where: { userId, newsId: { in: newsIds } }
      });
      const likedNewsIds = new Set(likes.map(l => l.newsId));
      
      finalData = {
        ...responseData,
        data: responseData.data.map((n: any) => ({
          ...n,
          isLiked: likedNewsIds.has(n.id)
        }))
      };
    } else {
      finalData = {
        ...responseData,
        data: responseData.data.map((n: any) => ({
          ...n,
          isLiked: false
        }))
      };
    }

    res.status(200).json(finalData);
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
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const uploadToS3 = async (file: any, folder: string) => {
        const fileExt = file.originalname.split('.').pop() || '';
        const fileName = `${folder}/${authorId}-${Date.now()}-${Math.round(Math.random() * 1e9)}.${fileExt}`;
        const fileBuffer = fs.readFileSync(file.path);
        await uploadFileToS3(fileBuffer, fileName, file.mimetype);
        fs.unlinkSync(file.path);
        return fileName;
      };

      if (files.video && files.video[0]) {
        if (type === 'VIDEO' || type === 'SHORT') {
          videoUrl = 'processing';
        } else {
          videoUrl = await uploadToS3(files.video[0], 'videos');
        }
      }
      if (files.photo && files.photo[0]) {
        photoUrl = await uploadToS3(files.photo[0], 'photos');
      }
      if (files.thumbnail && files.thumbnail[0]) {
        thumbnailUrl = await uploadToS3(files.thumbnail[0], 'thumbnails');
      }
      if (files.additionalPhotos && files.additionalPhotos.length > 0) {
        for (const file of files.additionalPhotos) {
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
    } else if ((type === 'VIDEO' || type === 'SHORT') && req.files && !Array.isArray(req.files)) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (files.video && files.video[0]) {
        // Support for old clients that still upload to the backend directly
        const localVideoPath = files.video[0].path;
        await videoQueue.add('process', { newsId: news.id, authorId, localVideoPath });
        res.status(201).json({ success: true, data: news, message: 'Video uploaded and is processing...' });
        return;
      }
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

export const streamVideo = async (req: Request, res: Response): Promise<void> => {
  try {
    let keyRaw = req.path.replace(/^\//, '') || req.query.key;
    const key = keyRaw as string;
    if (!key) {
      res.status(400).send('Missing key');
      return;
    }

    if (key === 'processing') {
      res.status(404).send('Video is still processing');
      return;
    }

    const range = req.headers.range;
    const getParams: any = {
      Bucket: BUCKET_NAME,
      Key: key,
    };
    if (range) {
      getParams.Range = range;
    }

    const command = new GetObjectCommand(getParams);
    const s3Item = await s3Client.send(command);

    if (s3Item.ContentRange) {
      res.setHeader('Content-Range', s3Item.ContentRange);
      res.status(206);
    } else {
      res.status(200);
    }
    
    if (s3Item.AcceptRanges) res.setHeader('Accept-Ranges', s3Item.AcceptRanges);
    if (s3Item.ContentType) res.setHeader('Content-Type', s3Item.ContentType);
    if (s3Item.ContentLength) res.setHeader('Content-Length', s3Item.ContentLength);

    const stream = s3Item.Body as any;
    stream.pipe(res);
  } catch (error) {
    console.error('Error streaming public video from S3:', error);
    res.status(404).send('Not Found');
  }
};

export const toggleLike = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const newsId = req.params.id as string;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const existingLike = await prisma.like.findUnique({
      where: { userId_newsId: { userId, newsId } }
    });

    if (existingLike) {
      await prisma.like.delete({
        where: { userId_newsId: { userId, newsId } }
      });
      await prisma.news.update({
        where: { id: newsId },
        data: { likeCount: { decrement: 1 } }
      });
      
      // Invalidate cache
      const keys = await redis.keys('shorts_feed:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }

      res.status(200).json({ success: true, message: 'Unliked', isLiked: false });
    } else {
      await prisma.like.create({
        data: { userId, newsId }
      });
      await prisma.news.update({
        where: { id: newsId },
        data: { likeCount: { increment: 1 } }
      });
      
      // Invalidate cache
      const keys = await redis.keys('shorts_feed:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }

      res.status(200).json({ success: true, message: 'Liked', isLiked: true });
    }
  } catch (error) {
    console.error('Toggle Like Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const incrementView = async (req: Request, res: Response): Promise<void> => {
  try {
    const newsId = req.params.id as string;
    
    await prisma.news.update({
      where: { id: newsId },
      data: { viewCount: { increment: 1 } }
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Increment View Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getComments = async (req: Request, res: Response): Promise<void> => {
  try {
    const newsId = req.params.id as string;
    const comments = await prisma.comment.findMany({
      where: { newsId, parentId: null },
      include: {
        user: { select: { id: true, profile: { select: { name: true, photoUrl: true } } } },
        replies: {
          include: {
            user: { select: { id: true, profile: { select: { name: true, photoUrl: true } } } }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: comments });
  } catch (error) {
    console.error('Get Comments Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const addComment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const newsId = req.params.id as string;
    const { text, parentId } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    
    if (!text || text.trim() === '') {
      res.status(400).json({ success: false, message: 'Comment text is required' });
      return;
    }

    const comment = await prisma.comment.create({
      data: { text, userId, newsId, parentId: parentId || null },
      include: {
        user: { select: { id: true, profile: { select: { name: true, photoUrl: true } } } }
      }
    });

    res.status(201).json({ success: true, data: comment });
  } catch (error) {
    console.error('Add Comment Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
