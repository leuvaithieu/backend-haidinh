import {
    Injectable,
    OnModuleInit,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateSettingDto } from './dto/create-setting.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SettingsService implements OnModuleInit {
    constructor(private readonly prisma: PrismaService) {}

    // Tạo cấu hình mặc định nếu database chưa có cấu hình thời gian giữ ghế.
    async onModuleInit(): Promise<void> {
        await this.prisma.systemSetting.upsert({
            where: {
                key: 'BOOKING_HOLD_MINUTES',
            },
            update: {},
            create: {
                key: 'BOOKING_HOLD_MINUTES',
                value: '20',
                description: 'Thời gian giữ ghế khi khách đặt vé (phút)',
            },
        });

        await this.prisma.systemSetting.upsert({
            where: {
                key: 'MIN_DEPOSIT_AMOUNT',
            },
            update: {},
            create: {
                key: 'MIN_DEPOSIT_AMOUNT',
                value: '300000',
                description: 'Số tiền đặt cọc tối thiểu khi khách đặt vé (VND)',
            },
        });

        await this.prisma.systemSetting.upsert({
            where: {
                key: 'PAYMENT_REVIEW_TIMEOUT_MINUTES',
            },
            update: {},
            create: {
                key: 'PAYMENT_REVIEW_TIMEOUT_MINUTES',
                value: '30',
                description: 'Thời hạn xử lý giao dịch thanh toán sau khi khách báo chuyển khoản (phút)',
            },
        });

        // Khởi tạo cấu hình tài khoản ngân hàng nhận tiền vé.
        const bankSettings = [
            {
                key: 'PAYMENT_BANK_NAME',
                value: '',
                description: 'Tên ngân hàng nhận tiền vé',
            },
            {
                key: 'PAYMENT_BANK_CODE',
                value: '',
                description: 'Mã ngân hàng theo chuẩn VietQR',
            },
            {
                key: 'PAYMENT_ACCOUNT_NUMBER',
                value: '',
                description: 'Số tài khoản ngân hàng nhận tiền vé',
            },
            {
                key: 'PAYMENT_ACCOUNT_NAME',
                value: '',
                description: 'Tên chủ tài khoản ngân hàng nhận tiền vé',
            },
        ];

        for (const setting of bankSettings) {
            await this.prisma.systemSetting.upsert({
                where: {
                    key: setting.key,
                },
                update: {},
                create: setting,
            });
        }
    }

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

   // Lấy cấu hình dạng số không âm, dùng giá trị mặc định nếu dữ liệu không hợp lệ.
    async getNumberValue(
        key: string,
        defaultValue: number,
    ): Promise<number> {
        const value = await this.getValue(key);

        if (value === null || value.trim() === '') {
            return defaultValue;
        }

        const numberValue = Number(value);

        if (!Number.isInteger(numberValue) || numberValue < 0) {
            return defaultValue;
        }

        return numberValue;
    }

    // Kiểm tra tính hợp lệ của giá trị cấu hình theo từng key.
    private validateSetting(key: string, value: string): void {
        if (key === 'BOOKING_HOLD_MINUTES') {
            const minutes = Number(value);

            if (!Number.isInteger(minutes) || minutes <= 0) {
                throw new BadRequestException(
                    'Thời gian giữ ghế phải là số nguyên lớn hơn 0',
                );
            }
        }

        if (key === 'MIN_DEPOSIT_AMOUNT') {
            const amount = Number(value);

            if (!Number.isInteger(amount) || amount < 0) {
                throw new BadRequestException(
                    'Số tiền đặt cọc tối thiểu phải là số nguyên không âm',
                );
            }
        }

        if (key === 'PAYMENT_REVIEW_TIMEOUT_MINUTES') {
            const minutes = Number(value);

            if (!Number.isInteger(minutes) || minutes <= 0) {
                throw new BadRequestException(
                    'Thời hạn xác nhận thanh toán phải là số nguyên lớn hơn 0',
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
        await this.findOne(key);

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

    // Xóa cấu hình theo key, không cho phép xóa cấu hình giữ ghế mặc định.
    async remove(key: string) {
       if (
            key === 'BOOKING_HOLD_MINUTES' ||
            key === 'MIN_DEPOSIT_AMOUNT' ||
            key === 'PAYMENT_REVIEW_TIMEOUT_MINUTES'
        ) {
            throw new BadRequestException(
                'Không thể xóa cấu hình hệ thống mặc định',
            );
        }

        await this.findOne(key);

        return this.prisma.systemSetting.delete({
            where: { key },
        });
    }
}