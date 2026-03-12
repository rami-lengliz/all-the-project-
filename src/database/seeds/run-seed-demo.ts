/**
 * Entry point for the demo seed.
 *
 * Run with:
 *   npm run seed:demo
 *
 * Or in production (Render/Railway "Run command"):
 *   npx ts-node src/database/seeds/run-seed-demo.ts
 *   -- or after build --
 *   node dist/database/seeds/run-seed-demo.js
 */

import { PrismaService } from '../prisma.service';
import { DemoSeedService } from './demo-seed.service';

async function runDemoSeed() {
  const prisma = new PrismaService();
  const demoSeed = new DemoSeedService(prisma);

  try {
    await prisma.$connect();
    console.log('\n🌱  RentAI — Demo Seed starting…\n');
    await demoSeed.seed();
    console.log('\n✅  Demo seed completed successfully!\n');
  } catch (error) {
    console.error('\n❌  Demo seed FAILED:\n', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runDemoSeed();
