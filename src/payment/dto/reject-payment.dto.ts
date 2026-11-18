import {
  IsNotEmpty,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';

export class RejectPaymentDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'Lý do từ chối không được chỉ chứa khoảng trắng.',
  })
  @MaxLength(255)
  rejectionReason!: string;
}