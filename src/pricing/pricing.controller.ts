
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { PricingService } from './pricing.service';
import { CreatePricingPolicyDto } from './dto/create-pricing-policy.dto';
import { UpdatePricingPolicyDto } from './dto/update-pricing-policy.dto';

@Controller('pricing')
export class PricingController {
  constructor(
    private readonly pricingService: PricingService,
  ) {}

  // Tạo chính sách giá mới.
  @Post()
  async create(@Body() dto: CreatePricingPolicyDto) {
    return this.pricingService.create(dto);
  }

  // Lấy danh sách tất cả chính sách giá.
  @Get()
  async findAll() {
    return this.pricingService.findAll();
  }

  // Lấy chi tiết một chính sách giá theo ID.
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.pricingService.findOne(id);
  }

  // Cập nhật thông tin một chính sách giá.
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePricingPolicyDto,
  ) {
    return this.pricingService.update(id, dto);
  }

  // Kích hoạt chính sách giá.
  @Patch(':id/activate')
  async activate(@Param('id') id: string) {
    return this.pricingService.activate(id);
  }

  // Lưu trữ chính sách giá.
  @Patch(':id/archive')
  async archive(@Param('id') id: string) {
    return this.pricingService.archive(id);
  }
}
