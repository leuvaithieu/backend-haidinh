
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Query,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';

import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('bookings')
export class BookingController {
    constructor(private readonly bookingService: BookingService) {}

    @Post()
    create(@Body() dto: CreateBookingDto) {
        return this.bookingService.create(dto);
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
}
