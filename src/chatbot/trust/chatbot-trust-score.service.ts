import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ChatbotTrustTier, ChatbotTrustStatus } from './chatbot-trust.types';

@Injectable()
export class ChatbotTrustScoreService {
  private readonly logger = new Logger(ChatbotTrustScoreService.name);

  constructor(private prisma: PrismaService) {}

  public async evaluateUserTrust(userId: string): Promise<ChatbotTrustStatus> {
    const status: ChatbotTrustStatus = {
      tier: 'NORMAL',
      reasons: [],
      suggestedRestrictions: []
    };

    // Gather user state from DB
    const recentEvents = await this.prisma.chatbotSecurityEvent.findMany({
      where: {
        userId,
        createdAt: {
          gt: new Date(Date.now() - 24 * 60 * 60 * 1000) // last 24h
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    let failedConfirmations = 0;
    let unauthorizedTools = 0;
    let highSeverityEvents = 0;
    let replays = 0;

    for (const event of recentEvents) {
      if (event.eventType === 'excessive_failed_confirmations') failedConfirmations++;
      if (event.eventType === 'excessive_unauthorized_tools') unauthorizedTools++;
      if (event.eventType === 'confirmation_replay') replays++;
      if (event.severity === 'high' || event.severity === 'critical') highSeverityEvents++;
    }

    // Determine Tier based on deterministic logic
    if (highSeverityEvents >= 2 || replays >= 3) {
      status.tier = 'RESTRICTED';
      status.reasons.push('Multiple high severity security events or replay attacks detected within 24 hours.');
      status.suggestedRestrictions.push('block_all_mutations', 'long_cooldown');
    } else if (failedConfirmations > 0 || unauthorizedTools > 1 || replays > 0) {
      status.tier = 'SUSPICIOUS';
      status.reasons.push('Repeated confirmation failures, unauthorized probing, or replays.');
      status.suggestedRestrictions.push('block_sensitive_mutations', 'reduce_rate_limits');
    } else if (recentEvents.length > 5) {
      status.tier = 'LIMITED';
      status.reasons.push('Elevated number of generic security events mapped.');
      status.suggestedRestrictions.push('reduce_rate_limits');
    } else {
      // Look at account basics if available (mocked abstraction since User fields vary)
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
         const accountAgeDays = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
         if (accountAgeDays < 1) {
            status.tier = 'LIMITED';
            status.reasons.push('New account limitations applied (under 24h).');
            status.suggestedRestrictions.push('reduce_rate_limits');
         }
      }
    }

    return status;
  }
}
