
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
            req.user.id,
        );
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
            req.user.id,
        );
    }
}
