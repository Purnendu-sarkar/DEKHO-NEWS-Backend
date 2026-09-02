import { prisma } from './src/lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const email = 'admin@dekhonews.com';
  const phone = '+8801999999999';
  const password = 'Password123!';
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      role: 'SUPER_ADMIN',
    },
    create: {
      email,
      phone,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      profile: {
        create: {
          name: 'Super Admin',
        }
      }
    }
  });

  console.log('--- Super Admin Created/Updated ---');
  console.log(`Email: ${admin.email}`);
  console.log(`Phone: ${admin.phone}`);
  console.log(`Password: ${password}`);
  console.log('-----------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
