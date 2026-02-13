import { IsString, IsNotEmpty, MaxLength, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
    @ApiProperty({
        description: 'Message content',
        example: 'Hello! Is this listing still available?',
        maxLength: 5000,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(5000)
    content: string;

    @ApiProperty({
        description: 'Conversation ID',
        example: '123e4567-e89b-12d3-a456-426614174000',
    })
    @IsUUID()
    conversationId: string;
}

export class CreateConversationDto {
    @ApiProperty({
        description: 'ID of the other user in the conversation',
        example: '123e4567-e89b-12d3-a456-426614174001',
    })
    @IsUUID()
    otherUserId: string;

    @ApiPropertyOptional({
        description: 'Optional booking ID to link conversation to',
        example: '123e4567-e89b-12d3-a456-426614174002',
    })
    @IsOptional()
    @IsUUID()
    bookingId?: string;

    @ApiPropertyOptional({
        description: 'Optional listing ID to link conversation to',
        example: '123e4567-e89b-12d3-a456-426614174003',
    })
    @IsOptional()
    @IsUUID()
    listingId?: string;
}

export class MarkAsReadDto {
    @ApiProperty({
        description: 'Array of message IDs to mark as read',
        example: ['123e4567-e89b-12d3-a456-426614174004'],
    })
    @IsUUID('4', { each: true })
    messageIds: string[];
}
