
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { randomBytes } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';

import { PricingService } from '../pricing/pricing.service';

@Injectable()
export class BookingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly settingsService: SettingsService,
        private readonly pricingService: PricingService,
    ) {}

    // Tạo booking và giữ ghế theo từng đoạn đường trong một transaction.
    async create(dto: CreateBookingDto) {
        const now = new Date();

        const holdMinutes =
            await this.settingsService.getNumberValue(
                'BOOKING_HOLD_MINUTES',
                20,
            )
        ;

        // Lấy mức đặt cọc tối thiểu hiện tại từ cấu hình hệ thống.
        const minDepositAmount =
            await this.settingsService.getNumberValue(
                'MIN_DEPOSIT_AMOUNT',
                300000,
            )
        ;
        const holdExpiresAt = new Date(
            now.getTime() + holdMinutes * 60 * 1000,
        );

        try {
            return await this.prisma.$transaction(
                async (tx) => {
                    // 1. Lấy thông tin chuyến, xe và sơ đồ ghế.
                    const trip = await tx.trip.findUnique({
                        where: {
                            id: dto.tripId,
                        },
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
                        throw new NotFoundException(
                            'Không tìm thấy chuyến xe',
                        );
                    }

                    if (trip.status !== 'SCHEDULED') {
                        throw new BadRequestException(
                            'Chuyến xe hiện không nhận đặt vé',
                        );
                    }

                    // 2. Kiểm tra sơ đồ ghế của xe.
                    const layout = trip.vehicle.seatLayout;

                    if (
                        !layout ||
                        layout.status !== 'ACTIVE' ||
                        layout.isTemplate
                    ) {
                        throw new BadRequestException(
                            'Xe chưa có sơ đồ ghế đang hoạt động',
                        );
                    }

                    const activeSeats = layout.seats.filter(
                        (seat) => seat.isActive,
                    );

                    const activeSeatIds = new Set(
                        activeSeats.map((seat) => seat.id),
                    );

                    const requestedSeatIds = dto.seats.map(
                        (seat) => seat.seatId,
                    );

                    const invalidSeatIds = requestedSeatIds.filter(
                        (seatId) => !activeSeatIds.has(seatId),
                    );

                    if (invalidSeatIds.length > 0) {
                        throw new BadRequestException(
                            `Ghế không hợp lệ: ${invalidSeatIds.join(', ')}`,
                        );
                    }

                    // 3. Lấy các điểm đón và trả thuộc đúng chuyến, đúng chiều.
                    const requestedPointIds = [
                        ...new Set(
                            dto.seats.flatMap((seat) => [
                                seat.pickupTripRoutePointId,
                                seat.dropoffTripRoutePointId,
                            ]),
                        ),
                    ];

                    // Lấy danh sách ServicePoint được khách chọn, loại bỏ ID trùng lặp.
                    const requestedServicePointIds = [
                        ...new Set(
                            dto.seats.flatMap((seat) => [
                                seat.pickupServicePointId,
                                seat.dropoffServicePointId,
                            ].filter((id): id is string => Boolean(id))),
                        ),
                    ];

                    const tripRoutePoints =
                        await tx.tripRoutePoint.findMany({
                            where: {
                                tripId: trip.id,
                                direction: dto.direction,
                                id: {
                                    in: requestedPointIds,
                                },
                            },
                            select: {
                                id: true,
                                sequence: true,
                                routePointId: true,
                            },
                        });

                    if (
                        tripRoutePoints.length !==
                        requestedPointIds.length
                    ) {
                        throw new BadRequestException(
                            'Điểm đón hoặc điểm trả không thuộc lịch trình của chuyến hoặc sai chiều',
                        );
                    }

                    const pointMap = new Map(
                        tripRoutePoints.map((point) => [
                            point.id,
                            point,
                        ]),
                    );

                    // Lấy thông tin các ServicePoint được khách lựa chọn.
                    const servicePoints = await tx.servicePoint.findMany({
                        where: {
                            id: {
                                in: requestedServicePointIds,
                            },
                        },
                        select: {
                            id: true,
                            routePointId: true,
                        },
                    });

                    // Tạo bản đồ tra cứu ServicePoint theo ID.
                    const servicePointMap = new Map(
                        servicePoints.map((point) => [point.id, point]),
                    );

                    // Kiểm tra tất cả ServicePoint được gửi lên có tồn tại.
                    if (servicePoints.length !== requestedServicePointIds.length) {
                        throw new BadRequestException(
                            'Có điểm dịch vụ đón hoặc trả không tồn tại',
                        );
                    }

                    // Kiểm tra điểm đón phải đứng trước điểm trả.
                    for (const seat of dto.seats) {
                        const pickup = pointMap.get(
                            seat.pickupTripRoutePointId,
                        );

                        const dropoff = pointMap.get(
                            seat.dropoffTripRoutePointId,
                        );

                        if (
                            !pickup ||
                            !dropoff ||
                            pickup.sequence >= dropoff.sequence
                        ) {
                            throw new BadRequestException(
                                'Điểm đón phải nằm trước điểm trả',
                            );
                        }

                        // Đảm bảo điểm đón và trả trong lịch trình có liên kết RoutePoint hợp lệ.
                        if (!pickup.routePointId || !dropoff.routePointId) {
                            throw new BadRequestException(
                                'Lịch trình chuyến xe có điểm đón hoặc điểm trả chưa được liên kết với tuyến đường',
                            );
                        }

                        // Kiểm tra ServicePoint phải thuộc đúng RoutePoint đã chọn.
                        const pickupServicePoint = seat.pickupServicePointId
                            ? servicePointMap.get(seat.pickupServicePointId)
                            : null;

                        const dropoffServicePoint = seat.dropoffServicePointId
                            ? servicePointMap.get(seat.dropoffServicePointId)
                            : null;

                        if (
                            pickupServicePoint &&
                            pickupServicePoint.routePointId !== pickup.routePointId
                        ) {
                            throw new BadRequestException(
                                'Điểm dịch vụ đón không thuộc điểm tuyến đã chọn',
                            );
                        }

                        if (
                            dropoffServicePoint &&
                            dropoffServicePoint.routePointId !== dropoff.routePointId
                        ) {
                            throw new BadRequestException(
                                'Điểm dịch vụ trả không thuộc điểm tuyến đã chọn',
                            );
                        }
                    }

                    // Tính giá vé riêng cho từng ghế theo hành trình đã chọn.
                    const pricedSeats: Array<{
                        seatDto: (typeof dto.seats)[number];
                        price: number;
                        priceSnapshot: Awaited<
                            ReturnType<PricingService['calculatePrice']>
                        >;
                    }> = [];

                    for (const seatDto of dto.seats) {
                        const priceSnapshot = await this.pricingService.calculatePrice({
                            tripId: trip.id,
                            direction: dto.direction,
                            pickupTripRoutePointId: seatDto.pickupTripRoutePointId,
                            dropoffTripRoutePointId: seatDto.dropoffTripRoutePointId,
                            pickupServicePointId: seatDto.pickupServicePointId,
                            dropoffServicePointId: seatDto.dropoffServicePointId,
                            tx,
                        });

                        if (priceSnapshot.finalPrice === null) {
                            throw new BadRequestException(
                                'Hành trình này chưa có giá vé trực tuyến. Vui lòng liên hệ nhân viên để được hỗ trợ.',
                            );
                        }

                        pricedSeats.push({
                            seatDto,
                            price: priceSnapshot.finalPrice,
                            priceSnapshot,
                        });
                    }

                    // 4. Khởi tạo TripSeat nếu ghế chưa có trong chuyến.
                    await tx.tripSeat.createMany({
                        data: activeSeats.map((seat) => ({
                            tripId: trip.id,
                            seatId: seat.id,
                            status: 'AVAILABLE',
                        })),
                        skipDuplicates: true,
                    });

                    // Lấy các TripSeat tương ứng với ghế khách chọn.
                    const tripSeats = await tx.tripSeat.findMany({
                        where: {
                            tripId: trip.id,
                            seatId: {
                                in: requestedSeatIds,
                            },
                        },
                    });

                    const tripSeatMap = new Map(
                        tripSeats.map((seat) => [
                            seat.seatId,
                            seat,
                        ]),
                    );

                    if (
                        tripSeats.length !== requestedSeatIds.length
                    ) {
                        throw new ConflictException(
                            'Không thể khởi tạo trạng thái ghế cho chuyến',
                        );
                    }

                   // Khóa các ghế theo thứ tự ID cố định để tránh hai transaction khóa ngược thứ tự.
                    const sortedTripSeatIds = tripSeats
                        .map((seat) => seat.id)
                        .sort();

                    await tx.$queryRaw<Array<{ id: string }>>`
                        SELECT "id"
                        FROM "TripSeat"
                        WHERE "id" IN (${Prisma.join(sortedTripSeatIds)})
                        ORDER BY "id"
                        FOR UPDATE
                    `;

                    // 5. Xử lý các booking đã hết hạn trước khi giữ ghế mới.
                    // PAYMENT_REVIEW và CONFIRMED không được tự động giải phóng.
                    const expiredBookings = await tx.booking.findMany({
                        where: {
                            tripId: trip.id,
                            direction: dto.direction,
                            status: 'PENDING',
                            paymentStatus: {
                                in: ['UNPAID', 'FAILED', 'REJECTED'],
                            },
                            holdExpiresAt: {
                                lte: now,
                            },
                        },
                        select: {
                            id: true,
                            seats: {
                                select: {
                                    seatAllocationId: true,
                                },
                            },
                        },
                    });

                    for (const expiredBooking of expiredBookings) {
                        const expiredBookingResult =
                            await tx.booking.updateMany({
                                where: {
                                    id: expiredBooking.id,
                                    status: 'PENDING',
                                    paymentStatus: {
                                        in: ['UNPAID', 'FAILED', 'REJECTED'],
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

                        if (expiredBookingResult.count !== 1) {
                            continue;
                        }

                        const allocationIds =
                            expiredBooking.seats.map(
                                (seat) => seat.seatAllocationId,
                            );

                        if (allocationIds.length > 0) {
                            await tx.seatAllocation.updateMany({
                                where: {
                                    id: {
                                        in: allocationIds,
                                    },
                                    status: 'HELD',
                                },
                                data: {
                                    status: 'EXPIRED',
                                    holdExpiresAt: null,
                                },
                            });
                        }
                    }

                    // 6. Tạo booking.
                    const bookingCode =
                        `HD-${Date.now()}-${randomBytes(3)
                            .toString('hex')
                            .toUpperCase()}`
                    ;

                    // Tính tổng tiền booking từ giá vé riêng của từng ghế.
                    const totalAmount = pricedSeats.reduce(
                        (total, item) => total + item.price,
                        0,
                    );

                    // Mức cọc áp dụng không vượt quá tổng tiền vé của booking.
                    const requiredDepositAmount = Math.min(
                        minDepositAmount,
                        totalAmount,
                    );
                    const booking = await tx.booking.create({
                        data: {
                            bookingCode,
                            tripId: trip.id,
                            customerId: dto.customerId,
                            customerName: dto.customerName,
                            customerPhone: dto.customerPhone,
                            customerEmail: dto.customerEmail,
                            direction: dto.direction,
                            totalAmount,
                            depositAmount: requiredDepositAmount,
                            paidAmount: 0,
                            status: 'PENDING',
                            paymentStatus: 'UNPAID',
                            holdExpiresAt,
                        },
                    });

                    // 7. Tạo SeatAllocation và BookingSeat cho từng ghế.
                    const createdSeats: {
                        bookingSeatId: string;
                        seatId: string;
                        pickupSequence: number;
                        dropoffSequence: number;
                        price: number;
                    }[] = [];

                    for (const pricedSeat of pricedSeats) {
                        const seatDto = pricedSeat.seatDto;
                        const tripSeat = tripSeatMap.get(
                            seatDto.seatId,
                        );

                        if (!tripSeat) {
                            throw new ConflictException(
                                `Không tìm thấy ghế ${seatDto.seatId}`,
                            );
                        }

                        const pickup = pointMap.get(
                            seatDto.pickupTripRoutePointId,
                        )!;

                        const dropoff = pointMap.get(
                            seatDto.dropoffTripRoutePointId,
                        )!;

                        // Tạo lượt phân bổ ghế theo chiều và khoảng đường.
                        const allocation =
                            await tx.seatAllocation.create({
                                data: {
                                    tripSeatId: tripSeat.id,
                                    direction: dto.direction,
                                    pickupSequence: pickup.sequence,
                                    dropoffSequence: dropoff.sequence,
                                    status: 'HELD',
                                    holdExpiresAt,
                                },
                            });

                        // Lưu thông tin hành khách và liên kết với SeatAllocation.
                        const bookingSeat =
                            await tx.bookingSeat.create({
                                data: {
                                    bookingId: booking.id,
                                    seatAllocationId: allocation.id,

                                    price: pricedSeat.price,
                                    pricePolicyId: pricedSeat.priceSnapshot.policyId,

                                    pickupTripRoutePointId: pickup.id,
                                    dropoffTripRoutePointId: dropoff.id,
                                    pickupRoutePointId: pickup.routePointId,
                                    dropoffRoutePointId: dropoff.routePointId,

                                    passengerName: seatDto.passengerName,
                                    passengerPhone: seatDto.passengerPhone,

                                    priceSnapshot: JSON.parse(
                                        JSON.stringify(pricedSeat.priceSnapshot),
                                    ) as Prisma.InputJsonValue,

                                    pickupServicePointId:
                                        seatDto.pickupServicePointId ?? null,

                                    dropoffServicePointId:
                                        seatDto.dropoffServicePointId ?? null,
                                },
                            });

                        createdSeats.push({
                            bookingSeatId: bookingSeat.id,
                            seatId: seatDto.seatId,
                            pickupSequence: pickup.sequence,
                            dropoffSequence: dropoff.sequence,
                            price: bookingSeat.price,
                        });
                    }

                    // 8. Trả kết quả booking vừa tạo.
                    return {
                        message: 'Giữ ghế thành công',
                        booking: {
                            id: booking.id,
                            bookingCode: booking.bookingCode,
                            tripId: booking.tripId,
                            direction: booking.direction,
                            customerName: booking.customerName,
                            customerPhone: booking.customerPhone,
                            seats: createdSeats,
                            totalAmount: booking.totalAmount,
                            status: booking.status,
                            paymentStatus: booking.paymentStatus,
                            holdExpiresAt: booking.holdExpiresAt,
                        },
                    };
                },
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                },
            );
        } catch (error) {
            // Chuyển lỗi xung đột transaction hoặc trùng đoạn ghế thành lỗi nghiệp vụ.
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                ['P2004', 'P2034'].includes(error.code)
            ) {
                throw new ConflictException(
                    'Ghế vừa được khách khác giữ trên đoạn đường này. Vui lòng chọn ghế hoặc hành trình khác.',
                );
            }

            throw error;
        }
    }

    // Lấy chi tiết booking, bao gồm ghế, lượt phân bổ, chuyến và xe.
    async findOne(id: string) {
        const booking = await this.prisma.booking.findUnique({
            where: {
                id,
            },
            include: {
                seats: {
                    include: {
                        seatAllocation: {
                            include: {
                                tripSeat: {
                                    include: {
                                        seat: true,
                                    },
                                },
                            },
                        },
                        pickupTripRoutePoint: true,
                        dropoffTripRoutePoint: true,
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
            throw new NotFoundException(
                'Không tìm thấy booking',
            );
        }

        return booking;
    }

    
    // Lấy danh sách booking theo bộ lọc và phân trang.
    async findAll(query: QueryBookingDto) {
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(
            100,
            Math.max(1, Number(query.limit) || 20),
        );

        const skip = (page - 1) * limit;

        const where: Prisma.BookingWhereInput = {
            ...(query.tripId && {
                tripId: query.tripId,
            }),

            ...(query.customerPhone && {
                customerPhone: {
                    contains: query.customerPhone,
                },
            }),

            ...(query.bookingCode && {
                bookingCode: {
                    contains: query.bookingCode,
                    mode: 'insensitive',
                },
            }),

            ...(query.status && {
                status: query.status,
            }),

            ...(query.paymentStatus && {
                paymentStatus: query.paymentStatus,
            }),
        };

        const [items, total] = await this.prisma.$transaction([
            this.prisma.booking.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    createdAt: 'desc',
                },
                include: {
                    trip: {
                        include: {
                            route: true,
                            vehicle: true,
                        },
                    },
                    seats: {
                        include: {
                            seatAllocation: {
                                include: {
                                    tripSeat: {
                                        include: {
                                            seat: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),

            this.prisma.booking.count({
                where,
            }),
        ]);

        return {
            data: items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }


    // Hủy booking chưa thanh toán và giải phóng các SeatAllocation đang giữ.
    async cancel(id: string) {
        return this.prisma.$transaction(async (tx) => {
            const booking = await tx.booking.findUnique({
                where: {
                    id,
                },
                include: {
                    seats: {
                        select: {
                            seatAllocationId: true,
                        },
                    },
                },
            });

            if (!booking) {
                throw new NotFoundException(
                    'Không tìm thấy booking',
                );
            }

            if (booking.status !== 'PENDING') {
                throw new BadRequestException(
                    'Chỉ có thể hủy booking đang chờ xử lý',
                );
            }

            if (
                !['UNPAID', 'FAILED', 'REJECTED'].includes(
                    booking.paymentStatus,
                )
            ) {
                throw new BadRequestException(
                    'Booking đã có giao dịch thanh toán cần xử lý. Không thể tự động hủy.',
                );
            }

            // Chuyển booking sang trạng thái CANCELLED.
            const cancelled = await tx.booking.updateMany({
                where: {
                    id,
                    status: 'PENDING',
                    paymentStatus: {
                        in: ['UNPAID', 'FAILED', 'REJECTED'],
                    },
                },
                data: {
                    status: 'CANCELLED',
                    holdExpiresAt: null,
                },
            });

            if (cancelled.count !== 1) {
                throw new ConflictException(
                    'Booking đã được xử lý bởi một yêu cầu khác',
                );
            }

            // Giải phóng các lượt phân bổ ghế vẫn đang HELD.
            const allocationIds = booking.seats.map(
                (seat) => seat.seatAllocationId,
            );

            if (allocationIds.length > 0) {
                await tx.seatAllocation.updateMany({
                    where: {
                        id: {
                            in: allocationIds,
                        },
                        status: 'HELD',
                    },
                    data: {
                        status: 'RELEASED',
                        holdExpiresAt: null,
                    },
                });
            }

            return {
                message: 'Hủy booking thành công',
                bookingId: id,
                status: 'CANCELLED',
            };
        });
    }

    // Tự động hết hạn booking chưa thanh toán và giải phóng SeatAllocation.
    @Cron(CronExpression.EVERY_MINUTE)
    async expireHeldBookings() {
        const now = new Date();

        const expiredBookings = await this.prisma.booking.findMany({
            where: {
                status: 'PENDING',
                paymentStatus: {
                    in: ['UNPAID', 'FAILED', 'REJECTED'],
                },
                holdExpiresAt: {
                    lte: now,
                },
            },
            select: {
                id: true,
                seats: {
                    select: {
                        seatAllocationId: true,
                    },
                },
            },
        });

        for (const booking of expiredBookings) {
            await this.prisma.$transaction(async (tx) => {
                // Chỉ một tiến trình được phép chuyển booking sang EXPIRED.
                const result = await tx.booking.updateMany({
                    where: {
                        id: booking.id,
                        status: 'PENDING',
                        paymentStatus: {
                            in: ['UNPAID', 'FAILED', 'REJECTED'],
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

                if (result.count !== 1) {
                    return;
                }

                // Chỉ giải phóng các lượt phân bổ đang HELD.
                const allocationIds = booking.seats.map(
                    (seat) => seat.seatAllocationId,
                );

                if (allocationIds.length > 0) {
                    await tx.seatAllocation.updateMany({
                        where: {
                            id: {
                                in: allocationIds,
                            },
                            status: 'HELD',
                        },
                        data: {
                            status: 'EXPIRED',
                            holdExpiresAt: null,
                        },
                    });
                }
            });
        }
    }
}
