import { IsUUID, IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum VerifyType {
  EMAIL = 'email',
  PHONE = 'phone',
}

export class VerifyDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: VerifyType })
  @IsEnum(VerifyType)
  type: VerifyType;

  @ApiProperty()
  @IsString()
  code: string;
}
