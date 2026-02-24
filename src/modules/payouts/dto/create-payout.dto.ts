import { IsString, IsOptional, IsNumber, IsPositive, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePayoutDto {
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    @Min(0.01)
    @Type(() => Number)
    amount: number;

    @IsString()
    @IsOptional()
    method?: string;

    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsOptional()
    notes?: string;
}
