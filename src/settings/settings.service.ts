import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSettingDto } from './dto/create-setting.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SettingsService {
    constructor(private prisma: PrismaService) {}

    // Lấy toàn bộ cấu hình hệ thống.
    async findAll() {
        return this.prisma.systemSetting.findMany({
            orderBy: {
                key: 'asc',
            },
        });
    }

    // Lấy một cấu hình theo key.
    async findOne(key: string) {
        const setting = await this.prisma.systemSetting.findUnique({
            where: { key },
        });

        if (!setting) {
            throw new NotFoundException(
                `Không tìm thấy cấu hình: ${key}`,
            );
        }

        return setting;
    }

    // Lấy giá trị cấu hình theo key, trả về null nếu chưa tồn tại.
    async getValue(key: string): Promise<string | null> {
        const setting = await this.prisma.systemSetting.findUnique({
            where: { key },
            select: { value: true },
        });

        return setting?.value ?? null;
    }

    // Lấy cấu hình dạng số, dùng giá trị mặc định nếu dữ liệu không hợp lệ.
    async getNumberValue(
        key: string,
        defaultValue: number,
    ): Promise<number> {
        const value = await this.getValue(key);

        if (value === null || value.trim() === '') {
            return defaultValue;
        }

        const numberValue = Number(value);

        if (!Number.isFinite(numberValue)) {
            return defaultValue;
        }

        return numberValue;
    }

    // Kiểm tra tính hợp lệ của giá trị cấu hình theo từng key.
    private validateSetting(key: string, value: string) {
        if (key === 'BOOKING_HOLD_MINUTES') {
            const minutes = Number(value);

            if (!Number.isInteger(minutes) || minutes <= 0) {
                throw new BadRequestException(
                    'Thời gian giữ ghế phải là số nguyên lớn hơn 0',
                );
            }
        }
    }

    // Tạo cấu hình mới.
    async create(data: CreateSettingDto) {
        this.validateSetting(data.key, data.value);

        try {
            return await this.prisma.systemSetting.create({
                data: {
                    key: data.key,
                    value: data.value,
                    description: data.description,
                },
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                    'Key cấu hình đã tồn tại',
                );
            }

            throw error;
        }
    }

    // Cập nhật cấu hình đã tồn tại.
    async update(key: string, data: UpdateSettingDto) {
        const setting = await this.findOne(key);

        if (data.value !== undefined) {
            this.validateSetting(key, data.value);
        }

        return this.prisma.systemSetting.update({
            where: { key },
            data: {
                ...(data.value !== undefined
                    ? { value: data.value }
                    : {}),
                ...(data.description !== undefined
                    ? { description: data.description }
                    : {}),
            },
        });
    }

    // Xóa cấu hình theo key.
    async remove(key: string) {
        await this.findOne(key);

        return this.prisma.systemSetting.delete({
            where: { key },
        });
    }
}