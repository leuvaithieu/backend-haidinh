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

describe('BookingService', () => {
    let service: BookingService;
    let tx: any;
    let prismaMock: any;

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
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'point-01',
                        sequence: 1,
                        routePointId: 'route-point-01',
                    },
                    {
                        id: 'point-05',
                        sequence: 5,
                        routePointId: 'route-point-05',
                    },
                ]),
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
        };

        prismaMock = {
            $transaction: jest.fn(
                async (callback: (transaction: any) => any) => {
                    return callback(tx);
                },
            ),
        };

        const module: TestingModule =
            await Test.createTestingModule({
                providers: [
                    BookingService,
                    {
                        provide: PrismaService,
                        useValue: prismaMock,
                    },
                    {
                        provide: SettingsService,
                        useValue: {
                            getNumberValue: jest
                                .fn()
                                .mockResolvedValue(20),
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
});
