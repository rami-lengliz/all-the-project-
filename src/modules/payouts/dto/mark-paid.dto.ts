import { IsString, IsNotEmpty } from 'class-validator';

export class MarkPaidDto {
  @IsString()
  @IsNotEmpty()
  method: string;

  @IsString()
  @IsNotEmpty()
  reference: string;
}
