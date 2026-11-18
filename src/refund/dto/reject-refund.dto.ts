
import {
    IsNotEmpty,
    IsString,
    MaxLength,
} from 'class-validator';

export class RejectRefundDto {
    @IsString()
    @IsNotEmpty({
        message: 'Vui lòng nhập lý do từ chối hoàn tiền.',
    })
    @MaxLength(500, {
        message: 'Lý do từ chối không được vượt quá 500 ký tự.',
    })
    reason!: string;
}
