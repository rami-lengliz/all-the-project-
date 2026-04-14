import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { ListingAssistantService } from './listing-assistant.service';
import { AiSearchService } from './ai-search.service';
import { AiController } from './ai.controller';
import { ListingsModule } from '../listings/listings.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [ListingsModule, CategoriesModule],
  controllers: [AiController],
  providers: [AiService, ListingAssistantService, AiSearchService],
  exports: [AiService, ListingAssistantService, AiSearchService],
})
export class AiModule {}
