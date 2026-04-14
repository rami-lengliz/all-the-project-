import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { ChatbotMemoryService } from './chatbot-memory.service';
import { ChatbotOrchestratorService } from './chatbot-orchestrator.service';
import { ToolRegistryService } from './tools/tool-registry.service';
import { ToolPolicyService } from './tools/tool-policy.service';
import { ToolGovernanceService } from './tools/tool-governance.service';
import { OpenAiChatAdapter } from './llm/openai-chat.adapter';
import { LLM_ADAPTER } from './llm/llm-adapter.interface';
import { LlmResilienceService } from './llm/llm-resilience.service';
import { ChatbotTraceService } from './observability/chatbot-trace.service';
import { ChatbotContextService } from './context/chatbot-context.service';
import { ChatbotSummaryService } from './context/chatbot-summary.service';
import { ChatbotToolPermissionService } from './tools/permissions/chatbot-tool-permission.service';
import { ChatbotToolResourceResolverService } from './tools/permissions/chatbot-tool-resource-resolver.service';
import { ChatbotActionConfirmationService } from './actions/chatbot-action-confirmation.service';
import { ChatbotMutationPolicyService } from './actions/chatbot-mutation-policy.service';
import { ChatbotRateLimitService } from './trust/chatbot-rate-limit.service';
import { ChatbotTrustScoreService } from './trust/chatbot-trust-score.service';
import { ChatbotAbuseDetectionService } from './trust/chatbot-abuse-detection.service';
import { ChatbotTrustPolicyService } from './trust/chatbot-trust-policy.service';
import { ListingsModule } from '../modules/listings/listings.module';
import { CategoriesModule } from '../modules/categories/categories.module';
import { BookingsModule } from '../modules/bookings/bookings.module';

@Module({
  imports: [
    ConfigModule,
    ListingsModule,
    CategoriesModule,
    BookingsModule
  ],
  controllers: [ChatbotController],
  providers: [
    ChatbotService,
    ChatbotMemoryService,
    ChatbotOrchestratorService,
    ToolRegistryService,
    ToolPolicyService,
    ToolGovernanceService,
    ChatbotToolResourceResolverService,
    ChatbotToolPermissionService,
    LlmResilienceService,
    ChatbotTraceService,
    ChatbotContextService,
    ChatbotSummaryService,
    ChatbotActionConfirmationService,
    ChatbotMutationPolicyService,
    ChatbotRateLimitService,
    ChatbotTrustScoreService,
    ChatbotAbuseDetectionService,
    ChatbotTrustPolicyService,
    {
      provide: LLM_ADAPTER,
      useClass: OpenAiChatAdapter,
    }
  ],
  exports: [ChatbotService]
})
export class ChatbotModule {}
