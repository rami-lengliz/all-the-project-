import { IsString } from 'class-validator';

export class MarkPaidDto {
    @IsString()
    method: string;

    @IsString()
    reference: string;
}
