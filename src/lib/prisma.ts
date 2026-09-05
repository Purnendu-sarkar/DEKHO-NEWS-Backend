import { PrismaClient } from '../generated/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
let prisma: PrismaClient;

if (connectionString) {
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
} else {
  console.warn("WARNING: DATABASE_URL is not set. PrismaClient is not initialized correctly.");
  // Fallback for types
  prisma = new PrismaClient({ accelerateUrl: "prisma://fallback" } as any);
}

export { prisma };
export default prisma;
