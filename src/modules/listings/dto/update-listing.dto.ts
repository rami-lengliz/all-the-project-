import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateListingDto } from './create-listing.dto';

export class UpdateListingDto extends PartialType(CreateListingDto) {
    @ApiProperty({
        required: false,
        type: [String],
        description: 'Array of image URLs to remove from the listing',
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    imagesToRemove?: string[];
}
