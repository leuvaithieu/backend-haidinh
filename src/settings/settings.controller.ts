import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
} from '@nestjs/common';

import { SettingsService } from './settings.service';
import { CreateSettingDto } from './dto/create-setting.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';

@Controller('settings')
export class SettingsController {
    constructor(
        private readonly settingsService: SettingsService,
    ) {}

    // Lấy danh sách toàn bộ cấu hình hệ thống.
    @Get()
    async findAll() {
        return this.settingsService.findAll();
    }

    // Lấy thông tin một cấu hình theo key.
    @Get(':key')
    async findOne(@Param('key') key: string) {
        return this.settingsService.findOne(key);
    }

    // Tạo cấu hình mới.
    @Post()
    async create(@Body() data: CreateSettingDto) {
        return this.settingsService.create(data);
    }

    // Cập nhật cấu hình theo key.
    @Patch(':key')
    async update(
        @Param('key') key: string,
        @Body() data: UpdateSettingDto,
    ) {
        return this.settingsService.update(key, data);
    }

    // Xóa cấu hình theo key.
    @Delete(':key')
    async remove(@Param('key') key: string) {
        return this.settingsService.remove(key);
    }
}