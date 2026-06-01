import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { ListingAssistantService } from './listing-assistant.service';
import { AiSearchService } from './ai-search.service';
import { PriceSuggestionService } from './price-suggestion.service';
import { EmbeddingService } from './embedding.service';
import { ImageClassifierService } from './image-classifier.service';
import { AiController } from './ai.controller';
import { ListingsModule } from '../listings/listings.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [forwardRef(() => ListingsModule), CategoriesModule],
  controllers: [AiController],
  providers: [AiService, ListingAssistantService, AiSearchService, PriceSuggestionService, EmbeddingService, ImageClassifierService],
  exports: [AiService, ListingAssistantService, AiSearchService, PriceSuggestionService, EmbeddingService, ImageClassifierService],
})
export class AiModule {}
