import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminLog } from '../../entities/admin-log.entity';
import { UsersModule } from '../users/users.module';
import { ListingsModule } from '../listings/listings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminLog]),
    UsersModule,
    ListingsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}

