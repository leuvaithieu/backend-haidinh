
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class BookingService {
    constructor(private readonly prisma: PrismaService) {}

    // Tạo booking mới, kiểm tra giá vé và giữ các ghế được khách chọn trong 10 phút.
    async create(dto: CreateBookingDto) {
        const now = new Date();
        const holdExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);

        return this.prisma.$transaction(async (tx) => {
        // 1. Lấy chuyến, xe, sơ đồ ghế và giá vé
        const trip = await tx.trip.findUnique({
            where: { id: dto.tripId },
            include: {
            vehicle: {
                include: {
                seatLayout: {
                    include: {
                    seats: true,
                    },
                },
                },
            },
            },
        });

        if (!trip) {
            throw new NotFoundException('Không tìm thấy chuyến xe');
        }

        // Chỉ cho phép đặt vé khi chuyến vẫn đang ở trạng thái chờ khởi hành.
        if (trip.status !== 'SCHEDULED') {
            throw new BadRequestException(
                'Chuyến xe hiện không nhận đặt vé',
            );
        }

        if (trip.ticketPrice <= 0) {
            throw new BadRequestException(
            'Chuyến xe chưa được cấu hình giá vé',
            );
        }

        const layout = trip.vehicle.seatLayout;

        if (!layout || layout.status !== 'ACTIVE' || layout.isTemplate) {
            throw new BadRequestException(
            'Xe chưa có sơ đồ ghế đang hoạt động',
            );
        }

        // 2. Chỉ nhận những ghế đang hoạt động trong sơ đồ xe
        const activeSeats = layout.seats.filter((seat) => seat.isActive);
        const activeSeatIds = new Set(activeSeats.map((seat) => seat.id));

        const invalidSeatIds = dto.seatIds.filter(
            (seatId) => !activeSeatIds.has(seatId),
        );

        if (invalidSeatIds.length > 0) {
            throw new BadRequestException(
            `Ghế không hợp lệ: ${invalidSeatIds.join(', ')}`,
            );
        }

        // 3. Khởi tạo trạng thái ghế cho chuyến nếu chưa có
        await tx.tripSeat.createMany({
            data: activeSeats.map((seat) => ({
            tripId: trip.id,
            seatId: seat.id,
            status: 'AVAILABLE',
            })),
            skipDuplicates: true,
        });

        // 4. Đánh dấu booking giữ ghế cũ đã hết hạn
        await tx.booking.updateMany({
            where: {
            tripId: trip.id,
            status: 'PENDING',
            holdExpiresAt: { lte: now },
            },
            data: {
            status: 'EXPIRED',
            },
        });

        // 5. Tạo booking tạm trong transaction
        const bookingCode =
            `HD-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;

        const totalAmount = dto.seatIds.length * trip.ticketPrice;

        const booking = await tx.booking.create({
            data: {
            bookingCode,
            tripId: trip.id,
            customerId: dto.customerId,
            customerName: dto.customerName,
            customerPhone: dto.customerPhone,
            customerEmail: dto.customerEmail,
            totalAmount,
            depositAmount: 0,
            paidAmount: 0,
            status: 'PENDING',
            paymentStatus: 'UNPAID',
            holdExpiresAt,
            },
        });

        // 6. Giữ từng ghế bằng cập nhật có điều kiện.
        // Nếu khách khác đã giữ ghế, transaction sẽ bị hủy.
        const bookingSeats: {
            bookingId: string;
            tripSeatId: string;
            price: number;
        }[] = [];

        for (const seatId of dto.seatIds) {
            const tripSeat = await tx.tripSeat.findUnique({
            where: {
                tripId_seatId: {
                tripId: trip.id,
                seatId,
                },
            },
            });

            if (!tripSeat) {
            throw new ConflictException(
                `Không tìm thấy trạng thái ghế ${seatId}`,
            );
            }

            const result = await tx.tripSeat.updateMany({
            where: {
                id: tripSeat.id,
                OR: [
                { status: 'AVAILABLE' },
                {
                    status: 'HELD',
                    holdExpiresAt: { lte: now },
                },
                ],
            },
            data: {
                status: 'HELD',
                holdExpiresAt,
                heldByBookingId: booking.id,
                },
            });

            if (result.count !== 1) {
            throw new ConflictException(
                `Ghế ${seatId} đã được giữ hoặc đã bán`,
            );
            }

            bookingSeats.push({
            bookingId: booking.id,
            tripSeatId: tripSeat.id,
            price: trip.ticketPrice,
            });
        }

        // 7. Lưu danh sách ghế thuộc booking
        await tx.bookingSeat.createMany({
            data: bookingSeats,
        });

        return {
            message: 'Giữ ghế thành công',
            booking: {
            id: booking.id,
            bookingCode: booking.bookingCode,
            tripId: booking.tripId,
            customerName: booking.customerName,
            customerPhone: booking.customerPhone,
            seatIds: dto.seatIds,
            totalAmount: booking.totalAmount,
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            holdExpiresAt: booking.holdExpiresAt,
            },
        };
        });
    }

    // Lấy chi tiết booking theo ID, kèm thông tin ghế, chuyến và xe.
    async findOne(id: string) {
        const booking = await this.prisma.booking.findUnique({
        where: { id },
        include: {
            seats: {
            include: {
                tripSeat: {
                include: {
                    seat: true,
                },
                },
            },
            },
            trip: {
            include: {
                route: true,
                vehicle: true,
            },
            },
        },
        });

        if (!booking) {
        throw new NotFoundException('Không tìm thấy booking');
        }

        return booking;
    }
  
    // Hủy booking chưa thanh toán và giải phóng những ghế mà booking đó đang giữ.
    async cancel(id: string) {
        return this.prisma.$transaction(async (tx) => {
            const booking = await tx.booking.findUnique({
            where: { id },
            include: { seats: true },
            });

            if (!booking) {
            throw new NotFoundException('Không tìm thấy booking');
            }

            if (booking.status !== 'PENDING') {
            throw new BadRequestException(
                'Chỉ có thể hủy booking đang chờ xử lý',
            );
            }

            if (booking.paymentStatus === 'PAID') {
            throw new BadRequestException(
                'Booking đã thanh toán, cần xử lý hoàn tiền riêng',
            );
            }

            // Chỉ giải phóng ghế nếu ghế vẫn thuộc lượt giữ chỗ này.
            // Nếu ghế đã được khách khác giữ lại, không được giải phóng.
            if (booking.holdExpiresAt) {
            for (const item of booking.seats) {
                    await tx.tripSeat.updateMany({
                    where: {
                            id: item.tripSeatId,
                            status: 'HELD',
                            heldByBookingId: booking.id,
                        },
                        data: {
                            status: 'AVAILABLE',
                            holdExpiresAt: null,
                            heldByBookingId: null,
                        },
                    });
                }
            }

            const cancelled = await tx.booking.update({
                where: { id },
                data: {
                    status: 'CANCELLED',
                    holdExpiresAt: null,
                },
            });

            return {
                message: 'Hủy booking thành công',
                booking: cancelled,
            };
        });
    }

    // Tự động hết hạn booking chưa thanh toán và giải phóng các ghế do booking đó giữ.
    @Cron(CronExpression.EVERY_MINUTE)
    async expireHeldBookings() {
        const now = new Date();

        const expiredBookings = await this.prisma.booking.findMany({
            where: {
                status: 'PENDING',
                paymentStatus: {
                    in: ['UNPAID', 'FAILED'],
                },
                holdExpiresAt: {
                    lte: now,
                },
            },
            select: {
                id: true,
                holdExpiresAt: true,
                seats: {
                    select: {
                    tripSeatId: true,
                    },
                },
            },
        });

        for (const booking of expiredBookings) {
            if (!booking.holdExpiresAt) {
            continue;
            }

            await this.prisma.$transaction(async (tx) => {
            // Chỉ một tiến trình được quyền hết hạn booking này.
            const result = await tx.booking.updateMany({
                where: {
                    id: booking.id,
                    status: 'PENDING',
                    paymentStatus: {
                        in: ['UNPAID', 'FAILED'],
                    },
                    holdExpiresAt: {
                        lte: now,
                    },
                },
                data: {
                    status: 'EXPIRED',
                    holdExpiresAt: null,
                },
            });

            // Booking đã được xử lý hoặc thay đổi trạng thái.
            if (result.count !== 1) {
                return;
            }

            // Chỉ trả ghế nếu ghế vẫn còn ở trạng thái giữ chỗ
            // với thời hạn của booking đã hết hạn.
            for (const item of booking.seats) {
                await tx.tripSeat.updateMany({
                    where: {
                            id: item.tripSeatId,
                            status: 'HELD',
                            heldByBookingId: booking.id,
                        },
                        data: {
                            status: 'AVAILABLE',
                            holdExpiresAt: null,
                            heldByBookingId: null,
                        },
                    });
                }
            });
        }
    }


}
