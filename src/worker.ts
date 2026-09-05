import { Worker, Job } from 'bullmq';
import { prisma } from './lib/prisma';
import { generateHLS, generateThumbnail } from './utils/ffmpeg.util';
import { uploadDirectoryToS3, getPresignedUrl } from './services/s3.service';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from './services/s3.service';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

console.log('🚀 Starting Dedicated Video Worker...');

const videoWorker = new Worker('video-process', async (job: Job) => {
  const { newsId, authorId, videoKey, localVideoPath } = job.data;
  console.log(`[WORKER] Picked up job ${job.id} for News ID: ${newsId}`);

  let inputVideoPath = localVideoPath;

  try {
    // 1. Download from S3 if videoKey is provided
    if (videoKey) {
      inputVideoPath = path.join(__dirname, '../../public/uploads', `raw_${newsId}.mp4`);
      console.log(`[WORKER] Downloading raw video from S3: ${videoKey} to ${inputVideoPath}`);
      
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: videoKey,
      });
      const response = await s3Client.send(command);
      
      if (response.Body) {
        await pipeline(response.Body as any, fs.createWriteStream(inputVideoPath));
      } else {
        throw new Error('S3 response body is empty');
      }
    }

    if (!inputVideoPath || !fs.existsSync(inputVideoPath)) {
      throw new Error('Input video file not found');
    }

    const outputDir = path.join(__dirname, '../../public/uploads', `hls_${newsId}`);
    
    // 2. Generate HLS files
    console.log(`[WORKER] Generating HLS for News ID: ${newsId}...`);
    await generateHLS(inputVideoPath, outputDir);

    // 2.5 Generate Thumbnail
    console.log(`[WORKER] Generating Thumbnail for News ID: ${newsId}...`);
    await generateThumbnail(inputVideoPath, outputDir, 'thumbnail.jpg');

    // 3. Upload the HLS directory to S3
    console.log(`[WORKER] Uploading HLS to S3 for News ID: ${newsId}...`);
    const s3Prefix = `videos/hls_${newsId}`;
    await uploadDirectoryToS3(outputDir, s3Prefix);

    const masterPlaylistUrl = `${s3Prefix}/master.m3u8`;
    const thumbnailUrl = `${s3Prefix}/thumbnail.jpg`;

    // 4. Update the database
    await prisma.news.update({
      where: { id: newsId },
      data: { 
        status: 'PENDING',
        videoUrl: masterPlaylistUrl,
        thumbnailUrl: thumbnailUrl
      }
    });

    console.log(`[WORKER] Finished processing video for News ID: ${newsId}.`);

    // 5. Notify the author
    await prisma.notification.create({
      data: {
        userId: authorId,
        title: 'Video Processing Complete',
        message: 'Your video has been successfully processed and is now pending admin approval.'
      }
    });
    
    // 6. Cleanup local files
    try {
      if (fs.existsSync(inputVideoPath)) fs.unlinkSync(inputVideoPath);
      if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error(`[WORKER] Cleanup error for News ID: ${newsId}`, cleanupError);
    }
    
  } catch (error) {
    console.error(`[WORKER] Error processing video for News ID: ${newsId}`, error);
    try {
      await prisma.news.updateMany({
        where: { id: newsId },
        data: { status: 'REJECTED' }
      });
    } catch (dbError) {
      console.error(`[WORKER] Failed to mark News ${newsId} as REJECTED`, dbError);
    }

    try {
      if (inputVideoPath && fs.existsSync(inputVideoPath)) fs.unlinkSync(inputVideoPath);
    } catch (e) {}

    throw error;
  }
}, { connection, concurrency: 2 }); // Allow 2 concurrent FFmpeg encodings

videoWorker.on('completed', job => {
  console.log(`[WORKER] Job ${job.id} completed!`);
});

videoWorker.on('failed', (job, err) => {
  console.error(`[WORKER] Job ${job?.id} failed with error:`, err);
});
