jest.mock('@nestjs/schedule', () => ({
    Cron: () => () => undefined,
    CronExpression: {
        EVERY_MINUTE: '* * * * *',
    },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

import { BookingService } from './booking.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

import { PricingService } from '../pricing/pricing.service';

describe('BookingService', () => {
    let service: BookingService;
    let tx: any;
    let prismaMock: any;

    let pricingServiceMock: any;

    const mockPriceSnapshot = {
        pricingMode: 'NORMAL',
        direction: 'OUTBOUND',
        policyId: 'policy-01',
        policyVersion: 1,
        currency: 'VND',
        priceSource: 'ROUTE_POINT_PRICE',
        basePrice: 500000,
        routeAdjustmentAmount: 0,
        finalPrice: 500000,
        pickup: {
            tripRoutePointId: 'point-01',
            routePointId: 'route-point-01',
            pointName: 'Điểm đón',
            servicePointId: null,
            servicePointName: null,
            sequence: 1,
        },
        dropoff: {
            tripRoutePointId: 'point-05',
            routePointId: 'route-point-05',
            pointName: 'Điểm trả',
            servicePointId: null,
            servicePointName: null,
            sequence: 5,
        },
        calculatedAt: new Date(),
    };

    // Khởi tạo dữ liệu giả lập và các Prisma transaction phục vụ kiểm thử.
    beforeEach(async () => {
        tx = {
            trip: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'trip-01',
                    status: 'SCHEDULED',
                    ticketPrice: 500000,
                    vehicle: {
                        seatLayout: {
                            id: 'layout-01',
                            status: 'ACTIVE',
                            isTemplate: false,
                            seats: [
                                {
                                    id: 'seat-01',
                                    code: 'A01',
                                    isActive: true,
                                },
                            ],
                        },
                    },
                }),
            },

            tripRoutePoint: {
                // Giả lập truy vấn chỉ trả về các điểm được yêu cầu.
                findMany: jest.fn().mockImplementation(async (args: any) => {
                    const routePoints = [
                        {
                            id: 'point-01',
                            sequence: 1,
                            routePointId: 'route-point-01',
                        },
                        {
                            id: 'point-03',
                            sequence: 3,
                            routePointId: 'route-point-03',
                        },
                        {
                            id: 'point-05',
                            sequence: 5,
                            routePointId: 'route-point-05',
                        },
                    ];

                    const requestedIds = args?.where?.id?.in;

                    if (!requestedIds) {
                        return routePoints;
                    }

                    return routePoints.filter((point) =>
                        requestedIds.includes(point.id),
                    );
                }),
            },

            tripSeat: {
                createMany: jest.fn().mockResolvedValue({
                    count: 1,
                }),
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'trip-seat-01',
                        seatId: 'seat-01',
                    },
                ]),
            },

            booking: {
                findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn().mockResolvedValue({
                    id: 'booking-01',
                    bookingCode: 'HD-TEST-001',
                    tripId: 'trip-01',
                    direction: 'OUTBOUND',
                    customerName: 'Nguyen Van A',
                    customerPhone: '0901234567',
                    totalAmount: 500000,
                    status: 'PENDING',
                    paymentStatus: 'UNPAID',
                    holdExpiresAt: new Date(
                        Date.now() + 20 * 60 * 1000,
                    ),
                }),
            },

            seatAllocation: {
                create: jest.fn().mockResolvedValue({
                    id: 'allocation-01',
                }),
            },

            bookingSeat: {
                create: jest.fn().mockResolvedValue({
                    id: 'booking-seat-01',
                    price: 500000,
                }),
            },

            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },

            $queryRaw: jest.fn().mockResolvedValue([]),
        };

        prismaMock = {
            $transaction: jest.fn(
                async (callback: (transaction: any) => any) => {
                    return callback(tx);
                },
            ),
        };

        // Giả lập PricingService trả về snapshot giá vé hợp lệ.
        pricingServiceMock = {
            calculatePrice: jest.fn().mockResolvedValue(
                mockPriceSnapshot,
            ),
        };

        const module: TestingModule =
            await Test.createTestingModule({
                providers: [
                    BookingService,
                    {
                        provide: PricingService,
                        useValue: pricingServiceMock,
                    },
                    {
                        provide: PrismaService,
                        useValue: prismaMock,
                    },
                    {
                        provide: SettingsService,
                        useValue: {
                            getNumberValue: jest
                                .fn()
                                .mockResolvedValueOnce(20)
                                .mockResolvedValueOnce(300000),
                        },
                    },
                ],
            }).compile();

        service = module.get<BookingService>(BookingService);
    });

    // Kiểm tra BookingService được khởi tạo thành công.
    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // Kiểm tra tạo booking và giữ ghế thành công.
    it('should create booking and allocate seat successfully', async () => {
        const dto = {
            tripId: 'trip-01',
            direction: 'OUTBOUND' as const,
            customerName: 'Nguyen Van A',
            customerPhone: '0901234567',
            seats: [
                {
                    seatId: 'seat-01',
                    pickupTripRoutePointId: 'point-01',
                    dropoffTripRoutePointId: 'point-05',
                    passengerName: 'Nguyen Van A',
                },
            ],
        };

        const result = await service.create(dto);

        expect(result.message).toBe('Giữ ghế thành công');

        expect(tx.booking.create).toHaveBeenCalled();

        expect(tx.seatAllocation.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    tripSeatId: 'trip-seat-01',
                    direction: 'OUTBOUND',
                    pickupSequence: 1,
                    dropoffSequence: 5,
                    status: 'HELD',
                }),
            }),
        );

        expect(tx.bookingSeat.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    bookingId: 'booking-01',
                    seatAllocationId: 'allocation-01',
                    price: 500000,
                }),
            }),
        );

        // Kiểm tra PricingService được gọi với đúng hành trình và transaction.
        expect(pricingServiceMock.calculatePrice).toHaveBeenCalledWith({
            tripId: 'trip-01',
            direction: 'OUTBOUND',
            pickupTripRoutePointId: 'point-01',
            dropoffTripRoutePointId: 'point-05',
            pickupServicePointId: undefined,
            dropoffServicePointId: undefined,
            tx,
        });

        // Kiểm tra tổng tiền booking.
        expect(tx.booking.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    totalAmount: 500000,
                    depositAmount: 300000,
                }),
            }),
        );

        // Kiểm tra giá và chính sách giá được lưu vào BookingSeat.
        expect(tx.bookingSeat.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    price: 500000,
                    pricePolicyId: 'policy-01',
                    priceSnapshot: expect.objectContaining({
                        pricingMode: 'NORMAL',
                        policyId: 'policy-01',
                        policyVersion: 1,
                        priceSource: 'ROUTE_POINT_PRICE',
                        basePrice: 500000,
                        finalPrice: 500000,
                    }),
                }),
            }),
        );
    });

    // Kiểm tra không cho phép điểm đón nằm sau hoặc trùng điểm trả.
    it('should reject when pickup point is after dropoff point', async () => {
        tx.tripRoutePoint.findMany.mockResolvedValue([
            {
                id: 'point-01',
                sequence: 5,
                routePointId: 'route-point-01',
            },
            {
                id: 'point-05',
                sequence: 1,
                routePointId: 'route-point-05',
            },
            
        ]);

        const dto = {
            tripId: 'trip-01',
            direction: 'OUTBOUND' as const,
            customerName: 'Nguyen Van A',
            customerPhone: '0901234567',
            seats: [
                {
                    seatId: 'seat-01',
                    pickupTripRoutePointId: 'point-01',
                    dropoffTripRoutePointId: 'point-05',
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(
            BadRequestException,
        );

        expect(tx.booking.create).not.toHaveBeenCalled();
        expect(tx.seatAllocation.create).not.toHaveBeenCalled();
    });

    // Không cho phép tạo booking khi hành trình chưa có giá trực tuyến.
    it('should reject booking when pricing result is CONTACT', async () => {
        pricingServiceMock.calculatePrice.mockResolvedValue({
            ...mockPriceSnapshot,
            priceSource: 'CONTACT',
            basePrice: null,
            finalPrice: null,
        });

        const dto = {
            tripId: 'trip-01',
            direction: 'OUTBOUND' as const,
            customerName: 'Nguyen Van A',
            customerPhone: '0901234567',
            seats: [
                {
                    seatId: 'seat-01',
                    pickupTripRoutePointId: 'point-01',
                    dropoffTripRoutePointId: 'point-05',
                    passengerName: 'Nguyen Van A',
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(
            'Hành trình này chưa có giá vé trực tuyến. Vui lòng liên hệ nhân viên để được hỗ trợ.',
        );

        // Không được tạo booking hoặc giữ ghế khi chưa có giá.
        expect(tx.booking.create).not.toHaveBeenCalled();
        expect(tx.seatAllocation.create).not.toHaveBeenCalled();
        expect(tx.bookingSeat.create).not.toHaveBeenCalled();
    });

    // Kiểm tra SeatAllocation được tạo đúng chiều RETURN.
    it('should create seat allocation in RETURN direction', async () => {
        const dto = {
            tripId: 'trip-01',
            direction: 'RETURN' as const,
            customerName: 'Nguyen Van A',
            customerPhone: '0901234567',
            seats: [
                {
                    seatId: 'seat-01',
                    pickupTripRoutePointId: 'point-01',
                    dropoffTripRoutePointId: 'point-05',
                },
            ],
        };

        await service.create(dto);

        expect(tx.seatAllocation.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    direction: 'RETURN',
                }),
            }),
        );
    });

    
    // Kiểm tra mỗi ghế được tính giá riêng và tổng tiền booking chính xác.
    it('should calculate different prices for multiple seats', async () => {

        // Giả lập xe có hai ghế.
        tx.trip.findUnique.mockResolvedValue({
            id: 'trip-01',
            status: 'SCHEDULED',
            ticketPrice: 500000,
            vehicle: {
                seatLayout: {
                    id: 'layout-01',
                    status: 'ACTIVE',
                    isTemplate: false,
                    seats: [
                        { id: 'seat-01', code: 'A01', isActive: true },
                        { id: 'seat-02', code: 'A02', isActive: true },
                    ],
                },
            },
        });

        // Giả lập hai ghế tương ứng trong chuyến.
        tx.tripSeat.findMany.mockResolvedValue([
            { id: 'trip-seat-01', seatId: 'seat-01' },
            { id: 'trip-seat-02', seatId: 'seat-02' },
        ]);

        // Giả lập PricingService trả về giá khác nhau theo điểm trả.
        pricingServiceMock.calculatePrice.mockImplementation(
            async (params: any) => ({
                ...mockPriceSnapshot,
                dropoff: {
                    ...mockPriceSnapshot.dropoff,
                    tripRoutePointId: params.dropoffTripRoutePointId,
                },
                basePrice:
                    params.dropoffTripRoutePointId === 'point-05'
                        ? 1000000
                        : 300000,
                finalPrice:
                    params.dropoffTripRoutePointId === 'point-05'
                        ? 1000000
                        : 300000,
            }),
        );

        const dto = {
            tripId: 'trip-01',
            direction: 'OUTBOUND' as const,
            customerName: 'Nguyen Van A',
            customerPhone: '0901234567',
            seats: [
                {
                    seatId: 'seat-01',
                    pickupTripRoutePointId: 'point-01',
                    dropoffTripRoutePointId: 'point-05',
                    passengerName: 'Nguyen Van A',
                },
                {
                    seatId: 'seat-02',
                    pickupTripRoutePointId: 'point-01',
                    dropoffTripRoutePointId: 'point-03',
                    passengerName: 'Nguyen Van B',
                },
            ],
        };

        const result = await service.create(dto);

        // Kiểm tra PricingService được gọi riêng cho từng ghế.
        expect(pricingServiceMock.calculatePrice).toHaveBeenCalledTimes(2);

        // Kiểm tra tổng tiền của hai ghế.
        expect(tx.booking.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    totalAmount: 1300000,
                }),
            }),
        );

        // Kiểm tra BookingSeat lưu đúng giá từng ghế.
        expect(tx.bookingSeat.create).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                data: expect.objectContaining({
                    price: 1000000,
                }),
            }),
        );

        expect(tx.bookingSeat.create).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                data: expect.objectContaining({
                    price: 300000,
                }),
            }),
        );
    });
});
