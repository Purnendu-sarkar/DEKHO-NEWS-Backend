const { PrismaClient } = require('./src/generated/prisma');
const prisma = new PrismaClient();
prisma.profile.findFirst({ orderBy: { updatedAt: 'desc' } }).then(console.log).catch(console.error).finally(() => prisma.$disconnect());
