import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AddSecurityEventPayload } from './chatbot-trust.types';

@Injectable()
export class ChatbotAbuseDetectionService {
  private readonly logger = new Logger(ChatbotAbuseDetectionService.name);

  constructor(private prisma: PrismaService) {}

  public async recordIncident(payload: AddSecurityEventPayload) {
    this.logger.warn(`Security Incident [${payload.eventType}] Sev: ${payload.severity} | User: ${payload.userId} | [${payload.reasonCode}]`);
    
    await this.prisma.chatbotSecurityEvent.create({
       data: {
         userId: payload.userId,
         conversationId: payload.conversationId,
         eventType: payload.eventType,
         severity: payload.severity,
         reasonCode: payload.reasonCode,
         metadata: payload.metadata || {}
       }
    });
  }
}
