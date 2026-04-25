import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as import_common from '@nestjs/common';
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('Listing Creation Validation (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let token: string;
    let categoryId: string;
    const categorySlug = 'orphan-test-category';

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(
            new import_common.ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );
        prisma = app.get<PrismaService>(PrismaService);
        await app.init();

        // Ensure we have a valid host to test with
        let host = await prisma.user.findUnique({ where: { email: 'orphan-test-host@example.com' } });

        if (!host) {
            // Create it
            await request(app.getHttpServer())
                .post('/api/auth/register')
                .send({
                    name: 'Orphan Host',
                    email: 'orphan-test-host@example.com',
                    phone: '+21699000000',
                    password: 'password123',
                });

            // Become host
            await prisma.user.update({
                where: { email: 'orphan-test-host@example.com' },
                data: { isHost: true }
            });
        }

        const loginRes = await request(app.getHttpServer())
            .post('/api/auth/login')
            .send({ emailOrPhone: 'orphan-test-host@example.com', password: 'password123' });

        const tokenObj = loginRes.body?.data || loginRes.body;
        token = tokenObj?.accessToken;

        if (!token) {
            console.error("Login failed! body:", loginRes.body);
            throw new Error("Login failed during setup");
        }

        const category = await prisma.category.upsert({
            where: { slug: categorySlug },
            update: {
                name: 'Orphan Test Category',
                allowedForPrivate: true,
            },
            create: {
                name: 'Orphan Test Category',
                slug: categorySlug,
                icon: 'home',
                allowedForPrivate: true,
            },
        });
        categoryId = category.id;
    });

    afterAll(async () => {
        // Clean up
        await prisma.listing.deleteMany({ where: { title: 'Test Orphan Prevention' } });
        await prisma.user.delete({ where: { email: 'orphan-test-host@example.com' } });
        await prisma.category.deleteMany({ where: { slug: categorySlug } });
        await app.close();
    });

    it('should reject listing creation and prevent orphan insert when images are missing', async () => {
        // Count exact listings before the test
        const countBefore = await prisma.listing.count();

        const response = await request(app.getHttpServer())
            .post('/api/listings')
            .set('Authorization', `Bearer ${token}`)
            // Missing images intentionally
            .field('title', 'Test Orphan Prevention')
            .field('description', 'This listing should not be saved.')
            .field('categoryId', categoryId)
            .field('pricePerDay', '50.0')
            .field('latitude', '36.8')
            .field('longitude', '11.1')
            .field('address', 'Tunis');

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('At least one image is required');

        const countAfter = await prisma.listing.count();
        expect(countAfter).toBe(countBefore); // Proves no orphan inserted!
    });
});
