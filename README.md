# RentEverything Backend

Production-grade backend for **RentEverything** - a local travel & vacation rental platform. Built with NestJS, PostgreSQL + PostGIS, TypeORM, and Docker.

## 🎯 Product Focus

**Travel & Vacation Rentals Only:**
- ✅ Accommodation
- ✅ Mobility (scooters, cars, bikes)
- ✅ Water & Beach Activities (kayaks, paddle boards, snorkeling)

**Not Included:**
- ❌ Tools
- ❌ Public Facilities
- ❌ Stadiums & Courts

## 🏗️ Architecture

### Tech Stack

- **Language**: TypeScript
- **Framework**: NestJS (latest stable)
- **ORM**: TypeORM
- **Database**: PostgreSQL 15 with PostGIS extension
- **Authentication**: JWT (access + refresh tokens)
- **Validation**: class-validator / class-transformer
- **Testing**: Jest (unit) + Supertest (integration)
- **API Docs**: OpenAPI/Swagger (auto-generated)
- **Containerization**: Docker + Docker Compose
- **ML Service**: Python FastAPI (deterministic mock responses)
- **Rate Limiting**: NestJS Throttler

### Project Structure

```
.
├── src/
│   ├── config/              # Configuration module
│   ├── common/              # Shared utilities
│   │   ├── guards/         # Auth & role guards
│   │   ├── interceptors/   # Response transformers
│   │   ├── filters/        # Exception filters
│   │   ├── decorators/     # Custom decorators
│   │   └── utils/          # Utility functions (availability)
│   ├── database/
│   │   ├── migrations/     # TypeORM migrations
│   │   └── seeds/          # Seed scripts
│   ├── entities/           # TypeORM entities
│   ├── modules/            # Feature modules
│   │   ├── auth/          # Authentication (JWT + refresh)
│   │   ├── users/         # User management
│   │   ├── categories/    # Category management
│   │   ├── listings/      # Listing CRUD & geo-search
│   │   ├── bookings/      # Booking management
│   │   ├── reviews/       # Review system
│   │   ├── admin/         # Admin operations
│   │   └── ml/            # ML service wrapper
│   └── main.ts            # Application entry point
├── ml-service/            # FastAPI ML service
├── tests/                 # Unit & integration tests
├── docker-compose.yml     # Docker Compose configuration
├── Dockerfile            # Backend Dockerfile
└── package.json          # Dependencies
```

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ (for local development without Docker)

### Running with Docker (Recommended)

1. **Clone and navigate to the project**:
   ```bash
   cd renteverything-backend
   ```

2. **Create environment file**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` if needed (defaults work for Docker)

3. **Start all services**:
   ```bash
   docker-compose up --build
   ```

   This starts:
   - PostgreSQL with PostGIS (port 5432)
   - NestJS backend (port 3000)
   - FastAPI ML service (port 8000)
   - Adminer (database admin UI, port 8080)

4. **Initialize database and seed data**:
   ```bash
   # Wait for services to be ready (~15 seconds)
   docker-compose exec backend npm run seed
   ```

5. **Access the API**:
   - Backend API: http://localhost:3000/api
   - Swagger Docs: http://localhost:3000/api/docs
   - Health Check: http://localhost:3000/api/health
   - ML Service: http://localhost:8000/health
   - Adminer: http://localhost:8080

### Local Development (without Docker)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up PostgreSQL with PostGIS**:
   - Install PostgreSQL 15+ with PostGIS extension
   - Create database: `rental_platform`
   - Enable PostGIS: `CREATE EXTENSION postgis;`

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Update .env with your database credentials
   ```

4. **Run migrations**:
   ```bash
   npm run migration:run
   ```

5. **Seed the database**:
   ```bash
   npm run seed
   ```

6. **Start development server**:
   ```bash
   npm run start:dev
   ```

## 📚 API Documentation

### Swagger/OpenAPI

Interactive API documentation is available at:
- **http://localhost:3000/api/docs**

### Importing to Postman/Insomnia

1. **From Swagger UI**:
   - Navigate to http://localhost:3000/api/docs
   - Click "Download" button to get OpenAPI JSON/YAML
   - Import into Postman or Insomnia

2. **Generate OpenAPI spec**:
   ```bash
   # The spec is auto-generated when the app runs
   # Access it at: http://localhost:3000/api/docs-json
   ```

### Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <access-token>
```

### Key Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login (returns access + refresh tokens)
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/verify` - Verify email/phone (stub)

#### Users
- `GET /api/users/me` - Get current user profile
- `PATCH /api/users/me` - Update profile
- `POST /api/users/me/become-host` - Become a host
- `GET /api/users/:id` - Get public user profile

#### Categories
- `GET /api/categories` - List all categories
- `GET /api/categories/:id` - Get category details
- `POST /api/categories` - Create category (admin only)

#### Listings
- `GET /api/listings` - Search listings (supports geo-search, filters)
  - Query params: `q`, `category`, `lat`, `lng`, `radiusKm` (max 50km), `minPrice`, `maxPrice`, `availableFrom`, `availableTo`, `page`, `limit` (max 100), `sortBy`
- `GET /api/listings/:id` - Get listing details
- `POST /api/listings` - Create listing (host only, multipart/form-data with images)
  - Returns ML suggestions in response
- `PATCH /api/listings/:id` - Update listing (host/admin)
- `DELETE /api/listings/:id` - Soft delete listing (host), hard delete (admin)

#### Bookings
- `POST /api/bookings` - Create booking (checks availability, calculates commission)
- `GET /api/bookings/me` - Get user's bookings
- `GET /api/bookings/:id` - Get booking details
- `PATCH /api/bookings/:id/confirm` - Confirm booking (host only)
- `POST /api/bookings/:id/pay` - Simulate payment
- `PATCH /api/bookings/:id/cancel` - Cancel booking

#### Reviews
- `POST /api/reviews` - Create review (renter only, for completed bookings)
- `GET /api/reviews/user/:userId` - Get reviews for a user

#### Admin
- `GET /api/admin/users` - Get all users (admin only)
- `GET /api/admin/listings` - Get all listings (admin only)
- `POST /api/admin/flag` - Flag listing for review (admin only)
- `GET /api/admin/logs` - Get admin action logs (admin only)

## 🔐 Security Features

- **JWT Authentication**: Access tokens (15min) + refresh tokens (7 days)
- **Password Hashing**: Bcrypt with salt rounds
- **DTO Validation**: Class-validator for all inputs
- **Guards**: JWT auth guard, roles guard, host guard
- **Rate Limiting**: 
  - Auth endpoints: 5 requests/minute
  - Booking creation: 10 requests/minute
  - Default: 10 requests/minute
- **Global Exception Filter**: Consistent error responses
- **CORS**: Enabled for cross-origin requests
- **Row-level Locking**: Prevents double booking in concurrent scenarios
- **Soft Delete**: Listings are soft-deleted (isActive=false, deletedAt set)

## 💰 Pricing & Payments

- All prices are in **TND** (Tunisian Dinar)
- Commission: 10% default (configurable via `COMMISSION_PERCENTAGE`)
- Payments are **simulated** for MVP
- Payment endpoint accepts `paymentToken` or `receipt` (file URL/base64)

## 🌍 Location-Based Search

The platform uses PostGIS for geospatial queries:

- **Distance Search**: Find listings within X km of a point (max 50km)
- **Sort by Distance**: When location provided, can sort by distance
- **Example**:
  ```
  GET /api/listings?lat=36.8578&lng=11.0920&radiusKm=10&sortBy=distance
  ```

## 🤖 ML Service

The ML service provides deterministic suggestions:

### Category Suggestion
- Keywords: "paddle", "kayak", "beach", "water" → Water & Beach Activities
- Keywords: "scooter", "motor", "car", "bike" → Mobility
- Default → Accommodation

### Price Suggestion
- Base prices: Accommodation 150 TND, Mobility 60 TND, Water & Beach Activities 30 TND
- Within 5km of Kelibia center: +20% premium

### Switching to Real ML

To replace the mock ML service with a real implementation:

1. Update `ml-service/main.py` with your ML model
2. Replace deterministic logic with model inference
3. Update environment variables if needed
4. Rebuild: `docker-compose build ml-service`

## 📝 Seed Data

The seed script creates:
- **5 categories**: Accommodation, Mobility, Water & Beach Activities (allowed), plus 2 placeholders (not allowed)
- **10 users**: 5 hosts, 5 renters (1 admin user)
- **20 listings**: Around Kelibia, Tunisia (36.8578, 11.0920)
- **10 bookings**: Various statuses (pending, confirmed, completed)
- **8 reviews**: For completed bookings

