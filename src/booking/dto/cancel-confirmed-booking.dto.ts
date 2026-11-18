
import {
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class CancelConfirmedBookingDto {
    @IsOptional()
    @IsString()
    @MaxLength(500, {
        message: 'Lý do hủy không được vượt quá 500 ký tự.',
    })
    reason?: string;
}
