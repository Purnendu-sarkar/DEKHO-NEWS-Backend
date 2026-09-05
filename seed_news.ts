import { NewsType } from './src/generated/prisma';
import { prisma } from './src/lib/prisma';

async function main() {
  console.log('Starting seed...');

  // 1. Get or create a Category
  let category = await prisma.category.findFirst({ where: { name: 'Technology' } });
  if (!category) {
    category = await prisma.category.create({
      data: { name: 'Technology', isActive: true }
    });
  }

  // 2. Get or create a User (Author)
  let user = await prisma.user.findFirst({ where: { email: 'admin@dekhonews.com' } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'admin@dekhonews.com',
        role: 'SUPER_ADMIN',
        profile: {
          create: {
            name: 'Dekho Admin',
            bio: 'Admin Account'
          }
        }
      }
    });
  }

  const types: NewsType[] = ['VIDEO', 'SHORT', 'PHOTO', 'READ'];

  for (const type of types) {
    console.log(`Seeding 10 items for type: ${type}`);
    for (let i = 1; i <= 10; i++) {
      await prisma.news.create({
        data: {
          title: `Dummy ${type} News ${i}`,
          description: `This is a randomly generated description for ${type} news #${i}. It contains some text to make it look like real content.`,
          type: type,
          status: 'APPROVED',
          viewCount: Math.floor(Math.random() * 1000),
          likeCount: Math.floor(Math.random() * 100),
          shareCount: Math.floor(Math.random() * 50),
          thumbnailUrl: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?q=80&w=2069&auto=format&fit=crop',
          videoUrl: type === 'VIDEO' || type === 'SHORT' ? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' : null,
          photoUrl: type === 'PHOTO' ? 'https://images.unsplash.com/photo-1495020689067-958852a7765e?q=80&w=2069&auto=format&fit=crop' : null,
          authorId: user.id,
          categoryId: category.id,
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 10000000000))
        }
      });
    }
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
