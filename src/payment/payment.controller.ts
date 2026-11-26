
import {
    Body,
    Controller,
    Param,
    Patch,
    Get,
    Post,
    UseGuards,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';

import { PaymentService } from './payment.service';
import { ReportPaymentDto } from './dto/report-payment.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';
import { ConfirmBookingPaymentDto } from './dto/confirm-booking-payment.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SettingsService } from '../settings/settings.service';

@Controller('payments')
export class PaymentController {
    constructor(
        private readonly paymentService: PaymentService,
        private readonly settingsService: SettingsService,
    ) {}

    // Lấy thông tin tài khoản ngân hàng công khai để khách chuyển khoản.
    @Get('bank-info')
    async getBankInfo() {
        const transferEnabled =
            await this.settingsService.getValue('PAYMENT_TRANSFER_ENABLED');

        if (transferEnabled !== 'true') {
            throw new ForbiddenException(
                'Hải Định hiện tạm ngừng nhận thanh toán chuyển khoản.',
            );
        }

        const [
            bankName,
            bankCode,
            bankShortName,
            accountNumber,
            accountName,
            transferContent,
        ] = await Promise.all([
            this.settingsService.getValue('PAYMENT_BANK_NAME'),
            this.settingsService.getValue('PAYMENT_BANK_CODE'),
            this.settingsService.getValue('PAYMENT_BANK_SHORT_NAME'),
            this.settingsService.getValue('PAYMENT_ACCOUNT_NUMBER'),
            this.settingsService.getValue('PAYMENT_ACCOUNT_NAME'),
            this.settingsService.getValue('PAYMENT_TRANSFER_CONTENT'),
        ]);

        // Kiểm tra đủ 5 trường ngân hàng trước khi cung cấp thông tin tạo QR.
        const bankFields = {
            bankName,
            bankCode,
            bankShortName,
            accountNumber,
            accountName,
        };

        const missingFields = Object.entries(bankFields)
            .filter(([, value]) => !value?.trim())
            .map(([key]) => key);

        if (missingFields.length > 0) {
            throw new BadRequestException(
                'Thông tin tài khoản ngân hàng chưa được cấu hình đầy đủ.',
            );
        }

        return {
            ...bankFields,
            transferContent: transferContent?.trim() || null,
        };
    }

    // Tiếp nhận thông tin khách hàng báo đã chuyển khoản cho booking.
    @Post('bookings/:bookingId/report')
    async reportPayment(
        @Param('bookingId') bookingId: string,
        @Body() dto: ReportPaymentDto,
    ) {
        return this.paymentService.reportPayment(bookingId, dto);
    }

    // Lấy danh sách giao dịch đang chờ nhân viên xác nhận.
    @Get('reported')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
    async findReportedPayments() {
        return this.paymentService.findReportedPayments();
    }

    // Quản trị viên xác nhận tổng số tiền thực tế đã nhận cho booking.
    @Patch('bookings/:bookingId/confirm-total')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async confirmBookingPayment(
        @Param('bookingId') bookingId: string,
        @Body() dto: ConfirmBookingPaymentDto,
        @CurrentUser() user: { userId: string },
    ) {
        return this.paymentService.confirmBookingPayment(
            bookingId,
            dto,
            user.userId,
        );
    }

    // Lấy chi tiết giao dịch thanh toán dành cho nhân viên quản lý.
    @Get(':paymentId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
    async findOne(
        @Param('paymentId') paymentId: string,
    ) {
        return this.paymentService.findOne(paymentId);
    }

    // Nhân viên xác nhận giao dịch sau khi kiểm tra tiền đã vào tài khoản.
    @Patch(':paymentId/confirm')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
    async confirmPayment(
        @Param('paymentId') paymentId: string,
        @CurrentUser() user: { userId: string },
    ) {
        return this.paymentService.confirmPayment(
            paymentId,
            user.userId,
        );
    }

    // Nhân viên từ chối giao dịch và cung cấp lý do từ chối.
    @Patch(':paymentId/reject')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
    async rejectPayment(
        @Param('paymentId') paymentId: string,
        @Body() dto: RejectPaymentDto,
    ) {
        return this.paymentService.rejectPayment(paymentId, dto);
    }
}
