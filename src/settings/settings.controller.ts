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

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
    constructor(
        private readonly settingsService: SettingsService,
    ) {}

    // Lấy danh sách cấu hình hệ thống cho người dùng đã đăng nhập.
    @Get()
    async findAll() {
        return this.settingsService.findAll();
    }

    // Lấy thông tin một cấu hình theo key.
    @Get(':key')
    async findOne(@Param('key') key: string) {
        return this.settingsService.findOne(key);
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