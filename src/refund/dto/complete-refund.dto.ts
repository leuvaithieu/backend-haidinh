
import {
    IsNotEmpty,
    IsString,
    MaxLength,
} from 'class-validator';

export class CompleteRefundDto {
    @IsString()
    @IsNotEmpty({
        message: 'Vui lòng nhập mã tham chiếu giao dịch ngân hàng.',
    })
    @MaxLength(255, {
        message: 'Mã giao dịch không được vượt quá 255 ký tự.',
    })
    bankTransferReference!: string;
}
