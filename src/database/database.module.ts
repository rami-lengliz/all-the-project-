import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';
import { Category } from '../entities/category.entity';
import { Listing } from '../entities/listing.entity';
import { Booking } from '../entities/booking.entity';
import { Review } from '../entities/review.entity';
import { AdminLog } from '../entities/admin-log.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.name'),
        entities: [User, Category, Listing, Booking, Review, AdminLog],
        synchronize: configService.get<string>('nodeEnv') === 'development',
        logging: configService.get<string>('nodeEnv') === 'development',
        extra: {
          // Enable PostGIS extension
          options: '-c search_path=public',
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
