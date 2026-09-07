import { prisma } from './src/lib/prisma';

const videos = [
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
];

const shorts = [
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://media.w3.org/2010/05/sintel/trailer.mp4',
  'https://media.w3.org/2010/05/video/movie_300.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/tears-of-steel/mp4/h264/720/Tears_of_Steel_720_10s_1MB.mp4',
  'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
];

async function main() {
  console.log('Starting real seed...');

  const phone = '+919876543210';

  // Create User
  let user = await prisma.user.findFirst({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        email: 'rahul.sharma@example.com',
        role: 'USER',
        profile: {
          create: {
            name: 'Rahul Sharma',
            bio: 'Avid content creator and news enthusiast from New Delhi.'
          }
        }
      }
    });
    console.log(`User created with phone: ${phone}`);
  } else {
    console.log(`User already exists with phone: ${phone}`);
  }

  // Get a category
  let category = await prisma.category.findFirst({ where: { name: 'Technology' } });
  if (!category) {
    category = await prisma.category.create({ data: { name: 'Technology', isActive: true } });
  }

  // Generate 10 VIDEOs
  for (let i = 0; i < 10; i++) {
    await prisma.news.create({
      data: {
        title: `Exploring Tech Innovations ${i + 1}`,
        description: `An in-depth look at the latest technological advancements and how they impact our daily lives. Video part ${i + 1}.`,
        type: 'VIDEO',
        status: 'APPROVED',
        thumbnailUrl: `https://picsum.photos/seed/video${i}/800/450`,
        videoUrl: videos[i],
        authorId: user.id,
        categoryId: category.id,
        viewCount: Math.floor(Math.random() * 5000),
      }
    });
  }

  // Generate 10 SHORTs
  for (let i = 0; i < 10; i++) {
    await prisma.news.create({
      data: {
        title: `Quick Tech Tip #${i + 1}`,
        description: `Learn a quick tech tip in under 60 seconds! Watch this short to improve your productivity.`,
        type: 'SHORT',
        status: 'APPROVED',
        thumbnailUrl: `https://picsum.photos/seed/short${i}/400/800`,
        videoUrl: shorts[i],
        authorId: user.id,
        categoryId: category.id,
        viewCount: Math.floor(Math.random() * 8000),
      }
    });
  }

  // Generate 10 PHOTOs
  for (let i = 0; i < 10; i++) {
    await prisma.news.create({
      data: {
        title: `Stunning Tech Photography ${i + 1}`,
        description: `A beautiful capture of modern architecture and tech hubs around the world.`,
        type: 'PHOTO',
        status: 'APPROVED',
        thumbnailUrl: `https://picsum.photos/seed/photo_thumb${i}/800/600`,
        photoUrl: `https://picsum.photos/seed/photo_full${i}/1200/900`,
        authorId: user.id,
        categoryId: category.id,
        viewCount: Math.floor(Math.random() * 2000),
      }
    });
  }

  // Generate 10 READs (Text)
  const texts = [
    "Artificial Intelligence is transforming the way we work...",
    "Quantum computing promises to solve complex problems...",
    "The rise of electric vehicles is changing the automotive industry...",
    "Blockchain technology extends beyond cryptocurrencies...",
    "5G networks are enabling faster and more reliable connectivity...",
    "Augmented Reality is enhancing user experiences in retail...",
    "Cybersecurity is more critical than ever in the digital age...",
    "The Internet of Things connects everyday devices to the web...",
    "Cloud computing provides scalable resources for businesses...",
    "Machine learning algorithms are becoming increasingly sophisticated..."
  ];
  for (let i = 0; i < 10; i++) {
    await prisma.news.create({
      data: {
        title: `Tech Insight: ${texts[i].substring(0, 25)}...`,
        description: `<h1>${texts[i]}</h1><p>Here is a detailed article discussing the impact and future of this technology in the modern world. We explore various facets and industry perspectives.</p>`,
        type: 'READ',
        status: 'APPROVED',
        thumbnailUrl: `https://picsum.photos/seed/read${i}/800/400`,
        authorId: user.id,
        categoryId: category.id,
        viewCount: Math.floor(Math.random() * 1000),
      }
    });
  }

  console.log('Successfully seeded 40 items (10 of each type) for the user.');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