**Default credentials**:
- Email: `user1@example.com` to `user10@example.com`
- Password: `password123`
- Admin: `user1@example.com` (has admin role)

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:cov

# Run in watch mode
npm run test:watch

# Run e2e tests
npm run test:e2e
```

### Test Coverage

- Unit tests for services (auth, listings, bookings, availability util)
- Integration tests covering:
  - Register/login flow
  - Create listing (with ML stub called)
  - Search by geo & category
  - Create booking + prevent overlapping booking
  - Simulate payment endpoint

## 📦 Docker Services

### Backend Service
- **Image**: Built from Dockerfile
- **Port**: 3000
- **Volumes**: Code mounted for hot-reload, uploads directory

### PostgreSQL Service
- **Image**: `postgis/postgis:15-3.3`
- **Port**: 5432
- **Database**: `rental_platform`
- **Extensions**: PostGIS enabled automatically

### ML Service
- **Image**: Built from `ml-service/Dockerfile`
- **Port**: 8000
- **Framework**: FastAPI
- **Status**: Deterministic mock implementation (ready for ML model integration)

### Adminer (Optional)
- **Image**: `adminer:latest`
- **Port**: 8080
- **Purpose**: Database administration UI

## 🔧 Environment Variables

See `.env.example` for all required variables:

- `NODE_ENV` - Environment (development/production)
- `PORT` - Application port
- `DATABASE_*` - PostgreSQL connection
- `JWT_SECRET` - JWT signing secret
- `REFRESH_TOKEN_SECRET` - Refresh token secret
- `ML_SERVICE_URL` - ML service endpoint
- `UPLOAD_DIR` - File upload directory
- `COMMISSION_PERCENTAGE` - Commission rate (default 0.10)
- `THROTTLE_TTL` - Rate limit window in seconds (default 60)
- `THROTTLE_LIMIT` - Requests per window (default 10)
- `THROTTLE_AUTH_LIMIT` - Auth endpoints limit (default 5)
- `THROTTLE_BOOKING_LIMIT` - Booking endpoints limit (default 10)

## 📋 Available Scripts

- `npm run start` - Start production server
- `npm run start:dev` - Start development server with hot-reload
- `npm run build` - Build for production
- `npm run seed` - Run database seed script
- `npm run migration:generate` - Generate new migration
- `npm run migration:run` - Run pending migrations
- `npm run migration:revert` - Revert last migration
- `npm test` - Run tests
- `npm run test:cov` - Run tests with coverage
- `npm run lint` - Run ESLint

## ✅ Acceptance Criteria

All criteria must pass:

- [x] `docker-compose up --build` brings up all services
- [x] `docker-compose exec backend npm run seed` inserts Kelibia seed data
- [x] `GET /api/listings` returns seeded listings
- [x] Creating a listing (`POST /api/listings`) returns ML suggestions
- [x] Geo-search `/api/listings?lat=36.8578&lng=11.0920&radiusKm=5` returns nearby listings
- [x] Booking creation prevents overlapping bookings (tested via integration tests)
- [x] `POST /api/bookings/{id}/pay` marks `paid=true`
- [x] Swagger UI available at `/api/docs`
- [x] Unit and integration tests pass via `npm test`
- [x] Health endpoint returns DB and ML service status
- [x] Rate limiting applied to auth and booking endpoints
- [x] Soft delete implemented for listings
- [x] Only travel/vacation categories allowed (Accommodation, Mobility, Water & Beach Activities)

## 🚧 Production Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` and `REFRESH_TOKEN_SECRET`
- [ ] Set `NODE_ENV=production`
- [ ] Configure proper CORS origins
- [ ] Set up database backups
- [ ] Configure S3-compatible storage for file uploads
- [ ] Tune rate limiting based on traffic
- [ ] Set up monitoring and logging (Sentry placeholder included)
- [ ] Implement actual payment gateway
- [ ] Add email verification system
- [ ] Implement KYC for host verification
- [ ] Add comprehensive error tracking

## 📄 License

This project is for educational/demonstration purposes.

## 🤝 Contributing

This is a production-ready template. Feel free to extend it based on your needs.

---

**Built with ❤️ for RentEverything - Travel & Vacation Rentals**
