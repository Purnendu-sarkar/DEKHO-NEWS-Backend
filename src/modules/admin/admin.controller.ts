import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { ContentStatus, AdStatus } from '../../generated/prisma/client';
import { AuthRequest } from '../../middleware/auth.middleware';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME, getPresignedUrl } from '../../services/s3.service';
import fs from 'fs';
import path from 'path';

export const getPendingNews = async (req: Request, res: Response): Promise<void> => {
  try {
    const news = await prisma.news.findMany({
      where: { status: 'PENDING' },
      include: {
        author: { select: { id: true, profile: { select: { name: true } } } },
        category: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const processedNews = await Promise.all(news.map(async (n) => {
      let photoUrl = n.photoUrl;
      let thumbnailUrl = n.thumbnailUrl;

      if (photoUrl && !photoUrl.startsWith('http') && !photoUrl.startsWith('/uploads/')) {
        try { photoUrl = await getPresignedUrl(photoUrl, 3600); } catch (e) { console.error('Presigned photo url err:', e); }
      }
      if (thumbnailUrl && !thumbnailUrl.startsWith('http') && !thumbnailUrl.startsWith('/uploads/')) {
        try { thumbnailUrl = await getPresignedUrl(thumbnailUrl, 3600); } catch (e) { console.error('Presigned thumb url err:', e); }
      }

      return {
        ...n,
        photoUrl,
        thumbnailUrl
      };
    }));

    res.status(200).json({ success: true, data: processedNews });
  } catch (error) {
    console.error('Admin Get Pending News Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateNewsStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status, rejectionReason, adminComment } = req.body; // APPROVED or REJECTED
    const adminId = req.user?.userId;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }

    const news = await prisma.news.findUnique({ where: { id } });
    if (!news) {
      res.status(404).json({ success: false, message: 'News not found' });
      return;
    }

    const updatedNews = await prisma.news.update({
      where: { id },
      data: { 
        status: status as ContentStatus,
        ...(status === 'REJECTED' && { rejectionReason, adminComment })
      }
    });

    // Notify user
    let message = `Your content "${news.title}" has been ${status.toLowerCase()}.`;
    if (status === 'REJECTED' && rejectionReason) {
      message += ` Reason: ${rejectionReason}.`;
    }
    
    await prisma.notification.create({
      data: {
        userId: news.authorId,
        title: `Content ${status}`,
        message
      }
    });

    // Audit Log
    if (adminId) {
      await prisma.auditLog.create({
        data: {
          adminId,
          action: `${status}_NEWS`,
          targetId: id,
          details: `Admin changed news status to ${status}`
        }
      });
    }

    res.status(200).json({ success: true, message: `Content ${status.toLowerCase()} successfully`, data: updatedNews });
  } catch (error) {
    console.error('Admin Update News Status Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getPendingAds = async (req: Request, res: Response): Promise<void> => {
  try {
    const ads = await prisma.advertisement.findMany({
      where: { status: 'PENDING' },
      include: {
        author: { select: { id: true, profile: { select: { name: true } } } },
        plan: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: ads });
  } catch (error) {
    console.error('Admin Get Pending Ads Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateAdStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status } = req.body; // APPROVED, REJECTED
    
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }

    const ad = await prisma.advertisement.findUnique({ where: { id }, include: { plan: true } });
    if (!ad) {
      res.status(404).json({ success: false, message: 'Ad not found' });
      return;
    }

    let updateData: any = { status: status as AdStatus };

    if (status === 'APPROVED') {
      updateData.status = 'ACTIVE';
      updateData.startDate = new Date();
      
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + ad.plan.durationDays);
      updateData.endDate = endDate;
    }

    const updatedAd = await prisma.advertisement.update({
      where: { id },
      data: updateData
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId: ad.authorId,
        title: `Advertisement ${status}`,
        message: `Your ad campaign "${ad.title}" has been ${status.toLowerCase()}${status === 'APPROVED' ? ' and is now ACTIVE' : ''}.`
      }
    });

    // Audit Log
    const adminId = req.user?.userId;
    if (adminId) {
      await prisma.auditLog.create({
        data: {
          adminId,
          action: `${status}_AD`,
          targetId: id,
          details: `Admin changed ad status to ${status}`
        }
      });
    }

    res.status(200).json({ success: true, message: `Ad ${status.toLowerCase()} successfully`, data: updatedAd });
  } catch (error) {
    console.error('Admin Update Ad Status Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getDashboardMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const totalUsers = await prisma.user.count();
    const pendingContent = await prisma.news.count({ where: { status: 'PENDING' } });
    const publishedContent = await prisma.news.count({ where: { status: 'APPROVED' } });
    const totalAds = await prisma.advertisement.count();
    
    // Revenue placeholder (would normally aggregate from payments/orders)
    const totalRevenue = 0; 

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        pendingContent,
        publishedContent,
        totalAds,
        totalRevenue
      }
    });
  } catch (error) {
    console.error('Admin Dashboard Metrics Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      include: { profile: true },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error('Admin Get Users Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const suspendUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { suspend } = req.body;
    
    // In a real app you might have an 'isActive' flag, here we might change role or session
    // For now, let's revoke their sessions as suspension
    if (suspend) {
      await prisma.session.updateMany({
        where: { userId: id },
        data: { isRevoked: true }
      });
    }

    if (req.user?.userId) {
      await prisma.auditLog.create({
        data: {
          adminId: req.user.userId,
          action: suspend ? 'SUSPEND_USER' : 'UNSUSPEND_USER',
          targetId: id,
          details: `Admin ${suspend ? 'suspended' : 'unsuspended'} user sessions`
        }
      });
    }

    res.status(200).json({ success: true, message: `User ${suspend ? 'suspended' : 'unsuspended'} successfully` });
  } catch (error) {
    console.error('Admin Suspend User Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await prisma.appConfig.findMany();
    res.status(200).json({ success: true, data: config });
  } catch (error) {
    console.error('Admin Get Config Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { key, value } = req.body;
    
    const config = await prisma.appConfig.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) }
    });

    if (req.user?.userId) {
      await prisma.auditLog.create({
        data: {
          adminId: req.user.userId,
          action: 'UPDATE_CONFIG',
          targetId: key,
          details: `Admin updated config ${key}`
        }
      });
    }

    res.status(200).json({ success: true, data: config });
  } catch (error) {
    console.error('Admin Update Config Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: { admin: { select: { email: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    console.error('Admin Get Audit Logs Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getAdminCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' }
    });
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    console.error('Admin Get Categories Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const createCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, isActive } = req.body;
    if (!name) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }
    
    const category = await prisma.category.create({
      data: { name, isActive: isActive ?? true }
    });
    
    if (req.user?.userId) {
      await prisma.auditLog.create({
        data: {
          adminId: req.user.userId,
          action: 'CREATE_CATEGORY',
          targetId: category.id,
          details: `Created category ${name}`
        }
      });
    }
    
    res.status(201).json({ success: true, data: category, message: 'Category created successfully' });
  } catch (error: any) {
    console.error('Admin Create Category Error:', error);
    if (error.code === 'P2002') {
      res.status(400).json({ success: false, message: 'Category with this name already exists' });
      return;
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { name, isActive } = req.body;
    
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(isActive !== undefined && { isActive })
      }
    });
    
    if (req.user?.userId) {
      await prisma.auditLog.create({
        data: {
          adminId: req.user.userId,
          action: 'UPDATE_CATEGORY',
          targetId: id,
          details: `Updated category ${category.name}`
        }
      });
    }
    
    res.status(200).json({ success: true, data: category, message: 'Category updated successfully' });
  } catch (error: any) {
    console.error('Admin Update Category Error:', error);
    if (error.code === 'P2002') {
      res.status(400).json({ success: false, message: 'Category name must be unique' });
      return;
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const streamVideo = async (req: AuthRequest, res: Response): Promise<void> => {
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

    // Handle local file fallback if the video is saved locally in /uploads/
    if (key.startsWith('/uploads/')) {
      const cleanKey = key.replace(/^\//, ''); // remove leading slash
      const filePath = path.join(__dirname, '../../../public', cleanKey); // src/modules/admin -> ../../.. -> backend -> public
      if (fs.existsSync(filePath)) {
         res.sendFile(path.resolve(filePath));
         return;
      } else {
         res.status(404).send('Local file not found');
         return;
      }
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
    console.error('Error streaming video from S3:', error);
    res.status(404).send('Not Found');
  }
};
