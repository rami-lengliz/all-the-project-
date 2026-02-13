import { PrismaService } from '../prisma.service';

async function runSeed() {
  const prisma = new PrismaService();

  try {
    await prisma.$connect();
    console.log('🌱 Starting database seed...\n');

    // Call seed method directly
    await prisma.$transaction(async (tx) => {
      // Clear existing data
      console.log('Clearing existing data...');
      await tx.review.deleteMany({});
      await tx.paymentIntent.deleteMany({});
      await tx.booking.deleteMany({});
      await tx.adminLog.deleteMany({});
      await tx.listing.deleteMany({});
      await tx.category.deleteMany({});
      await tx.user.deleteMany({});

      // Import and run seed service logic here
      // For now, just log success
      console.log('Database cleared successfully');
    });

    console.log('\n✅ Seed completed successfully!');
    console.log('Note: Full seed data implementation pending - use SeedService for complete seeding');
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSeed();
