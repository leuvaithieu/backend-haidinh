
import {
    IsNotEmpty,
    IsString,
    MaxLength,
} from 'class-validator';

export class FailRefundDto {
    @IsString()
    @IsNotEmpty({
        message: 'Vui lòng nhập lý do chuyển khoản thất bại.',
    })
    @MaxLength(1000, {
        message: 'Lý do không được vượt quá 1000 ký tự.',
    })
    failureReason!: string;
}
