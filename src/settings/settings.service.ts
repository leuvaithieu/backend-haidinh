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
import {
    UpdateBookingSettingsDto,
    UpdatePaymentSettingsDto,
} from './dto/update-booking-payment-settings.dto';

import { 
    Prisma,
    SystemSetting,
 } from '@prisma/client';

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
                key: 'PAYMENT_TRANSFER_ENABLED',
                value: 'false',
                description: 'Bật hoặc tắt thanh toán bằng chuyển khoản ngân hàng',
            },
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
            {
                key: 'PAYMENT_TRANSFER_CONTENT',
                value: 'HAIDINH',
                description: 'Tiền tố nội dung chuyển khoản mặc định',
            },
            {
                key: 'ONLINE_BOOKING_ENABLED',
                value: 'true',
                description: 'Bật hoặc tắt chức năng đặt vé trực tuyến',
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

    // Lấy toàn bộ cấu hình đặt vé để hiển thị trên trang quản trị.
    async getBookingSettings() {
        const keys = [
            'ONLINE_BOOKING_ENABLED',
            'BOOKING_HOLD_MINUTES',
            'MIN_DEPOSIT_AMOUNT',
        ];

        const settings = await this.prisma.systemSetting.findMany({
            where: {
                key: { in: keys },
            },
        });

        const values = Object.fromEntries(
            settings.map((setting) => [setting.key, setting.value]),
        );

        return {
            onlineBookingEnabled:
                values['ONLINE_BOOKING_ENABLED'] === 'true',
            bookingHoldMinutes: Number(
                values['BOOKING_HOLD_MINUTES'] ?? 20,
            ),
            minDepositAmount: Number(
                values['MIN_DEPOSIT_AMOUNT'] ?? 300000,
            ),
        };
    }

    // Lấy cấu hình thanh toán để hiển thị trên trang quản trị.
    async getPaymentSettings() {
        const keys = [
            'PAYMENT_TRANSFER_ENABLED',
            'PAYMENT_BANK_NAME',
            'PAYMENT_BANK_CODE',
            'PAYMENT_ACCOUNT_NUMBER',
            'PAYMENT_ACCOUNT_NAME',
            'PAYMENT_TRANSFER_CONTENT',
            'PAYMENT_REVIEW_TIMEOUT_MINUTES',
        ];

        const settings = await this.prisma.systemSetting.findMany({
            where: {
                key: { in: keys },
            },
        });

        const values = Object.fromEntries(
            settings.map((setting) => [setting.key, setting.value]),
        );

        return {
            transferEnabled:
                values['PAYMENT_TRANSFER_ENABLED'] === 'true',
            bankName: values['PAYMENT_BANK_NAME'] ?? '',
            bankCode: values['PAYMENT_BANK_CODE'] ?? '',
            bankAccountNumber: values['PAYMENT_ACCOUNT_NUMBER'] ?? '',
            bankAccountName: values['PAYMENT_ACCOUNT_NAME'] ?? '',
            transferContent: values['PAYMENT_TRANSFER_CONTENT'] ?? 'HAIDINH',
            paymentReviewTimeoutMinutes: Number(
                values['PAYMENT_REVIEW_TIMEOUT_MINUTES'] ?? 30,
            ),
        };
    }

    // Cập nhật nhóm cấu hình đặt vé trong một lần lưu.
    async updateBookingSettings(data: UpdateBookingSettingsDto) {
        const settings = [
            {
                key: 'ONLINE_BOOKING_ENABLED',
                value: data.onlineBookingEnabled,
                description: 'Bật hoặc tắt chức năng đặt vé trực tuyến',
            },
            {
                key: 'BOOKING_HOLD_MINUTES',
                value: data.bookingHoldMinutes,
                description: 'Thời gian giữ ghế khi khách đặt vé (phút)',
            },
            {
                key: 'MIN_DEPOSIT_AMOUNT',
                value: data.minDepositAmount,
                description: 'Số tiền đặt cọc tối thiểu khi khách đặt vé (VND)',
            },
        ];

        const results: SystemSetting[] = [];

        for (const setting of settings) {
            if (setting.value === undefined) {
                continue;
            }

            const value = String(setting.value);

            this.validateSetting(setting.key, value);

            const result = await this.prisma.systemSetting.upsert({
                where: { key: setting.key },
                update: {
                    value,
                    description: setting.description,
                },
                create: {
                    key: setting.key,
                    value,
                    description: setting.description,
                },
            });

            results.push(result);
        }

        return results;
    }

    // Cập nhật nhóm cấu hình thanh toán trong một lần lưu.
    async updatePaymentSettings(data: UpdatePaymentSettingsDto) {
        const settings = [
            {
                key: 'PAYMENT_TRANSFER_ENABLED',
                value: data.transferEnabled,
                description: 'Bật hoặc tắt thanh toán bằng chuyển khoản ngân hàng',
            },
            {
                key: 'PAYMENT_BANK_NAME',
                value: data.bankName,
                description: 'Tên ngân hàng nhận tiền vé',
            },
            {
                key: 'PAYMENT_BANK_CODE',
                value: data.bankCode,
                description: 'Mã ngân hàng theo chuẩn VietQR',
            },
            {
                key: 'PAYMENT_ACCOUNT_NUMBER',
                value: data.bankAccountNumber,
                description: 'Số tài khoản ngân hàng nhận tiền vé',
            },
            {
                key: 'PAYMENT_ACCOUNT_NAME',
                value: data.bankAccountName,
                description: 'Tên chủ tài khoản ngân hàng nhận tiền vé',
            },
            {
                key: 'PAYMENT_TRANSFER_CONTENT',
                value: data.transferContent,
                description: 'Nội dung chuyển khoản mặc định',
            },
            {
                key: 'PAYMENT_REVIEW_TIMEOUT_MINUTES',
                value: data.paymentReviewTimeoutMinutes,
                description: 'Thời hạn xử lý giao dịch thanh toán (phút)',
            },
        ];

        const results: SystemSetting[] = [];

        for (const setting of settings) {
            if (setting.value === undefined) {
                continue;
            }

            const value = String(setting.value);

            this.validateSetting(setting.key, value);

            const result = await this.prisma.systemSetting.upsert({
                where: { key: setting.key },
                update: {
                    value,
                    description: setting.description,
                },
                create: {
                    key: setting.key,
                    value,
                    description: setting.description,
                },
            });

            results.push(result);
        }

        return results;
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

        if (
            key === 'PAYMENT_TRANSFER_ENABLED' ||
            key === 'ONLINE_BOOKING_ENABLED'
        ) {
            if (!['true', 'false'].includes(value)) {
                throw new BadRequestException(
                    'Giá trị cấu hình chỉ được là true hoặc false',
                );
            }
        }

        if (key === 'PAYMENT_BANK_NAME' && !value.trim()) {
            throw new BadRequestException(
                'Tên ngân hàng không được để trống',
            );
        }

        if (key === 'PAYMENT_BANK_CODE') {
            if (!/^[A-Za-z0-9]{3,20}$/.test(value.trim())) {
                throw new BadRequestException(
                    'Mã ngân hàng không hợp lệ',
                );
            }
        }

        if (key === 'PAYMENT_ACCOUNT_NUMBER') {
            if (!/^[0-9]{5,30}$/.test(value.trim())) {
                throw new BadRequestException(
                    'Số tài khoản ngân hàng không hợp lệ',
                );
            }
        }

        if (key === 'PAYMENT_ACCOUNT_NAME' && !value.trim()) {
            throw new BadRequestException(
                'Tên chủ tài khoản không được để trống',
            );
        }

        if (key === 'PAYMENT_TRANSFER_CONTENT') {
            if (!value.trim() || value.length > 100) {
                throw new BadRequestException(
                    'Nội dung chuyển khoản phải từ 1 đến 100 ký tự',
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
        const protectedKeys = [
            'BOOKING_HOLD_MINUTES',
            'MIN_DEPOSIT_AMOUNT',
            'PAYMENT_REVIEW_TIMEOUT_MINUTES',
            'PAYMENT_TRANSFER_ENABLED',
            'PAYMENT_BANK_NAME',
            'PAYMENT_BANK_CODE',
            'PAYMENT_ACCOUNT_NUMBER',
            'PAYMENT_ACCOUNT_NAME',
            'PAYMENT_TRANSFER_CONTENT',
            'ONLINE_BOOKING_ENABLED',
        ];
        if (protectedKeys.includes(key)) {
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