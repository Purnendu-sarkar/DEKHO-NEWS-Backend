import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import prisma from '../../lib/prisma';
import { uploadFileToS3, getPresignedUrl } from '../../services/s3.service';
import bcrypt from 'bcryptjs';

/**
 * Get User Profile
 */
export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            socialAccounts: {
              select: { provider: true, channelName: true }
            }
          }
        }
      }
    });

    if (!profile) {
      res.status(404).json({ success: false, message: 'Profile not found' });
      return;
    }

    // If photoUrl exists (which is the S3 key), generate a pre-signed URL
    let avatarUrl = profile.photoUrl;
    if (avatarUrl && !avatarUrl.startsWith('http')) {
      try {
        avatarUrl = await getPresignedUrl(avatarUrl, 3600); // 1 hour expiry
      } catch (error) {
        console.error('Error generating pre-signed URL:', error);
        // Leave it as is or handle it
      }
    }

    res.status(200).json({
      success: true,
      data: {
        ...profile,
        avatarUrl, // the pre-signed or original url
      }
    });
  } catch (error) {
    console.error('Error in getProfile:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Update User Profile
 */
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { name, bio, username, location, email, phone, password } = req.body;
    let photoUrl: string | undefined;

    let hashedPassword = undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Handle file upload if present
    if (req.file) {
      const fileExt = req.file.originalname.split('.').pop() || 'jpg';
      const fileName = `profiles/${userId}-${Date.now()}.${fileExt}`;
      
      try {
        await uploadFileToS3(req.file.buffer, fileName, req.file.mimetype);
        photoUrl = fileName; // Save the S3 key in the database
      } catch (uploadError) {
        console.error('S3 Upload Error:', uploadError);
        res.status(500).json({ success: false, message: 'Failed to upload image' });
        return;
      }
    }

    // Update User if any user fields are provided
    if (email || phone || hashedPassword) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(email !== undefined && { email }),
          ...(phone !== undefined && { phone }),
          ...(hashedPassword !== undefined && { password: hashedPassword }),
        }
      });
    }

    // Upsert the profile (update if exists, create if not)
    const updatedProfile = await prisma.profile.upsert({
      where: { userId },
      update: {
        ...(name !== undefined && { name }),
        ...(bio !== undefined && { bio }),
        ...(username !== undefined && { username }),
        ...(location !== undefined && { location }),
        ...(photoUrl && { photoUrl }),
      },
      create: {
        userId,
        name,
        bio,
        username,
        location,
        photoUrl,
      },
    });

    // Return the updated profile with presigned URL
    let avatarUrl = updatedProfile.photoUrl;
    if (avatarUrl && !avatarUrl.startsWith('http')) {
      avatarUrl = await getPresignedUrl(avatarUrl, 3600);
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        ...updatedProfile,
        avatarUrl,
      },
    });
  } catch (error) {
    console.error('Error in updateProfile:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
