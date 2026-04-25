import { Controller, Post, Body, Get, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChatbotService } from './chatbot.service';
import { CreateMessageDto } from './dto/create-message.dto';

@ApiTags('chatbot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('messages')
  @ApiOperation({ summary: 'Send a message to the chatbot' })
  async sendMessage(@Request() req, @Body() dto: CreateMessageDto) {
    const userId = req.user.sub ?? req.user.id;
    return this.chatbotService.processMessage(userId, dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Get all chatbot conversations for current user' })
  async getConversations(@Request() req) {
    const userId = req.user.sub ?? req.user.id;
    return this.chatbotService.getConversations(userId);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get all messages in a specific conversation' })
  async getConversationMessages(@Request() req, @Param('id') conversationId: string) {
    const userId = req.user.sub ?? req.user.id;
    return this.chatbotService.getConversationMessages(userId, conversationId);
  }

  @Post('actions/confirm')
  @ApiOperation({ summary: 'Confirm a pending chatbot mutation action securely' })
  async confirmAction(@Request() req, @Body() body: any) {
    const userId = req.user.sub ?? req.user.id;
    return this.chatbotService.confirmAction(userId, body);
  }
}
