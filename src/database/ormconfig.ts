import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { User } from '../entities/user.entity';
import { Category } from '../entities/category.entity';
import { Listing } from '../entities/listing.entity';
import { Booking } from '../entities/booking.entity';
import { Review } from '../entities/review.entity';
import { AdminLog } from '../entities/admin-log.entity';

config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'rental_platform',
  entities: [User, Category, Listing, Booking, Review, AdminLog],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
});

