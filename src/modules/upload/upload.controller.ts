import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { getPresignedUrlForPut } from '../../services/s3.service';

export const getUploadPresignedUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fileName, fileType } = req.body;

    if (!fileName || !fileType) {
      res.status(400).json({ success: false, message: 'fileName and fileType are required' });
      return;
    }

    // Generate a unique file name
    const timestamp = Date.now();
    const uniqueFileName = `uploads/raw/${req.user?.userId}/${timestamp}-${fileName.replace(/\s+/g, '_')}`;

    // Get the presigned URL
    const uploadUrl = await getPresignedUrlForPut(uniqueFileName, fileType);

    res.status(200).json({
      success: true,
      data: {
        uploadUrl,
        key: uniqueFileName,
      },
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
