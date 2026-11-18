
import {
    IsNotEmpty,
    IsString,
    MaxLength,
} from 'class-validator';

export class CancelConfirmedBookingDto {
    @IsString()
    @IsNotEmpty({
        message: 'Vui lòng nhập lý do hủy booking.',
    })
    @MaxLength(500, {
        message: 'Lý do hủy không được vượt quá 500 ký tự.',
    })
    reason!: string;
}
