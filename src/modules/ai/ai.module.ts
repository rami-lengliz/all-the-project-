import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { ListingAssistantService } from './listing-assistant.service';
import { AiController } from './ai.controller';

@Module({
    controllers: [AiController],
    providers: [AiService, ListingAssistantService],
    exports: [AiService, ListingAssistantService],
})
export class AiModule { }
