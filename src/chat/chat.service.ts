import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Conversation, Message, Prisma } from '@prisma/client';

@Injectable()
export class ChatService {
    constructor(private prisma: PrismaService) { }

    /**
     * Get or create a conversation between two users
     */
    async getOrCreateConversation(
        renterId: string,
        hostId: string,
        bookingId?: string,
        listingId?: string,
    ): Promise<Conversation> {
        // Ensure renter and host are different users
        if (renterId === hostId) {
            throw new BadRequestException('Cannot create conversation with yourself');
        }

        // Try to find existing conversation
        const existing = await this.prisma.conversation.findFirst({
            where: {
                renterId,
                hostId,
                bookingId: bookingId || null,
            },
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });

        if (existing) {
            return existing;
        }

        // Create new conversation
        return this.prisma.conversation.create({
            data: {
                renterId,
                hostId,
                bookingId,
                listingId,
            },
            include: {
                renter: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true,
                    },
                },
                host: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true,
                    },
                },
            },
        });
    }

    /**
     * Send a message in a conversation
     */
    async sendMessage(
        conversationId: string,
        senderId: string,
        content: string,
    ): Promise<Message> {
        // Verify conversation exists and user is a participant
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
        });

        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        if (conversation.renterId !== senderId && conversation.hostId !== senderId) {
            throw new ForbiddenException('You are not a participant in this conversation');
        }

        // Create message and update conversation
        const message = await this.prisma.message.create({
            data: {
                conversationId,
                senderId,
                content,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true,
                    },
                },
            },
        });

        // Update conversation's lastMessageAt
        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: new Date() },
        });

        return message;
    }

    /**
     * Get messages in a conversation with pagination
     */
    async getMessages(
        conversationId: string,
        userId: string,
        page: number = 1,
        limit: number = 50,
    ): Promise<{ messages: Message[]; total: number; hasMore: boolean }> {
        // Verify user is a participant
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
        });

        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        if (conversation.renterId !== userId && conversation.hostId !== userId) {
            throw new ForbiddenException('You are not a participant in this conversation');
        }

        const skip = (page - 1) * limit;

        const [messages, total] = await Promise.all([
            this.prisma.message.findMany({
                where: { conversationId },
                include: {
                    sender: {
                        select: {
                            id: true,
                            name: true,
                            avatarUrl: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.message.count({
                where: { conversationId },
            }),
        ]);

        return {
            messages: messages.reverse(), // Reverse to show oldest first
            total,
            hasMore: skip + messages.length < total,
        };
    }

    /**
     * Get user's conversations
     */
    async getUserConversations(userId: string): Promise<Conversation[]> {
        return this.prisma.conversation.findMany({
            where: {
                OR: [
                    { renterId: userId },
                    { hostId: userId },
                ],
            },
            include: {
                renter: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true,
                    },
                },
                host: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
                booking: {
                    select: {
                        id: true,
                        status: true,
                        listing: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
                    },
                },
                listing: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
            orderBy: { lastMessageAt: 'desc' },
        });
    }

    /**
     * Mark messages as read
     */
    async markAsRead(messageIds: string[], userId: string): Promise<void> {
        // Verify all messages belong to conversations where user is recipient
        const messages = await this.prisma.message.findMany({
            where: {
                id: { in: messageIds },
            },
            include: {
                conversation: true,
            },
        });

        // Filter messages where user is the recipient (not the sender)
        const validMessageIds = messages
            .filter((msg) => {
                const isRecipient =
                    (msg.conversation.renterId === userId && msg.senderId !== userId) ||
                    (msg.conversation.hostId === userId && msg.senderId !== userId);
                return isRecipient;
            })
            .map((msg) => msg.id);

        if (validMessageIds.length === 0) {
            return;
        }

        // Update read status
        await this.prisma.message.updateMany({
            where: {
                id: { in: validMessageIds },
                readAt: null,
            },
            data: {
                readAt: new Date(),
            },
        });
    }

    /**
     * Get unread message count for a user
     */
    async getUnreadCount(userId: string): Promise<number> {
        return this.prisma.message.count({
            where: {
                readAt: null,
                conversation: {
                    OR: [
                        { renterId: userId },
                        { hostId: userId },
                    ],
                },
                senderId: { not: userId }, // Don't count own messages
            },
        });
    }
}
