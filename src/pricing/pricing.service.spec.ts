
import { BadRequestException, NotFoundException } from '@nestjs/common';

import {
    PriceEntryType,
    PricePolicyStatus,
    PricePointType,
    RouteScheduleType,
    TripDirection,
} from '@prisma/client';

import { PricingService } from './pricing.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PricingService', () => {
    let service: PricingService;
    let prismaMock: any;

    const tripRoutePoints = [
        {
            id: 'trip-point-01',
            routePointId: 'route-point-01',
            pointName: 'Bình Dương',
            sequence: 1,
        },
        {
            id: 'trip-point-03',
            routePointId: 'route-point-03',
            pointName: 'Bình Phước',
            sequence: 3,
        },
        {
            id: 'trip-point-05',
            routePointId: 'route-point-05',
            pointName: 'Thanh Hóa',
            sequence: 5,
        },
    ];

    const mockTrip = {
        id: 'trip-01',
        routeId: 'route-01',
        scheduleType: RouteScheduleType.NORMAL,
        tripRoutePoints,
    };

    const mockPolicyTrip = {
        id: 'trip-01',
        routeId: 'route-01',
        scheduleType: RouteScheduleType.NORMAL,
        plannedDeparture: new Date('2026-12-15T07:00:00'),
        vehicle: {
            vehicleType: '44_GIUONG',
        },
    };

    // Khởi tạo dữ liệu giả lập cho PricingService.
    beforeEach(() => {
        prismaMock = {
            trip: {
                findUnique: jest.fn().mockImplementation((args: any) => {
                    if (args?.select?.tripRoutePoints) {
                        return Promise.resolve(mockTrip);
                    }

                    return Promise.resolve(mockPolicyTrip);
                }),
            },

            servicePoint: {
                findFirst: jest.fn(),
            },

            routePricePolicy: {
                findMany: jest.fn(),
            },
        };

        service = new PricingService(
            prismaMock as PrismaService,
        );
    });

    // Tạo chính sách NORMAL mẫu có giá RoutePoint.
    const createNormalPolicy = () => ({
        id: 'policy-01',
        pricingMode: RouteScheduleType.NORMAL,
        direction: TripDirection.OUTBOUND,
        version: 1,
        status: PricePolicyStatus.ACTIVE,
        baseOriginRoutePointId: 'route-point-01',
        routeAdjustmentAmount: 0,
        fullRoutePrice: null,

        routePointPrices: [
            {
                routePointId: 'route-point-05',
                priceType: PriceEntryType.FIXED,
                price: 1000000,
            },
        ],

        servicePointPrices: [],
        priceOverrides: [],
    });

    // Kiểm tra PricingService được khởi tạo.
    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // Không có chính sách giá thì trả về CONTACT.
    it('should return CONTACT when no pricing policy exists', async () => {
        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const result = await service.calculatePrice({
            tripId: 'trip-01',
            direction: TripDirection.OUTBOUND,
            pickupTripRoutePointId: 'trip-point-01',
            dropoffTripRoutePointId: 'trip-point-05',
        });

        expect(result.priceSource).toBe('CONTACT');
        expect(result.basePrice).toBeNull();
        expect(result.finalPrice).toBeNull();
        expect(result.policyId).toBeNull();
    });

    // Kiểm tra giá RoutePoint theo chính sách NORMAL.
    it('should calculate NORMAL price from RoutePointPrice', async () => {
        const policy = createNormalPolicy();

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([policy]);

        const result = await service.calculatePrice({
            tripId: 'trip-01',
            direction: TripDirection.OUTBOUND,
            pickupTripRoutePointId: 'trip-point-01',
            dropoffTripRoutePointId: 'trip-point-05',
        });

        expect(result.pricingMode).toBe(RouteScheduleType.NORMAL);
        expect(result.priceSource).toBe('ROUTE_POINT_PRICE');
        expect(result.basePrice).toBe(1000000);
        expect(result.finalPrice).toBe(1000000);
        expect(result.policyId).toBe('policy-01');
        expect(result.policyVersion).toBe(1);
    });

        // Ưu tiên giá ServicePointPrice khi khách chọn điểm trả phụ.
    it('should prioritize ServicePointPrice over RoutePointPrice', async () => {
        const policy = {
            ...createNormalPolicy(),
            servicePointPrices: [
                {
                    servicePointId: 'service-point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 1200000,
                },
            ],
        };

        prismaMock.servicePoint.findFirst.mockResolvedValue({
            id: 'service-point-05',
            name: 'Văn phòng Bình Dương',
            routePointId: 'route-point-05',
        });

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([policy]);

        const result = await service.calculatePrice({
            tripId: 'trip-01',
            direction: TripDirection.OUTBOUND,
            pickupTripRoutePointId: 'trip-point-01',
            dropoffTripRoutePointId: 'trip-point-05',
            dropoffServicePointId: 'service-point-05',
        });

        expect(result.priceSource).toBe('SERVICE_POINT_PRICE');
        expect(result.basePrice).toBe(1200000);
        expect(result.finalPrice).toBe(1200000);
        expect(result.dropoff.servicePointId).toBe('service-point-05');
        expect(result.dropoff.servicePointName).toBe('Văn phòng Bình Dương');
    });
    
        // Fallback về giá RoutePointPrice khi không có giá ServicePointPrice.
    it('should fallback to RoutePointPrice when ServicePointPrice does not exist', async () => {
        const policy = createNormalPolicy();

        prismaMock.servicePoint.findFirst.mockResolvedValue({
            id: 'service-point-05',
            name: 'Văn phòng Bình Dương',
            routePointId: 'route-point-05',
        });

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([policy]);

        const result = await service.calculatePrice({
            tripId: 'trip-01',
            direction: TripDirection.OUTBOUND,
            pickupTripRoutePointId: 'trip-point-01',
            dropoffTripRoutePointId: 'trip-point-05',
            dropoffServicePointId: 'service-point-05',
        });

        expect(result.priceSource).toBe('ROUTE_POINT_PRICE');
        expect(result.basePrice).toBe(1000000);
        expect(result.finalPrice).toBe(1000000);
        expect(result.dropoff.servicePointId).toBe('service-point-05');
    });

    // Ưu tiên chính sách giá dành riêng cho loại xe 44 giường.
    it('should prioritize policy for specific vehicle type', async () => {
        const specificPolicy = {
            ...createNormalPolicy(),
            id: 'policy-44',
            routePointPrices: [
                {
                    routePointId: 'route-point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 1200000,
                },
            ],
        };

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([specificPolicy]);

        const result = await service.calculatePrice({
            tripId: 'trip-01',
            direction: TripDirection.OUTBOUND,
            pickupTripRoutePointId: 'trip-point-01',
            dropoffTripRoutePointId: 'trip-point-05',
        });

        expect(prismaMock.routePricePolicy.findMany).toHaveBeenCalledTimes(1);

        expect(
            prismaMock.routePricePolicy.findMany.mock.calls[0][0].where.vehicleType,
        ).toBe('44_GIUONG');

        expect(result.policyId).toBe('policy-44');
        expect(result.finalPrice).toBe(1200000);
    });

        // Sử dụng chính sách chung khi không có chính sách riêng cho loại xe.
    it('should fallback to generic policy when specific vehicle policy does not exist', async () => {
        const genericPolicy = {
            ...createNormalPolicy(),
            id: 'policy-generic',
            routePointPrices: [
                {
                    routePointId: 'route-point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 1000000,
                },
            ],
        };

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([genericPolicy]);

        const result = await service.calculatePrice({
            tripId: 'trip-01',
            direction: TripDirection.OUTBOUND,
            pickupTripRoutePointId: 'trip-point-01',
            dropoffTripRoutePointId: 'trip-point-05',
        });

        expect(prismaMock.routePricePolicy.findMany).toHaveBeenCalledTimes(2);

        expect(
            prismaMock.routePricePolicy.findMany.mock.calls[0][0].where.vehicleType,
        ).toBe('44_GIUONG');

        expect(
            prismaMock.routePricePolicy.findMany.mock.calls[1][0].where.vehicleType,
        ).toBeNull();

        expect(result.policyId).toBe('policy-generic');
        expect(result.finalPrice).toBe(1000000);
    });

    // Kiểm tra cộng khoản điều chỉnh tuyến vào giá vé.
    it('should apply route adjustment to NORMAL price', async () => {
        const policy = {
            ...createNormalPolicy(),
            routeAdjustmentAmount: 100000,
        };

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([policy]);

        const result = await service.calculatePrice({
            tripId: 'trip-01',
            direction: TripDirection.OUTBOUND,
            pickupTripRoutePointId: 'trip-point-01',
            dropoffTripRoutePointId: 'trip-point-05',
        });

        expect(result.basePrice).toBe(1000000);
        expect(result.routeAdjustmentAmount).toBe(100000);
        expect(result.finalPrice).toBe(1100000);
    });

    // Không tìm thấy chuyến xe thì phải báo lỗi.
    it('should throw when trip does not exist', async () => {
        prismaMock.trip.findUnique.mockResolvedValue(null);

        await expect(
            service.calculatePrice({
                tripId: 'trip-not-found',
                direction: TripDirection.OUTBOUND,
                pickupTripRoutePointId: 'trip-point-01',
                dropoffTripRoutePointId: 'trip-point-05',
            }),
        ).rejects.toThrow(NotFoundException);
    });

    // Không cho phép điểm đón nằm sau hoặc trùng điểm trả.
    it('should reject invalid pickup and dropoff order', async () => {
        await expect(
            service.calculatePrice({
                tripId: 'trip-01',
                direction: TripDirection.OUTBOUND,
                pickupTripRoutePointId: 'trip-point-05',
                dropoffTripRoutePointId: 'trip-point-01',
            }),
        ).rejects.toThrow(BadRequestException);
    });

    // Không cho phép điểm đón hoặc điểm trả không thuộc lịch trình.
    it('should reject point outside trip itinerary', async () => {
        await expect(
            service.calculatePrice({
                tripId: 'trip-01',
                direction: TripDirection.OUTBOUND,
                pickupTripRoutePointId: 'point-invalid',
                dropoffTripRoutePointId: 'trip-point-05',
            }),
        ).rejects.toThrow(BadRequestException);
    });
});
