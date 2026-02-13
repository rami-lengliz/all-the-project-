import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    UseGuards,
    Patch,
    ParseIntPipe,
    DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CreateConversationDto, MarkAsReadDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
    constructor(private chatService: ChatService) { }

    @Get('conversations')
    @ApiOperation({ summary: 'Get all conversations for the current user' })
    @ApiResponse({ status: 200, description: 'Returns list of conversations' })
    async getConversations(@CurrentUser() user: User) {
        return this.chatService.getUserConversations(user.id);
    }

    @Post('conversations')
    @ApiOperation({ summary: 'Create or get a conversation' })
    @ApiResponse({ status: 201, description: 'Conversation created or retrieved' })
    async createConversation(
        @Body() dto: CreateConversationDto,
        @CurrentUser() user: User,
    ) {
        // Determine who is renter and who is host
        // For simplicity, current user is renter, other user is host
        return this.chatService.getOrCreateConversation(
            user.id,
            dto.otherUserId,
            dto.bookingId,
            dto.listingId,
        );
    }

    @Get('conversations/:id/messages')
    @ApiOperation({ summary: 'Get messages in a conversation' })
    @ApiResponse({ status: 200, description: 'Returns paginated messages' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
    async getMessages(
        @Param('id') conversationId: string,
        @CurrentUser() user: User,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    ) {
        return this.chatService.getMessages(conversationId, user.id, page, limit);
    }

    @Patch('messages/read')
    @ApiOperation({ summary: 'Mark messages as read' })
    @ApiResponse({ status: 200, description: 'Messages marked as read' })
    async markAsRead(
        @Body() dto: MarkAsReadDto,
        @CurrentUser() user: User,
    ) {
        await this.chatService.markAsRead(dto.messageIds, user.id);
        return { success: true };
    }

    @Get('unread-count')
    @ApiOperation({ summary: 'Get unread message count' })
    @ApiResponse({ status: 200, description: 'Returns unread count' })
    async getUnreadCount(@CurrentUser() user: User) {
        const count = await this.chatService.getUnreadCount(user.id);
        return { count };
    }
}
