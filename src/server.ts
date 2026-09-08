import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { prisma } from './lib/prisma';
import { startCronJobs } from './services/cron.service';

const port = process.env.PORT || 5000;

async function bootstrap() {
  try {
    // Test the Database Connection
    console.log('⏳ Connecting to Database...');
    await prisma.$connect();
    console.log('✅ Database connected successfully!');

    // Start the server
    app.listen(Number(port), '0.0.0.0', () => {
      console.log(`🚀 Server is running on port ${port}`);
      
      // Initialize Cron Jobs
      startCronJobs();
      
      // Seed Ad Plans if empty
      seedAdPlans();
    });
  } catch (error) {
    console.error('❌ Failed to connect to the database:', error);
    process.exit(1);
  }
}

async function seedAdPlans() {
  const count = await prisma.adPlan.count();
  if (count === 0) {
    console.log('Seeding default Ad Plans...');
    await prisma.adPlan.createMany({
      data: [
        { name: 'Basic Image Ad - 7 Days', price: 10.0, durationDays: 7, type: 'IMAGE' },
        { name: 'Premium Video Ad - 7 Days', price: 25.0, durationDays: 7, type: 'VIDEO' },
        { name: 'Basic Image Ad - 30 Days', price: 30.0, durationDays: 30, type: 'IMAGE' },
        { name: 'Premium Video Ad - 30 Days', price: 75.0, durationDays: 30, type: 'VIDEO' },
      ]
    });
    console.log('Ad Plans seeded!');
  }
}

bootstrap();
