
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CreateSeatLayoutDto } from './dto/create-seat-layout.dto';
import { UpdateSeatLayoutDto } from './dto/update-seat-layout.dto';
import { CreateSeatDto } from './dto/create-seat.dto';
import { UpdateSeatDto } from './dto/update-seat.dto';
import { CopySeatLayoutDto } from './dto/copy-seat-layout.dto';

@Injectable()
export class SeatLayoutService {
    constructor(private readonly prisma: PrismaService) {}

  
    // Kích hoạt sơ đồ ghế
    async activate(id: string) {
        const layout = await this.prisma.seatLayout.findUnique({
        where: { id },
        include: {
            vehicle: true,
            seats: {
            where: { isActive: true },
            },
        },
        });

        if (!layout) {
        throw new NotFoundException('Không tìm thấy sơ đồ ghế');
        }

        if (layout.seats.length === 0) {
        throw new BadRequestException(
            'Không thể kích hoạt sơ đồ chưa có ghế',
        );
        }

        if (
        layout.vehicle &&
        layout.seats.length !== layout.vehicle.seatCount
        ) {
        throw new BadRequestException(
            `Sơ đồ có ${layout.seats.length} ghế đang hoạt động, ` +
            `nhưng xe khai báo ${layout.vehicle.seatCount} ghế`,
        );
        }

        return this.prisma.seatLayout.update({
        where: { id },
        data: { status: 'ACTIVE' },
        include: {
            vehicle: true,
            _count: {
            select: { seats: true },
            },
        },
        });
    }

    // Lưu trữ sơ đồ
    async archive(id: string) {
        const layout = await this.prisma.seatLayout.findUnique({
        where: { id },
        });

        if (!layout) {
        throw new NotFoundException('Không tìm thấy sơ đồ ghế');
        }

        return this.prisma.seatLayout.update({
        where: { id },
        data: { status: 'ARCHIVED' },
        });
    }

    // =========================================
    // SEAT LAYOUT: CRUD
    // =========================================

