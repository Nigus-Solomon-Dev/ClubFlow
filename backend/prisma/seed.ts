import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? '',
    }),
  });

  const passwordHash = await bcrypt.hash('Owner123!', 10);

  await prisma.user.upsert({
    where: { phone: '0990000000' },
    update: {
      name: 'Owner',
      role: 'OWNER',
      passwordHash,
    },
    create: {
      name: 'Owner',
      phone: '0990000000',
      passwordHash,
      role: 'OWNER',
    },
  });

  console.log('Seeded initial OWNER user: 0990000000');
  await prisma.$disconnect();
}

void main();