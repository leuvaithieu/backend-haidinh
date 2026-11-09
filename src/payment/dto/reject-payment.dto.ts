import {
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class RejectPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  rejectionReason!: string;
}