    // GET: Danh sách sơ đồ
    async findAll() {
        return this.prisma.seatLayout.findMany({
        include: {
            vehicle: true,
            _count: {
            select: {
                seats: true,
            },
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
        });
    }

    // GET: Chi tiết sơ đồ và danh sách ghế
    async findOne(id: string) {
        const layout = await this.prisma.seatLayout.findUnique({
        where: { id },
        include: {
            vehicle: true,
            seats: {
            orderBy: [
                { level: 'asc' },
                { row: 'asc' },
                { column: 'asc' },
            ],
            },
        },
        });

        if (!layout) {
        throw new NotFoundException('Không tìm thấy sơ đồ ghế');
        }

        return layout;
    }

    // POST: Tạo sơ đồ
    async create(dto: CreateSeatLayoutDto) {
        const isTemplate = dto.isTemplate ?? false;

        if (isTemplate && dto.vehicleId) {
        throw new BadRequestException(
            'Sơ đồ mẫu không được gắn trực tiếp với xe',
        );
        }

        if (dto.vehicleId) {
        const vehicle = await this.prisma.vehicle.findUnique({
            where: { id: dto.vehicleId },
        });

        if (!vehicle) {
            throw new NotFoundException('Không tìm thấy xe');
        }

        const existingLayout = await this.prisma.seatLayout.findUnique({
            where: { vehicleId: dto.vehicleId },
        });

        if (existingLayout) {
            throw new ConflictException('Xe này đã có sơ đồ ghế');
        }
        }

        return this.prisma.seatLayout.create({
        data: {
            name: dto.name,
            description: dto.description,
            status: dto.status,
            isTemplate,
            vehicleId: dto.vehicleId,
        },
        include: {
            vehicle: true,
            seats: true,
        },
        });
    }

    // PATCH: Cập nhật thông tin sơ đồ
    async update(id: string, dto: UpdateSeatLayoutDto) {
        const layout = await this.prisma.seatLayout.findUnique({
        where: { id },
        });

        if (!layout) {
        throw new NotFoundException('Không tìm thấy sơ đồ ghế');
        }

        const nextIsTemplate = dto.isTemplate ?? layout.isTemplate;
        const nextVehicleId =
        dto.vehicleId !== undefined
            ? dto.vehicleId
            : layout.vehicleId;

        if (nextIsTemplate && nextVehicleId) {
        throw new BadRequestException(
            'Sơ đồ mẫu không được gắn trực tiếp với xe',
        );
        }

        if (nextVehicleId) {
        const vehicle = await this.prisma.vehicle.findUnique({
            where: { id: nextVehicleId },
        });

        if (!vehicle) {
            throw new NotFoundException('Không tìm thấy xe');
        }

        const existingLayout = await this.prisma.seatLayout.findUnique({
            where: { vehicleId: nextVehicleId },
        });

        if (existingLayout && existingLayout.id !== id) {
            throw new ConflictException(
            'Xe này đã có một sơ đồ ghế khác',
            );
        }
        }

        return this.prisma.seatLayout.update({
        where: { id },
        data: {
            name: dto.name,
            description: dto.description,
            status: dto.status,
            isTemplate: dto.isTemplate,
            vehicleId: dto.vehicleId,
        },
        include: {
            vehicle: true,
            seats: {
            orderBy: [
                { level: 'asc' },
                { row: 'asc' },
                { column: 'asc' },
            ],
            },
        },
        });
    }

    // DELETE: Xóa sơ đồ
    async remove(id: string) {
        const layout = await this.prisma.seatLayout.findUnique({
        where: { id },
        });

        if (!layout) {
        throw new NotFoundException('Không tìm thấy sơ đồ ghế');
        }

        await this.prisma.seatLayout.delete({
        where: { id },
        });

        return {
        message: 'Đã xóa sơ đồ ghế',
        id,
        };
    }

    // =========================================
    // SEAT: HELPER
    // =========================================

    private async ensureLayoutExists(layoutId: string) {
        const layout = await this.prisma.seatLayout.findUnique({
        where: { id: layoutId },
        });

        if (!layout) {
        throw new NotFoundException('Không tìm thấy sơ đồ ghế');
        }

        return layout;
    }

    private async ensureSeatExists(
        layoutId: string,
        seatId: string,
    ) {
        const seat = await this.prisma.seat.findFirst({
        where: {
            id: seatId,
            layoutId,
        },
        });

        if (!seat) {
        throw new NotFoundException(
            'Không tìm thấy ghế trong sơ đồ này',
        );
        }

        return seat;
    }

    private handleSeatError(error: unknown): never {
        if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
        ) {
        throw new ConflictException(
            'Mã ghế hoặc vị trí ghế đã tồn tại trong sơ đồ',
        );
        }

        throw error;
    }

    // =========================================
    // SEAT: CRUD
    // =========================================

    // GET: Danh sách ghế trong sơ đồ
    async findSeats(layoutId: string) {
        await this.ensureLayoutExists(layoutId);

        return this.prisma.seat.findMany({
        where: { layoutId },
        orderBy: [
            { level: 'asc' },
            { row: 'asc' },
            { column: 'asc' },
        ],
        });
    }

    // POST: Thêm ghế
    async createSeat(layoutId: string, dto: CreateSeatDto) {
        await this.ensureLayoutExists(layoutId);

        try {
        return await this.prisma.seat.create({
            data: {
            layoutId,
            code: dto.code,
            label: dto.label,
            type: dto.type,
            level: dto.level ?? 1,
            row: dto.row,
            column: dto.column,
            isActive: dto.isActive ?? true,
            },
        });
        } catch (error) {
        this.handleSeatError(error);
        }
    }

    // PATCH: Sửa ghế
    async updateSeat(
        layoutId: string,
        seatId: string,
        dto: UpdateSeatDto,
    ) {
        await this.ensureLayoutExists(layoutId);
        await this.ensureSeatExists(layoutId, seatId);

        try {
        return await this.prisma.seat.update({
            where: { id: seatId },
            data: {
            code: dto.code,
            label: dto.label,
            type: dto.type,
            level: dto.level,
            row: dto.row,
            column: dto.column,
            isActive: dto.isActive,
            },
        });
        } catch (error) {
        this.handleSeatError(error);
        }
    }

    // DELETE: Xóa ghế
    async removeSeat(layoutId: string, seatId: string) {
        await this.ensureLayoutExists(layoutId);
        await this.ensureSeatExists(layoutId, seatId);

        await this.prisma.seat.delete({
        where: { id: seatId },
        });

        return {
        message: 'Đã xóa ghế khỏi sơ đồ',
        id: seatId,
        };
    }

    // =========================================
    // SEAT LAYOUT: COPY TEMPLATE
    // =========================================

    // POST: Sao chép sơ đồ mẫu cho xe
    async copyTemplate(
        templateId: string,
        dto: CopySeatLayoutDto,
    ) {
        const template = await this.prisma.seatLayout.findUnique({
        where: { id: templateId },
        include: {
            seats: true,
        },
        });

        if (!template || !template.isTemplate) {
        throw new NotFoundException('Không tìm thấy sơ đồ mẫu');
        }

        const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: dto.vehicleId },
        });

        if (!vehicle) {
        throw new NotFoundException('Không tìm thấy xe');
        }

        const existingLayout = await this.prisma.seatLayout.findUnique({
        where: { vehicleId: dto.vehicleId },
        });

        if (existingLayout) {
        throw new ConflictException('Xe này đã có sơ đồ ghế');
        }

        if (template.seats.length !== vehicle.seatCount) {
        throw new BadRequestException(
            `Sơ đồ mẫu có ${template.seats.length} ghế, ` +
            `nhưng xe khai báo ${vehicle.seatCount} ghế`,
        );
        }

        return this.prisma.$transaction(async (tx) => {
        const newLayout = await tx.seatLayout.create({
            data: {
            name: dto.name ?? `${template.name} - ${vehicle.name}`,
            description: template.description,
            status: 'DRAFT',
            isTemplate: false,
            vehicleId: vehicle.id,
            copiedFromId: template.id,
            },
        });

        if (template.seats.length > 0) {
            await tx.seat.createMany({
            data: template.seats.map((seat) => ({
                layoutId: newLayout.id,
                code: seat.code,
                label: seat.label,
                type: seat.type,
                level: seat.level,
                row: seat.row,
                column: seat.column,
                isActive: seat.isActive,
            })),
            });
        }

        return tx.seatLayout.findUnique({
            where: { id: newLayout.id },
            include: {
            vehicle: true,
            seats: {
                orderBy: [
                { level: 'asc' },
                { row: 'asc' },
                { column: 'asc' },
                ],
            },
            },
        });
        });
    }
}
