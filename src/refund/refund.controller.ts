
import {
    Body,
    Controller,
    Get,
    Param,
    ParseEnumPipe,
    Patch,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';

import { RefundStatus } from '@prisma/client';

import { RefundService } from './refund.service';
import { RejectRefundDto } from './dto/reject-refund.dto';
import { CompleteRefundDto } from './dto/complete-refund.dto';
import { FailRefundDto } from './dto/fail-refund.dto';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
export class RefundController {
    constructor(private readonly refundService: RefundService) {}

    /// Lấy danh sách yêu cầu hoàn tiền và kiểm tra trạng thái lọc hợp lệ.
    @Get()
    findAll(
        @Query(
            'status',
            new ParseEnumPipe(RefundStatus, { optional: true }),
        )
        status?: RefundStatus,
    ) {
        return this.refundService.findAll(status);
    }

    // Lấy chi tiết một yêu cầu hoàn tiền.
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.refundService.findOne(id);
    }

    // Duyệt yêu cầu hoàn tiền đang chờ xử lý.
    @Patch(':id/approve')
    approve(
        @Param('id') id: string,
        @Req() req: any,
    ) {
        return this.refundService.approve(
            id,
            req.user.userId,
        );
    }

    // Bắt đầu thực hiện chuyển khoản hoàn tiền cho khách.
    @Patch(':id/start-processing')
    startProcessing(
        @Param('id') id: string,
        @Req() req: any,
    ) {
        return this.refundService.startProcessing(
            id,
            req.user.userId,
        );
    }

    // Xác nhận đã chuyển khoản hoàn tiền thành công.
    @Patch(':id/complete')
    completeRefund(
        @Param('id') id: string,
        @Body() dto: CompleteRefundDto,
        @Req() req: any,
    ) {
        return this.refundService.completeRefund(
            id,
            dto.bankTransferReference,
            req.user.userId,
        );
    }

    // Ghi nhận giao dịch chuyển khoản hoàn tiền thất bại.
    @Patch(':id/fail')
    failRefund(
        @Param('id') id: string,
        @Body() dto: FailRefundDto,
        @Req() req: any,
    ) {
        return this.refundService.failRefund(
            id,
            dto.failureReason,
            req.user.userId,
        );
    }

    // Khôi phục yêu cầu hoàn tiền thất bại để nhân viên xử lý lại.
    @Patch(':id/retry')
    retryRefund(
        @Param('id') id: string,
    ) {
        return this.refundService.retryRefund(id);
    }

    // Từ chối yêu cầu hoàn tiền và lưu lý do.
    @Patch(':id/reject')
    reject(
        @Param('id') id: string,
        @Body() dto: RejectRefundDto,
        @Req() req: any,
    ) {
        return this.refundService.reject(
            id,
            dto.reason,
            req.user.userId,
        );
    }
}
