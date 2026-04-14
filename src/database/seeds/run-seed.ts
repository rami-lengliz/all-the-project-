import { PrismaService } from '../prisma.service';
import { SeedService } from './seed.service';

async function runSeed() {
  const prisma = new PrismaService();
  const seedService = new SeedService(prisma);

  try {
    await prisma.$connect();
    console.log('🌱 Starting database seed...\n');

    // Run the full seed
    await seedService.seed();

    console.log('\n✅ Seed completed successfully!');
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSeed();
