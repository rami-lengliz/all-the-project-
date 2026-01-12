import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { DataSource } from 'typeorm';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let userId: string;
  let listingId: string;
  let bookingId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get<DataSource>(DataSource);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    it('/health (GET) should return health status', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status');
          expect(res.body).toHaveProperty('services');
        });
    });
  });

  describe('Auth Flow', () => {
    it('POST /api/auth/register should register a new user', () => {
      return request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('user');
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
          accessToken = res.body.accessToken;
          userId = res.body.user.id;
        });
    });

    it('POST /api/auth/login should login user', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          emailOrPhone: 'test@example.com',
          password: 'password123',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          accessToken = res.body.accessToken;
        });
    });
  });

  describe('Listings Flow', () => {
    it('POST /api/listings should create listing with ML suggestions', async () => {
      // First, make user a host
      await request(app.getHttpServer())
        .post('/api/users/me/become-host')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ acceptTerms: true });

      // Get a category
      const categoriesRes = await request(app.getHttpServer())
        .get('/api/categories')
        .expect(200);

      const accommodationCategory = categoriesRes.body.find(
        (cat: any) => cat.slug === 'accommodation',
      );

      const response = await request(app.getHttpServer())
        .post('/api/listings')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('title', 'Test Beach Villa')
        .field('description', 'Beautiful villa with beach access')
        .field('categoryId', accommodationCategory.id)
        .field('pricePerDay', 150)
        .field('latitude', 36.8578)
        .field('longitude', 11.0920)
        .field('address', 'Test Address, Kelibia')
        .expect(201);

      expect(response.body).toHaveProperty('listing');
      expect(response.body).toHaveProperty('mlSuggestions');
      expect(response.body.mlSuggestions).toHaveProperty('category');
      expect(response.body.mlSuggestions).toHaveProperty('price');
      listingId = response.body.listing.id;
    });

    it('GET /api/listings should return listings', () => {
      return request(app.getHttpServer())
        .get('/api/listings')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('GET /api/listings?lat=36.8578&lng=11.0920&radiusKm=5 should return nearby listings', () => {
      return request(app.getHttpServer())
        .get('/api/listings')
        .query({ lat: 36.8578, lng: 11.0920, radiusKm: 5 })
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
        });
    });
  });

  describe('Booking Flow', () => {
    it('POST /api/bookings should create booking', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 7);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 3);

      const response = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          listingId,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('totalPrice');
      expect(response.body).toHaveProperty('commission');
      bookingId = response.body.id;
    });

    it('POST /api/bookings should prevent overlapping bookings', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 7);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 3);

      // Try to create overlapping booking
      await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          listingId,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        })
        .expect(400);
    });

    it('POST /api/bookings/:id/pay should mark booking as paid', () => {
      return request(app.getHttpServer())
        .post(`/api/bookings/${bookingId}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          paymentToken: 'test-token-123',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.paid).toBe(true);
        });
    });
  });
});

