
import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';

import { FindTripTicketsDto } from './dto/find-trip-tickets.dto';

import { TicketService } from './ticket.service';
import { CheckInTicketDto } from './dto/check-in-ticket.dto';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketController {
    constructor(private readonly ticketService: TicketService) {}

    // Xác nhận khách đã lên xe bằng mã QR, chỉ dành cho nhân viên có quyền.
    @Post('check-in')
    @Roles('ADMIN', 'STAFF')
    async checkIn(
        @Body() dto: CheckInTicketDto,
        @Req() req: any,
    ) {
        return this.ticketService.checkIn(dto, req.user.userId);
    }

    // Lấy danh sách vé của một chuyến xe, hỗ trợ lọc theo trạng thái.
    @Get('trips/:tripId')
    @Roles('ADMIN', 'STAFF')
    async findTicketsByTrip(
        @Param('tripId') tripId: string,
        @Query() dto: FindTripTicketsDto,
    ) {
        return this.ticketService.findTicketsByTrip(tripId, dto);
    }

    // Tra cứu thông tin vé bằng mã vé dành cho nhân viên.
    @Get('code/:ticketCode')
    @Roles('ADMIN', 'STAFF')
    async findTicketByCode(
        @Param('ticketCode') ticketCode: string,
    ) {
        return this.ticketService.findTicketByCode(ticketCode);
    }
}
