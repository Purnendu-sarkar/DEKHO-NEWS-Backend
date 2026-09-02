import { prisma } from '../lib/prisma';
import { generateHLS } from '../utils/ffmpeg.util';
import { uploadDirectoryToS3 } from './s3.service';
import fs from 'fs';
import path from 'path';

export const processVideoUpload = async (newsId: string, authorId: string, localVideoPath: string) => {
  console.log(`[VIDEO PROCESSOR] Started processing video for News ID: ${newsId}`);
  
  try {
    const outputDir = path.join(__dirname, '../../../public/uploads', `hls_${newsId}`);
    
    // 1. Generate HLS files
    console.log(`[VIDEO PROCESSOR] Generating HLS for News ID: ${newsId}...`);
    await generateHLS(localVideoPath, outputDir);

    // 2. Upload the HLS directory to S3
    console.log(`[VIDEO PROCESSOR] Uploading HLS to S3 for News ID: ${newsId}...`);
    const s3Prefix = `videos/hls_${newsId}`;
    await uploadDirectoryToS3(outputDir, s3Prefix);

    const masterPlaylistUrl = `${s3Prefix}/master.m3u8`;

    // 3. Update the database
    await prisma.news.update({
      where: { id: newsId },
      data: { 
        status: 'PENDING',
        videoUrl: masterPlaylistUrl 
      }
    });

    console.log(`[VIDEO PROCESSOR] Finished processing video for News ID: ${newsId}.`);

    // 4. Notify the author
    await prisma.notification.create({
      data: {
        userId: authorId,
        title: 'Video Processing Complete',
        message: 'Your video has been successfully processed and is now pending admin approval.'
      }
    });
    
    // 5. Cleanup local files
    try {
      fs.unlinkSync(localVideoPath);
      fs.rmSync(outputDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error(`[VIDEO PROCESSOR] Cleanup error for News ID: ${newsId}`, cleanupError);
    }
    
  } catch (error) {
    console.error(`[VIDEO PROCESSOR] Error processing video for News ID: ${newsId}`, error);
    // Mark as rejected or error status if it fails
    await prisma.news.update({
      where: { id: newsId },
      data: { status: 'REJECTED' } // Or an ERROR status if one existed
    });
  }
};
