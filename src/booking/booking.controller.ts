
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

@Controller('bookings')
export class BookingController {
    constructor(private readonly bookingService: BookingService) {}

    @Post()
    create(@Body() dto: CreateBookingDto) {
        return this.bookingService.create(dto);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.bookingService.findOne(id);
    }

    // Lấy danh sách booking theo bộ lọc và phân trang.
    @Get()
    findAll(@Query() query: QueryBookingDto) {
        return this.bookingService.findAll(query);
    }

    @Patch(':id/cancel')
    cancel(@Param('id') id: string) {
        return this.bookingService.cancel(id);
    }
}
