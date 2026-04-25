import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsNotEmpty, IsOptional, ValidateIf } from 'class-validator';

export enum CategoryRequestAction {
  APPROVE = 'APPROVED',
  REJECT = 'REJECTED',
  MERGE = 'MERGED'
}

export class ReviewCategoryRequestDto {
  @ApiProperty({ enum: CategoryRequestAction })
  @IsEnum(CategoryRequestAction)
  @IsNotEmpty()
  action: CategoryRequestAction;

  @ApiPropertyOptional({ description: 'Notes from admin regarding the decision' })
  @IsString()
  @IsOptional()
  adminNotes?: string;

  @ApiPropertyOptional({ description: 'If merging, the ID of the category to merge into. If approving, optional ID if creating a new one ahead of time.' })
  @ValidateIf(o => o.action === CategoryRequestAction.MERGE)
  @IsString()
  @IsNotEmpty()
  resolvedCategoryId?: string;
}
