
import {
    IsInt,
    IsOptional,
    IsString,
    IsNotEmpty,
    Min,
    MaxLength,
} from 'class-validator';

export class ReportPaymentDto {
    // Mã đặt vé dùng để xác minh quyền báo thanh toán.
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    bookingCode!: string;

    // Số điện thoại người đặt vé dùng để xác minh booking.
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    customerPhone!: string;

    // Số tiền khách thông báo đã chuyển khoản.
    @IsInt()
    @Min(1)
    amount!: number;

    // Mã giao dịch ngân hàng nếu khách có cung cấp.
    @IsOptional()
    @IsString()
    @MaxLength(100)
    transactionCode?: string;

    // Nội dung chuyển khoản khách đã sử dụng.
    @IsOptional()
    @IsString()
    @MaxLength(255)
    transferContent?: string;
}
