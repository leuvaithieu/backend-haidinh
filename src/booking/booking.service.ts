
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';

import { randomBytes } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { CancelConfirmedBookingDto } from './dto/cancel-confirmed-booking.dto';
import { QueryBookingsByDateDto } from './dto/query-bookings-by-date.dto';

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
        // Kiểm tra hệ thống có đang cho phép khách đặt vé trực tuyến hay không.
        const onlineBookingEnabled =
            await this.settingsService.getValue('ONLINE_BOOKING_ENABLED');

        if (onlineBookingEnabled === 'false') {
            throw new ForbiddenException(
                'Hiện tại Hải Định tạm ngừng nhận đặt vé trực tuyến. Vui lòng liên hệ nhân viên.',
            );
        }

        const now = new Date();

        const holdMinutes =
            await this.settingsService.getNumberValue(
                'BOOKING_HOLD_MINUTES',
                20,
            )
        ;

        // Lấy mức đặt cọc tối thiểu do quản trị viên cấu hình.
        const minDepositAmount =
            await this.settingsService.getRequiredNumberValue(
                'MIN_DEPOSIT_AMOUNT',
            );
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

                    // Không cho phép một ghế xuất hiện nhiều lần trong cùng booking.
                    const uniqueSeatIds = new Set(requestedSeatIds);

                    if (uniqueSeatIds.size !== requestedSeatIds.length) {
                        throw new BadRequestException(
                            'Không được chọn một ghế nhiều lần trong cùng booking',
                        );
                    }

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
                            // Chuyển toàn bộ lượt phân bổ ghế đang HELD sang EXPIRED.
                            const expiredAllocations = await tx.seatAllocation.updateMany({
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

                            // Rollback transaction nếu không giải phóng được toàn bộ ghế.
                            if (expiredAllocations.count !== allocationIds.length) {
                                throw new ConflictException(
                                    'Không thể giải phóng toàn bộ ghế của Booking đã hết hạn.',
                                );
                            }
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

                    // Tính tiền cọc tối thiểu theo số vé trong booking, không vượt tổng tiền vé.
                    const requiredDepositAmount = Math.min(
                        minDepositAmount * pricedSeats.length,
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
                            depositAmount: booking.depositAmount,
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

              // Chuyển lỗi PostgreSQL 23P01 từ exclusion constraint thành HTTP 409.
            if (
                error instanceof Error &&
                error.message.includes('23P01') &&
                error.message.includes('seat_allocation_no_overlapping_segments')
            ) {
                throw new ConflictException(
                    'Ghế này đã được đặt hoặc giữ trên đoạn đường đã chọn. Vui lòng chọn ghế khác.',
                );
            }

            throw error;
        }
    }

    // Tra cứu thông tin thanh toán công khai bằng mã booking và số điện thoại người đặt.
    async findPublicBooking(bookingCode: string, customerPhone: string) {
        // Kiểm tra thông tin bắt buộc trước khi tra cứu booking công khai.
        if (
            typeof bookingCode !== 'string' ||
            typeof customerPhone !== 'string' ||
            !bookingCode.trim() ||
            !customerPhone.trim() ||
            bookingCode.trim().length > 50 ||
            customerPhone.trim().length > 20
        ) {
            throw new BadRequestException(
                'Vui lòng nhập mã đặt vé và số điện thoại hợp lệ.',
            );
        }

        const booking = await this.prisma.booking.findFirst({
            where: {
                bookingCode: bookingCode.trim(),
                customerPhone: customerPhone.trim(),
            },
            select: {
                id: true,
                bookingCode: true,
                customerName: true,
                customerPhone: true,
                totalAmount: true,
                depositAmount: true,
                paidAmount: true,
                status: true,
                paymentStatus: true,
                holdExpiresAt: true,
                direction: true,

                // Thông tin chuyến xe.
                trip: {
                    select: {
                        plannedDeparture: true,
                        plannedArrival: true,
                        route: {
                            select: {
                                name: true,
                            },
                        },
                        vehicle: {
                            select: {
                                name: true,
                                licensePlate: true,
                            },
                        },
                    },
                },

                // Danh sách ghế và vé tương ứng.
                seats: {
                    select: {
                        id: true,
                        price: true,
                        passengerName: true,
                        passengerPhone: true,

                        // Thông tin vé và mã QR.
                        ticket: {
                            select: {
                                ticketCode: true,
                                qrToken: true,
                                status: true,
                                issuedAt: true,
                                checkedInAt: true,
                                cancelledAt: true,
                            },
                        },

                        // Thông tin ghế.
                        seatAllocation: {
                            select: {
                                tripSeat: {
                                    select: {
                                        seat: {
                                            select: {
                                                code: true,
                                                label: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },

                        // Điểm đón và điểm trả.
                        pickupTripRoutePoint: {
                            select: {
                                pointName: true,
                                plannedTime: true,
                            },
                        },

                        dropoffTripRoutePoint: {
                            select: {
                                pointName: true,
                                plannedTime: true,
                            },
                        },
                    },
                },
            },
        });

        if (!booking) {
            throw new NotFoundException(
                'Không tìm thấy booking hoặc thông tin tra cứu không chính xác.',
            );
        }

        return booking;
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
        // Chuẩn hóa số trang thành số nguyên hợp lệ.
        const requestedPage = Number(query.page);
        const page =
            Number.isSafeInteger(requestedPage) && requestedPage > 0
                ? requestedPage
                : 1;

        // Chuẩn hóa giới hạn bản ghi, mặc định 20 và tối đa 100.
        const requestedLimit = Number(query.limit);
        const limit =
            Number.isSafeInteger(requestedLimit) && requestedLimit > 0
                ? Math.min(requestedLimit, 100)
                : 20;

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


    // Lấy các chuyến khởi hành trong ngày và phân nhóm booking theo chiều đi/về.
    async findByDate(query: QueryBookingsByDateDto) {
        // Kiểm tra ngày có đúng định dạng lịch YYYY-MM-DD hay không.
        const dateCheck = new Date(`${query.date}T00:00:00.000Z`);

        if (
            Number.isNaN(dateCheck.getTime()) ||
            dateCheck.toISOString().slice(0, 10) !== query.date
        ) {
            throw new BadRequestException('Ngày không hợp lệ');
        }

        // Tạo khoảng thời gian trong ngày theo múi giờ Việt Nam (UTC+7).
        const startDate = new Date(`${query.date}T00:00:00+07:00`);
        const endDate = new Date(
            startDate.getTime() + 24 * 60 * 60 * 1000,
        );

        // Lấy các chuyến có ngày khởi hành đi hoặc về nằm trong ngày được chọn.
        const trips = await this.prisma.trip.findMany({
            where: {
                status: {
                    not: 'CANCELLED',
                },
                OR: [
                    {
                        plannedDeparture: {
                            gte: startDate,
                            lt: endDate,
                        },
                    },
                    {
                        returnPlannedDeparture: {
                            gte: startDate,
                            lt: endDate,
                        },
                    },
                ],
            },
            orderBy: {
                plannedDeparture: 'asc',
            },
            include: {
                route: true,
                vehicle: true,
                bookings: {
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
                },
            },
        });

        // Tạo nhóm riêng cho từng chiều có giờ khởi hành trong ngày.
        const result = trips.flatMap((trip) => {
            const groups: Array<{
                tripId: string;
                direction: 'OUTBOUND' | 'RETURN';
                plannedDeparture: Date;
                trip: typeof trip;
                bookingCount: number;
                bookings: typeof trip.bookings;
            }> = [];

            if (
                trip.plannedDeparture >= startDate &&
                trip.plannedDeparture < endDate
            ) {
                const bookings = trip.bookings.filter(
                    (booking) => booking.direction === 'OUTBOUND',
                );

                groups.push({
                    tripId: trip.id,
                    direction: 'OUTBOUND',
                    plannedDeparture: trip.plannedDeparture,
                    trip,
                    bookingCount: bookings.length,
                    bookings,
                });
            }

            if (
                trip.returnPlannedDeparture &&
                trip.returnPlannedDeparture >= startDate &&
                trip.returnPlannedDeparture < endDate
            ) {
                const bookings = trip.bookings.filter(
                    (booking) => booking.direction === 'RETURN',
                );

                groups.push({
                    tripId: trip.id,
                    direction: 'RETURN',
                    plannedDeparture: trip.returnPlannedDeparture,
                    trip,
                    bookingCount: bookings.length,
                    bookings,
                });
            }

            return groups;
        });

        // Sắp xếp tất cả nhóm theo giờ khởi hành.
        result.sort(
            (a, b) =>
                a.plannedDeparture.getTime() -
                b.plannedDeparture.getTime(),
        );

        return {
            date: query.date,
            totalTrips: result.length,
            data: result,
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
                // Giải phóng toàn bộ lượt phân bổ ghế đang HELD của Booking.
                const releasedAllocations = await tx.seatAllocation.updateMany({
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

                // Đảm bảo tất cả ghế của Booking đều được giải phóng thành công.
                if (releasedAllocations.count !== allocationIds.length) {
                    throw new ConflictException(
                        'Không thể giải phóng toàn bộ ghế của Booking. Giao dịch hủy đã được hoàn tác.',
                    );
                }
            }

            return {
                message: 'Hủy booking thành công',
                bookingId: id,
                status: 'CANCELLED',
            };
        });
    }
    // Hủy booking đã xác nhận, đồng bộ trạng thái vé và giải phóng ghế trong một transaction.
    async cancelConfirmedBooking(
        id: string,
        dto: CancelConfirmedBookingDto,
        cancelledById: string,
    ) {
        const reason = dto.reason?.trim() || null;

        return this.prisma.$transaction(async (tx) => {
            // Khóa booking để tránh các giao dịch hủy hoặc xác nhận thanh toán xử lý đồng thời.
            await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id"
                FROM "Booking"
                WHERE "id" = ${id}
                FOR UPDATE
            `;

            // Lấy booking cùng danh sách ghế và vé đã phát hành.
            const booking = await tx.booking.findUnique({
                where: {
                    id,
                },
                include: {
                    seats: {
                        select: {
                            seatAllocationId: true,
                            ticket: {
                                select: {
                                    id: true,
                                    status: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!booking) {
                throw new NotFoundException('Không tìm thấy booking.');
            }

            // Chỉ cho phép hủy booking đã xác nhận.
            if (booking.status !== 'CONFIRMED') {
                throw new BadRequestException(
                    'Chỉ có thể hủy booking đã được xác nhận.',
                );
            }

            if (booking.seats.length === 0) {
                throw new BadRequestException(
                    'Booking không có ghế để xử lý hủy.',
                );
            }

            // Đảm bảo mỗi ghế đều đã có vé được phát hành.
            const tickets = booking.seats.map((seat) => seat.ticket);

            if (tickets.some((ticket) => !ticket)) {
                throw new ConflictException(
                    'Booking chưa có đầy đủ vé. Không thể thực hiện hủy.',
                );
            }

            // Không cho phép hủy booking có khách đã check-in.
            if (
                tickets.some(
                    (ticket) => ticket!.status === 'CHECKED_IN',
                )
            ) {
                throw new BadRequestException(
                    'Booking có vé đã check-in. Không thể hủy theo quy trình thông thường.',
                );
            }

            // Chỉ chấp nhận các vé đang ở trạng thái ISSUED.
            if (
                tickets.some(
                    (ticket) => ticket!.status !== 'ISSUED',
                )
            ) {
                throw new ConflictException(
                    'Trạng thái vé không hợp lệ để hủy booking.',
                );
            }

            const ticketIds = tickets.map((ticket) => ticket!.id);

            const allocationIds = booking.seats.map(
                (seat) => seat.seatAllocationId,
            );

            // Chuyển booking sang CANCELLED.
            const cancelledBooking = await tx.booking.updateMany({
                where: {
                    id,
                    status: 'CONFIRMED',
                },
                data: {
                    status: 'CANCELLED',
                    holdExpiresAt: null,
                    cancelledAt: new Date(),
                    cancellationReason: reason,
                    cancelledById,
                },
            });

            if (cancelledBooking.count !== 1) {
                throw new ConflictException(
                    'Booking vừa được xử lý bởi một yêu cầu khác.',
                );
            }

            // Hủy toàn bộ vé đang được phát hành.
            const cancelledTickets = await tx.ticket.updateMany({
                where: {
                    id: {
                        in: ticketIds,
                    },
                    status: 'ISSUED',
                },
                data: {
                    status: 'CANCELLED',
                    cancelledAt: new Date(),
                },
            });

            if (cancelledTickets.count !== ticketIds.length) {
                throw new ConflictException(
                    'Không thể hủy toàn bộ vé. Giao dịch đã được hoàn tác.',
                );
            }

            // Giải phóng toàn bộ ghế đang được đặt.
            const releasedAllocations =
                await tx.seatAllocation.updateMany({
                    where: {
                        id: {
                            in: allocationIds,
                        },
                        status: 'BOOKED',
                    },
                    data: {
                        status: 'RELEASED',
                        holdExpiresAt: null,
                    },
                });

            if (releasedAllocations.count !== allocationIds.length) {
                throw new ConflictException(
                    'Không thể giải phóng toàn bộ ghế. Giao dịch đã được hoàn tác.',
                );
            }

            return {
                message: 'Hủy booking đã xác nhận thành công.',
                bookingId: id,
                status: 'CANCELLED',
                cancelledTicketCount: cancelledTickets.count,
                releasedSeatCount: releasedAllocations.count,
                reason,
            };
        });
    }

    // Tự động hết hạn booking chưa thanh toán và giải phóng SeatAllocation.
    
    @Cron(CronExpression.EVERY_MINUTE)
    async expireHeldBookings() {
        const now = new Date();

        // Chỉ lấy ID các booking có khả năng đã hết hạn.
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

                // Booking đã được xử lý bởi tiến trình khác hoặc không còn đủ điều kiện.
                if (result.count !== 1) {
                    return;
                }

                // Lấy danh sách ghế bên trong transaction để sử dụng dữ liệu mới nhất.
                const currentBooking = await tx.booking.findUnique({
                    where: {
                        id: booking.id,
                    },
                    select: {
                        seats: {
                            select: {
                                seatAllocationId: true,
                            },
                        },
                    },
                });

                if (!currentBooking) {
                    throw new NotFoundException(
                        'Không tìm thấy booking khi giải phóng ghế hết hạn.',
                    );
                }

                const allocationIds = currentBooking.seats.map(
                    (seat) => seat.seatAllocationId,
                );

                if (allocationIds.length > 0) {
                    // Chuyển toàn bộ ghế đang HELD sang EXPIRED.
                    const expiredAllocations = await tx.seatAllocation.updateMany({
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

                    // Rollback nếu không giải phóng được toàn bộ ghế của Booking.
                    if (expiredAllocations.count !== allocationIds.length) {
                        throw new ConflictException(
                            'Không thể giải phóng toàn bộ ghế của Booking đã hết hạn.',
                        );
                    }
                }
            });
        }
    }

}
