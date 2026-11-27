
import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Patch,
    Query,
    UseGuards,
    Req
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { CancelConfirmedBookingDto } from './dto/cancel-confirmed-booking.dto';
import { QueryBookingsByDateDto } from './dto/query-bookings-by-date.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('bookings')
export class BookingController {
    constructor(private readonly bookingService: BookingService) {}

    // Tạo booking trực tuyến và ghi nhận IP của khách đặt vé.
    @UseGuards(ThrottlerGuard)
    @Post()
    create(
        @Body() dto: CreateBookingDto,
        @Req() req: any,
    ) {
        return this.bookingService.create(
            dto,
            'ONLINE',
            req.ip,
        );
    }

    // Tạo booking nội bộ cho nhân viên bán vé tại văn phòng.
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
    @Post('admin')
    createAdminBooking(@Body() dto: CreateBookingDto) {
        return this.bookingService.create(
            dto,
            'ADMIN',
            null,
        );
    }

    // Tra cứu booking công khai bằng mã đặt vé và số điện thoại người đặt.
    @Get('public/lookup')
    findPublicBooking(
        @Query('bookingCode') bookingCode: string,
        @Query('customerPhone') customerPhone: string,
    ) {
        return this.bookingService.findPublicBooking(
            bookingCode,
            customerPhone,
        );
    }

    // Lấy danh sách chuyến khởi hành trong ngày kèm booking theo từng chiều.
    // Chỉ ADMIN và STAFF được phép xem.
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
    @Get('by-date')
    findByDate(@Query() query: QueryBookingsByDateDto) {
        return this.bookingService.findByDate(query);
    }

    // Chỉ ADMIN và STAFF được xem chi tiết booking.
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.bookingService.findOne(id);
    }

    // Lấy danh sách booking theo bộ lọc và phân trang.
    // Chỉ ADMIN và STAFF được xem danh sách booking.
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
    @Get()
    findAll(@Query() query: QueryBookingDto) {
        return this.bookingService.findAll(query);
    }

    // Chỉ ADMIN và STAFF được hủy booking.
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
    @Patch(':id/cancel')
    cancel(@Param('id') id: string) {
        return this.bookingService.cancel(id);
    }

    // Hủy booking đã xác nhận, chỉ ADMIN và STAFF được phép thực hiện.
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
    @Post(':id/cancel-confirmed')
    async cancelConfirmedBooking(
        @Param('id') id: string,
        @Body() dto: CancelConfirmedBookingDto,
        @Req() req: any,
    ) {
        return this.bookingService.cancelConfirmedBooking(
            id,
            dto,
            req.user.userId,
        );
    }
}
