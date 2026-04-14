import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ChatbotMemoryService {
  private readonly logger = new Logger(ChatbotMemoryService.name);

  constructor(private prisma: PrismaService) {}

  public async getConversation(id: string, userId: string) {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    return conversation;
  }

  public async createConversation(userId: string) {
    return this.prisma.chatConversation.create({
      data: {
        userId,
        // Will set title eventually if we summarize
      }
    });
  }

  public async saveMessage(
    conversationId: string, 
    role: string, 
    content: string, 
    toolName?: string, 
    toolPayload?: any
  ) {
    return this.prisma.chatMessage.create({
      data: {
        conversationId,
        role,
        content,
        toolName: toolName || null,
        toolPayload: toolPayload || null
      }
    });
  }

  public async getRecentContext(conversationId: string, limit: number = 20) {
    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    return messages.reverse();
  }

  public async getUserConversations(userId: string) {
    return this.prisma.chatConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { messages: true }
        }
      }
    });
  }

  public async getConversationMessages(conversationId: string, userId: string) {
    await this.getConversation(conversationId, userId); // validates ownership
    return this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    });
  }
}

