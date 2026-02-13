import { Module } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { ListingsController } from './listings.controller';
import { CategoriesModule } from '../categories/categories.module';
import { MlModule } from '../ml/ml.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    CategoriesModule,
    MlModule,
    UsersModule,
  ],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule { }
