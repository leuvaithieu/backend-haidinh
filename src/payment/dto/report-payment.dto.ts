import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

export class ReportPaymentDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  transactionCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  transferContent?: string;
}