import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';

import { SettingsService } from './settings.service';
import { CreateSettingDto } from './dto/create-setting.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';

import {
    UpdateBookingSettingsDto,
    UpdatePaymentSettingsDto,
} from './dto/update-booking-payment-settings.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
    constructor(
        private readonly settingsService: SettingsService,
    ) {}

    // ADMIN và STAFF xem cấu hình đặt vé.
    @Roles('ADMIN', 'STAFF')
    @Get('booking')
    async getBookingSettings() {
        return this.settingsService.getBookingSettings();
    }

    // ADMIN và STAFF xem cấu hình thanh toán.
    @Roles('ADMIN', 'STAFF')
    @Get('payment')
    async getPaymentSettings() {
        return this.settingsService.getPaymentSettings();
    }

    // Lấy thông tin một cấu hình theo key.
    @Roles('ADMIN', 'STAFF')
    @Get(':key')
    async findOne(@Param('key') key: string) {
        return this.settingsService.findOne(key);
    }

    // ADMIN cập nhật nhóm cài đặt đặt vé.
    @Patch('booking')
    @Roles('ADMIN')
    async updateBookingSettings(
        @Body() data: UpdateBookingSettingsDto,
    ) {
        return this.settingsService.updateBookingSettings(data);
    }

    // ADMIN cập nhật nhóm cài đặt thanh toán.
    @Patch('payment')
    @Roles('ADMIN')
    async updatePaymentSettings(
        @Body() data: UpdatePaymentSettingsDto,
    ) {
        return this.settingsService.updatePaymentSettings(data);
    }

    // Chỉ ADMIN được tạo cấu hình mới.
    @Post()
    @Roles('ADMIN')
    async create(@Body() data: CreateSettingDto) {
        return this.settingsService.create(data);
    }

    // Chỉ ADMIN được cập nhật cấu hình.
    @Patch(':key')
    @Roles('ADMIN')
    async update(
        @Param('key') key: string,
        @Body() data: UpdateSettingDto,
    ) {
        return this.settingsService.update(key, data);
    }

    // Chỉ ADMIN được xóa cấu hình.
    @Delete(':key')
    @Roles('ADMIN')
    async remove(@Param('key') key: string) {
        return this.settingsService.remove(key);
    }
}