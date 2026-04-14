import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsOptional()
  @IsUUID('4', { message: 'Must be a valid UUID' })
  conversationId?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(1000, { message: 'Message is too long. Max 1000 characters.' })
  message: string;
}
