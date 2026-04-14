import { IsUUID, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FlagListingDto {
  @ApiProperty()
  @IsUUID()
  listingId: string;

  @ApiProperty({ example: 'Inappropriate content' })
  @IsString()
  reason: string;
}
