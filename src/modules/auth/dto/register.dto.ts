import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'John Doe', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Name is too long (max 255 characters).' })
  name?: string;

  @ApiProperty({ example: 'John', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'First name is too long.' })
  firstName?: string;

  @ApiProperty({ example: 'Doe', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Last name is too long.' })
  lastName?: string;

  @ApiProperty({ example: 'john@example.com', required: false })
  @IsOptional()
  @IsEmail()
  @MaxLength(255, { message: 'Email is too long (max 255 characters).' })
  email?: string;

  @ApiProperty({ example: '+21612345678', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20, {
    message:
      'Phone number is too long (max 20 characters, e.g. +21612345678).',
  })
  phone?: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  @MaxLength(128, { message: 'Password is too long (max 128 characters).' })
  password: string;
}
