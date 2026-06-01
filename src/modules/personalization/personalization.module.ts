import { Module } from '@nestjs/common';
import { PersonalizationService } from './personalization.service';
import { PersonalizationController } from './personalization.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [PersonalizationController],
  providers: [PersonalizationService],
  exports: [PersonalizationService],
})
export class PersonalizationModule {}
