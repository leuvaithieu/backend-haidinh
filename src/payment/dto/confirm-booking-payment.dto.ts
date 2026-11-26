
import { IsInt, Min } from 'class-validator';

export class ConfirmBookingPaymentDto {
    @IsInt({ message: 'Số tiền đã thanh toán phải là số nguyên.' })
    @Min(1, { message: 'Số tiền đã thanh toán phải lớn hơn 0.' })
    paidAmount!: number;
}
