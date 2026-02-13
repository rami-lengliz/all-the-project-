import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/chat.dto';

@WebSocketGateway({
    cors: {
        origin: '*', // Configure this properly in production
        credentials: true,
    },
    namespace: '/chat',
})
@Injectable()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ChatGateway.name);
    private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

    constructor(
        private chatService: ChatService,
        private jwtService: JwtService,
    ) { }

    /**
     * Handle client connection with JWT authentication
     */
    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');

            if (!token) {
                throw new UnauthorizedException('No token provided');
            }

            // Verify JWT token
            const payload = await this.jwtService.verifyAsync(token);
            const userId = payload.sub;

            // Store user ID in socket data
            client.data.userId = userId;

            // Track user's socket connections
            if (!this.userSockets.has(userId)) {
                this.userSockets.set(userId, new Set());
            }
            this.userSockets.get(userId).add(client.id);

            this.logger.log(`Client connected: ${client.id}, User: ${userId}`);

            // Notify client of successful connection
            client.emit('connected', { userId, socketId: client.id });
        } catch (error) {
            this.logger.error(`Connection failed: ${error.message}`);
            client.emit('error', { message: 'Authentication failed' });
            client.disconnect();
        }
    }

    /**
     * Handle client disconnect
     */
    handleDisconnect(client: Socket) {
        const userId = client.data.userId;

        if (userId && this.userSockets.has(userId)) {
            this.userSockets.get(userId).delete(client.id);

            // Remove user entry if no more sockets
            if (this.userSockets.get(userId).size === 0) {
                this.userSockets.delete(userId);
            }
        }

        this.logger.log(`Client disconnected: ${client.id}`);
    }

    /**
     * Send a message
     */
    @SubscribeMessage('sendMessage')
    async handleSendMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: SendMessageDto,
    ) {
        try {
            const senderId = client.data.userId;

            if (!senderId) {
                throw new UnauthorizedException('Not authenticated');
            }

            // Create message via service
            const message = await this.chatService.sendMessage(
                payload.conversationId,
                senderId,
                payload.content,
            );

            // Get conversation to find recipient
            const conversation = await this.chatService['prisma'].conversation.findUnique({
                where: { id: payload.conversationId },
            });

            if (!conversation) {
                throw new Error('Conversation not found');
            }

            // Determine recipient
            const recipientId = conversation.renterId === senderId ? conversation.hostId : conversation.renterId;

            // Emit to sender (confirmation)
            client.emit('messageSent', message);

            // Emit to recipient (if online)
            this.emitToUser(recipientId, 'newMessage', message);

            return { success: true, message };
        } catch (error) {
            this.logger.error(`Error sending message: ${error.message}`);
            client.emit('error', { message: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Mark messages as read
     */
    @SubscribeMessage('markAsRead')
    async handleMarkAsRead(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { messageIds: string[] },
    ) {
        try {
            const userId = client.data.userId;

            if (!userId) {
                throw new UnauthorizedException('Not authenticated');
            }

            await this.chatService.markAsRead(payload.messageIds, userId);

            client.emit('markedAsRead', { messageIds: payload.messageIds });

            return { success: true };
        } catch (error) {
            this.logger.error(`Error marking as read: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Join a conversation room
     */
    @SubscribeMessage('joinConversation')
    async handleJoinConversation(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { conversationId: string },
    ) {
        try {
            const userId = client.data.userId;

            if (!userId) {
                throw new UnauthorizedException('Not authenticated');
            }

            // Verify user is participant
            const conversation = await this.chatService['prisma'].conversation.findUnique({
                where: { id: payload.conversationId },
            });

            if (!conversation) {
                throw new Error('Conversation not found');
            }

            if (conversation.renterId !== userId && conversation.hostId !== userId) {
                throw new Error('Not a participant in this conversation');
            }

            // Join room
            client.join(`conversation:${payload.conversationId}`);

            this.logger.log(`User ${userId} joined conversation ${payload.conversationId}`);

            return { success: true };
        } catch (error) {
            this.logger.error(`Error joining conversation: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Leave a conversation room
     */
    @SubscribeMessage('leaveConversation')
    async handleLeaveConversation(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { conversationId: string },
    ) {
        client.leave(`conversation:${payload.conversationId}`);
        return { success: true };
    }

    /**
     * Typing indicator
     */
    @SubscribeMessage('typing')
    async handleTyping(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { conversationId: string; isTyping: boolean },
    ) {
        const userId = client.data.userId;

        // Broadcast to conversation room (except sender)
        client.to(`conversation:${payload.conversationId}`).emit('userTyping', {
            userId,
            conversationId: payload.conversationId,
            isTyping: payload.isTyping,
        });

        return { success: true };
    }

    /**
     * Emit event to all sockets of a specific user
     */
    private emitToUser(userId: string, event: string, data: any) {
        const socketIds = this.userSockets.get(userId);

        if (socketIds) {
            socketIds.forEach((socketId) => {
                this.server.to(socketId).emit(event, data);
            });
        }
    }
}
