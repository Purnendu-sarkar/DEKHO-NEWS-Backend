import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { fetchLatestYouTubeVideos } from './youtube.service';
import { fetchLatestFacebookPosts } from './facebook.service';
import { NewsType } from '../generated/prisma';

export const startCronJobs = () => {
  // Run every 10 minutes (for MVP simulation, normally every 1-3 hours)
  cron.schedule('*/10 * * * *', async () => {
    console.log('[CRON] Starting social media auto-import sync...');

    try {
      const accounts = await prisma.socialAccount.findMany();
      if (accounts.length === 0) {
        console.log('[CRON] No social accounts connected.');
        return;
      }

      // We need an admin user to assign as the author for auto-imported posts.
      // We will pick the first available ADMIN or SUPER_ADMIN.
      const admin = await prisma.user.findFirst({
        where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } }
      });

      if (!admin) {
        console.error('[CRON] No admin user found to assign imported posts to.');
        return;
      }

      // Also need a default category for imported news
      let defaultCategory = await prisma.category.findFirst({ where: { name: 'Auto-Imported' } });
      if (!defaultCategory) {
        defaultCategory = await prisma.category.create({ data: { name: 'Auto-Imported' } });
      }

      for (const account of accounts) {
        let importedItems: any[] = [];

        if (account.provider === 'YOUTUBE') {
          importedItems = await fetchLatestYouTubeVideos(account.accountId);
        } else if (account.provider === 'FACEBOOK') {
          importedItems = await fetchLatestFacebookPosts(account.accountId);
        }

        let newImportsCount = 0;
        
        for (const item of importedItems) {
          // Check if already imported
          const exists = await prisma.news.findUnique({ where: { externalId: item.id } });
          if (!exists) {
            await prisma.news.create({
              data: {
                title: item.title,
                description: item.description,
                type: item.type as NewsType,
                status: 'PENDING',
                externalId: item.id,
                source: account.provider,
                thumbnailUrl: item.thumbnailUrl,
                photoUrl: item.photoUrl,
                authorId: admin.id,
                categoryId: defaultCategory.id,
              }
            });
            newImportsCount++;
          }
        }

        if (newImportsCount > 0) {
          console.log(`[CRON] Imported ${newImportsCount} new items from ${account.provider} (${account.channelName}).`);
          
          // Notify the admin
          await prisma.notification.create({
            data: {
              userId: admin.id,
              title: 'New Social Media Import',
              message: `${newImportsCount} new items imported from ${account.channelName}. They are waiting in the Approval Queue.`
            }
          });
        }
      }
      
      console.log('[CRON] Sync complete.');
    } catch (error) {
      console.error('[CRON] Error during sync:', error);
    }
  });
};
