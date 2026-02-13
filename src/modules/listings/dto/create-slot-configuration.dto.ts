import {
    IsInt,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    Max,
    Min,
    Matches,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class DaySchedule {
    @ApiProperty({
        description: 'Start time in HH:mm format',
        example: '08:00',
    })
    @IsString()
    @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
        message: 'Start time must be in HH:mm format (e.g., 08:00)',
    })
    start: string;

    @ApiProperty({
        description: 'End time in HH:mm format',
        example: '22:00',
    })
    @IsString()
    @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
        message: 'End time must be in HH:mm format (e.g., 22:00)',
    })
    end: string;
}

class OperatingHours {
    @ApiPropertyOptional({ type: DaySchedule })
    @IsOptional()
    @ValidateNested()
    @Type(() => DaySchedule)
    monday?: DaySchedule;

    @ApiPropertyOptional({ type: DaySchedule })
    @IsOptional()
    @ValidateNested()
    @Type(() => DaySchedule)
    tuesday?: DaySchedule;

    @ApiPropertyOptional({ type: DaySchedule })
    @IsOptional()
    @ValidateNested()
    @Type(() => DaySchedule)
    wednesday?: DaySchedule;

    @ApiPropertyOptional({ type: DaySchedule })
    @IsOptional()
    @ValidateNested()
    @Type(() => DaySchedule)
    thursday?: DaySchedule;

    @ApiPropertyOptional({ type: DaySchedule })
    @IsOptional()
    @ValidateNested()
    @Type(() => DaySchedule)
    friday?: DaySchedule;

    @ApiPropertyOptional({ type: DaySchedule })
    @IsOptional()
    @ValidateNested()
    @Type(() => DaySchedule)
    saturday?: DaySchedule;

    @ApiPropertyOptional({ type: DaySchedule })
    @IsOptional()
    @ValidateNested()
    @Type(() => DaySchedule)
    sunday?: DaySchedule;
}

export class CreateSlotConfigurationDto {
    @ApiProperty({
        description: 'Duration of each slot in minutes',
        example: 60,
        minimum: 15,
        maximum: 480,
    })
    @IsInt()
    @Min(15, { message: 'Slot duration must be at least 15 minutes' })
    @Max(480, { message: 'Slot duration cannot exceed 8 hours (480 minutes)' })
    slotDurationMinutes: number;

    @ApiProperty({
        description: 'Operating hours for each day of the week',
        example: {
            monday: { start: '08:00', end: '22:00' },
            tuesday: { start: '08:00', end: '22:00' },
            wednesday: { start: '08:00', end: '22:00' },
            thursday: { start: '08:00', end: '22:00' },
            friday: { start: '08:00', end: '22:00' },
            saturday: { start: '09:00', end: '20:00' },
            sunday: { start: '09:00', end: '20:00' },
        },
    })
    @IsObject()
    @ValidateNested()
    @Type(() => OperatingHours)
    operatingHours: OperatingHours;

    @ApiProperty({
        description: 'Minimum number of slots that must be booked',
        example: 1,
        minimum: 1,
    })
    @IsInt()
    @Min(1, { message: 'Minimum booking slots must be at least 1' })
    minBookingSlots: number;

    @ApiPropertyOptional({
        description: 'Maximum number of slots that can be booked at once',
        example: 4,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1, { message: 'Maximum booking slots must be at least 1' })
    maxBookingSlots?: number;

    @ApiProperty({
        description: 'Buffer time between bookings in minutes',
        example: 15,
        minimum: 0,
        maximum: 60,
    })
    @IsInt()
    @Min(0, { message: 'Buffer minutes cannot be negative' })
    @Max(60, { message: 'Buffer minutes cannot exceed 60' })
    bufferMinutes: number;

    @ApiProperty({
        description: 'Price per slot in TND',
        example: 50,
        minimum: 0,
    })
    @IsNumber()
    @Min(0, { message: 'Price per slot cannot be negative' })
    pricePerSlot: number;
}
