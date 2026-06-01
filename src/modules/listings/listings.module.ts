import { Module, forwardRef } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { ListingsController } from './listings.controller';
import { LastMinuteService } from './last-minute.service';
import { CategoriesModule } from '../categories/categories.module';
import { MlModule } from '../ml/ml.module';
import { UsersModule } from '../users/users.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [CategoriesModule, MlModule, UsersModule, forwardRef(() => AiModule)],
  controllers: [ListingsController],
  providers: [ListingsService, LastMinuteService],
  exports: [ListingsService],
})
export class ListingsModule {}
