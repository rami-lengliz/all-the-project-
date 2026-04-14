import { Injectable, Logger } from '@nestjs/common';
import { ChatbotTrustScoreService } from './chatbot-trust-score.service';

@Injectable()
export class ChatbotTrustPolicyService {
  private readonly logger = new Logger(ChatbotTrustPolicyService.name);

  constructor(
     private scoreService: ChatbotTrustScoreService
  ) {}

  public async evaluateAction(
     userId: string, 
     actionType: 'message_request' | 'read_tool' | 'mutation_proposal' | 'confirmation_execution',
     toolName?: string
  ): Promise<{ allowed: boolean; reasonCode?: string; blockReason?: string; tier: string }> {
     
     const trust = await this.scoreService.evaluateUserTrust(userId);

     // RESTRICTED completely blocks mutations but allows general chat and reading
     if (trust.tier === 'RESTRICTED') {
        if (actionType === 'mutation_proposal' || actionType === 'confirmation_execution') {
           this.logger.warn(`Blocked ${actionType} for restricted user ${userId}`);
           return { allowed: false, reasonCode: 'trust_restricted', blockReason: 'Account restricted. Cannot execute mutations at this time.', tier: trust.tier };
        }
     }

     // SUSPICIOUS allows standard low-risk mutations but blocks sensitive financial paths until cleared
     if (trust.tier === 'SUSPICIOUS') {
        if (actionType === 'confirmation_execution' && toolName === 'cancel_my_booking_if_allowed') {
           this.logger.warn(`Blocked sensitive mutated action ${toolName} for suspicious user ${userId}`);
           return { allowed: false, reasonCode: 'suspicious_activity', blockReason: 'Sensitive mutation requiring manual review due to suspicious activity.', tier: trust.tier };
        }
     }

     return { allowed: true, tier: trust.tier };
  }
}
