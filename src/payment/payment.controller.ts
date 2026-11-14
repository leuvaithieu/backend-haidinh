import {
  Body,
  Controller,
  Param,
  Patch,
  Get,
  Post,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';

import { PaymentService } from './payment.service';
import { ReportPaymentDto } from './dto/report-payment.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';

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
            accountNumber,
            accountName,
        ] = await Promise.all([
            this.settingsService.getValue('PAYMENT_BANK_NAME'),
            this.settingsService.getValue('PAYMENT_BANK_CODE'),
            this.settingsService.getValue('PAYMENT_ACCOUNT_NUMBER'),
            this.settingsService.getValue('PAYMENT_ACCOUNT_NAME'),
        ]);

        return {
            bankName,
            bankCode,
            accountNumber,
            accountName,
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

    // Lấy chi tiết giao dịch thanh toán dành cho nhân viên quản lý.
    @Get(':paymentId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
    async findOne( @Param('paymentId') paymentId: string,) {
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