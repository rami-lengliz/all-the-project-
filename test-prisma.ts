import { PrismaClient } from '@prisma/client';

async function testPrisma() {
    const prisma = new PrismaClient();

    try {
        console.log('Testing Prisma connection...');

        // Test connection
        await prisma.$connect();
        console.log('✓ Connected to database');

        // Test query
        const userCount = await prisma.user.count();
        console.log(`✓ Found ${userCount} users`);

        const categoryCount = await prisma.category.count();
        console.log(`✓ Found ${categoryCount} categories`);

        const listingCount = await prisma.listing.count();
        console.log(`✓ Found ${listingCount} listings`);

        console.log('\n✅ Prisma migration successful! All tables accessible.');

    } catch (error) {
        console.error('❌ Prisma test failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

testPrisma();
