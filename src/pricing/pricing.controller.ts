
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Query
} from '@nestjs/common';

import { PricingService } from './pricing.service';
import { CreatePricingPolicyDto } from './dto/create-pricing-policy.dto';
import { UpdatePricingPolicyDto } from './dto/update-pricing-policy.dto';

import { TripDirection } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing')
export class PricingController {
  constructor(
    private readonly pricingService: PricingService,
  ) {}

  // Tạo chính sách giá mới, chỉ ADMIN được phép thực hiện.
  @Post()
  @Roles('ADMIN')
  async create(@Body() dto: CreatePricingPolicyDto) {
    return this.pricingService.create(dto);
  }

  // Lấy danh sách chính sách giá dành cho ADMIN và STAFF.
  @Get()
  @Roles('ADMIN', 'STAFF')
  async findAll() {
    return this.pricingService.findAll();
  }

    // Tính giá vé theo chuyến, chiều chạy và hai điểm đón trả.
  @Get('quote')
  @Roles('ADMIN', 'STAFF')
  async quote(
    @Query('tripId') tripId: string,
    @Query('direction') direction: TripDirection,
    @Query('pickupTripRoutePointId')
    pickupTripRoutePointId: string,
    @Query('dropoffTripRoutePointId')
    dropoffTripRoutePointId: string,
    @Query('pickupServicePointId')
    pickupServicePointId?: string,
    @Query('dropoffServicePointId')
    dropoffServicePointId?: string,
  ) {
    return this.pricingService.calculatePrice({
      tripId,
      direction,
      pickupTripRoutePointId,
      dropoffTripRoutePointId,
      pickupServicePointId,
      dropoffServicePointId,
    });
  }

  // Lấy chi tiết một chính sách giá dành cho ADMIN và STAFF.
  @Get(':id')
  @Roles('ADMIN', 'STAFF')
  async findOne(@Param('id') id: string) {
    return this.pricingService.findOne(id);
  }

  // Cập nhật chính sách giá, chỉ ADMIN được phép thực hiện.
  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePricingPolicyDto,
  ) {
    return this.pricingService.update(id, dto);
  }

  // Kích hoạt chính sách giá, chỉ ADMIN được phép thực hiện.
  @Patch(':id/activate')
  @Roles('ADMIN')
  async activate(@Param('id') id: string) {
    return this.pricingService.activate(id);
  }

  // Lưu trữ chính sách giá, chỉ ADMIN được phép thực hiện.
  @Patch(':id/archive')
  @Roles('ADMIN')
  async archive(@Param('id') id: string) {
    return this.pricingService.archive(id);
  }
}
