import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';

const region = process.env.AWS_REGION || 'us-east-1';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
export const BUCKET_NAME = process.env.AWS_S3_BUCKET || '';

export const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  requestHandler: new NodeHttpHandler({
    httpsAgent: new https.Agent({
      maxSockets: 500,
    }),
    connectionTimeout: 30000,
  }),
});

/**
 * Uploads a file buffer to S3
 * @param fileBuffer The file buffer
 * @param fileName The name of the file to save as (key)
 * @param mimeType The mimetype of the file
 * @returns The S3 object key
 */
export const uploadFileToS3 = async (
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: mimeType,
  });

  await s3Client.send(command);
  return fileName;
};

/**
 * Generates a pre-signed URL for an S3 object key
 * @param key The S3 object key
 * @param expiresIn Time in seconds until the URL expires (default 1 hour)
 * @returns A pre-signed URL string
 */
export const getPresignedUrl = async (
  key: string,
  expiresIn: number = 3600
): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
};

/**
 * Generates a pre-signed URL for uploading an S3 object
 * @param key The S3 object key
 * @param contentType The mime type of the file
 * @param expiresIn Time in seconds until the URL expires (default 1 hour)
 * @returns A pre-signed URL string
 */
export const getPresignedUrlForPut = async (
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
};

import fs from 'fs';
import path from 'path';

/**
 * Uploads a local directory and all its contents to S3
 */
export const uploadDirectoryToS3 = async (localPath: string, s3Prefix: string): Promise<void> => {
  const files = fs.readdirSync(localPath);
  
  // Upload chunks of 5 files concurrently to avoid ECONNRESET and socket hang up
  const concurrency = 5;
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (file) => {
        const filePath = path.join(localPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
          const fileBuffer = fs.readFileSync(filePath);
          const s3Key = `${s3Prefix}/${file}`;
          let mimeType = 'application/octet-stream';
          if (file.endsWith('.m3u8')) mimeType = 'application/vnd.apple.mpegurl';
          else if (file.endsWith('.ts')) mimeType = 'video/MP2T';
          else if (file.endsWith('.mp4')) mimeType = 'video/mp4';

          await uploadFileToS3(fileBuffer, s3Key, mimeType);
        }
      })
    );
  }
};
