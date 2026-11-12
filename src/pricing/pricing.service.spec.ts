
import { BadRequestException, NotFoundException, ConflictException} from '@nestjs/common';

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

    // Không tự áp dụng giá toàn tuyến khi khách lên xe tại điểm trung gian.
    it('should return CONTACT when pickup is not the policy base origin and no override exists', async () => {
        const policy = createNormalPolicy();

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([policy]);

        const result = await service.calculatePrice({
            tripId: 'trip-01',
            direction: TripDirection.OUTBOUND,
            pickupTripRoutePointId: 'trip-point-03',
            dropoffTripRoutePointId: 'trip-point-05',
        });

        expect(result.priceSource).toBe('CONTACT');
        expect(result.basePrice).toBeNull();
        expect(result.finalPrice).toBeNull();
        expect(result.routeAdjustmentAmount).toBe(0);
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

        // Ưu tiên giá Override khi tồn tại mức giá riêng cho cặp điểm đón và trả.
    it('should prioritize RoutePriceOverride over RoutePointPrice', async () => {
        const policy = {
            ...createNormalPolicy(),
            priceOverrides: [
                {
                    fromPointKey: 'RP:route-point-01',
                    toPointKey: 'RP:route-point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 1300000,
                },
            ],
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

        expect(result.priceSource).toBe('ROUTE_PRICE_OVERRIDE');
        expect(result.basePrice).toBe(1300000);
        expect(result.finalPrice).toBe(1300000);
        expect(result.policyId).toBe('policy-01');
    });

        // Bỏ qua Override không khớp cặp điểm và sử dụng giá RoutePointPrice.
    it('should ignore unmatched RoutePriceOverride', async () => {
        const policy = {
            ...createNormalPolicy(),
            priceOverrides: [
                {
                    fromPointKey: 'RP:another-origin',
                    toPointKey: 'RP:another-destination',
                    priceType: PriceEntryType.FIXED,
                    price: 1500000,
                },
            ],
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

        expect(result.priceSource).toBe('ROUTE_POINT_PRICE');
        expect(result.basePrice).toBe(1000000);
        expect(result.finalPrice).toBe(1000000);
    });

        // Không tự động báo giá khi Override có loại giá CONTACT.
    it('should return CONTACT when matching override has CONTACT price type', async () => {
        const policy = {
            ...createNormalPolicy(),
            priceOverrides: [
                {
                    fromPointKey: 'RP:route-point-01',
                    toPointKey: 'RP:route-point-05',
                    priceType: PriceEntryType.CONTACT,
                    price: null,
                },
            ],
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

        expect(result.priceSource).toBe('CONTACT');
        expect(result.basePrice).toBeNull();
        expect(result.finalPrice).toBeNull();
        expect(result.policyId).toBe('policy-01');
    });

        // Tính giá Tết khi khách đi toàn tuyến từ điểm đầu đến điểm cuối.
    it('should calculate TET full route price', async () => {
        const tetTrip = {
            ...mockTrip,
            scheduleType: RouteScheduleType.TET,
        };

        const tetPolicyTrip = {
            ...mockPolicyTrip,
            scheduleType: RouteScheduleType.TET,
        };

        prismaMock.trip.findUnique.mockImplementation((args: any) => {
            if (args?.select?.tripRoutePoints) {
                return Promise.resolve(tetTrip);
            }

            return Promise.resolve(tetPolicyTrip);
        });

        const policy = {
            ...createNormalPolicy(),
            id: 'policy-tet',
            pricingMode: RouteScheduleType.TET,
            fullRoutePrice: 2200000,
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

        expect(result.pricingMode).toBe(RouteScheduleType.TET);
        expect(result.priceSource).toBe('TET_FULL_ROUTE');
        expect(result.basePrice).toBe(2200000);
        expect(result.finalPrice).toBe(2200000);
        expect(result.policyId).toBe('policy-tet');
    });

        // Trả về CONTACT khi khách chỉ đi một phần hành trình Tết.
    it('should return CONTACT for partial TET route', async () => {
        const tetTrip = {
            ...mockTrip,
            scheduleType: RouteScheduleType.TET,
        };

        const tetPolicyTrip = {
            ...mockPolicyTrip,
            scheduleType: RouteScheduleType.TET,
        };

        prismaMock.trip.findUnique.mockImplementation((args: any) => {
            if (args?.select?.tripRoutePoints) {
                return Promise.resolve(tetTrip);
            }

            return Promise.resolve(tetPolicyTrip);
        });

        const policy = {
            ...createNormalPolicy(),
            id: 'policy-tet',
            pricingMode: RouteScheduleType.TET,
            fullRoutePrice: 2200000,
        };

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([policy]);

        const result = await service.calculatePrice({
            tripId: 'trip-01',
            direction: TripDirection.OUTBOUND,
            pickupTripRoutePointId: 'trip-point-01',
            dropoffTripRoutePointId: 'trip-point-03',
        });

        expect(result.pricingMode).toBe(RouteScheduleType.TET);
        expect(result.priceSource).toBe('CONTACT');
        expect(result.basePrice).toBeNull();
        expect(result.finalPrice).toBeNull();
        expect(result.policyId).toBe('policy-tet');
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

        // Báo lỗi khi có nhiều chính sách riêng cùng phù hợp với loại xe.
    it('should throw ConflictException when multiple specific policies match', async () => {
        const policy1 = {
            ...createNormalPolicy(),
            id: 'policy-44-01',
        };

        const policy2 = {
            ...createNormalPolicy(),
            id: 'policy-44-02',
        };

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([policy1, policy2]);

        await expect(
            service.calculatePrice({
                tripId: 'trip-01',
                direction: TripDirection.OUTBOUND,
                pickupTripRoutePointId: 'trip-point-01',
                dropoffTripRoutePointId: 'trip-point-05',
            }),
        ).rejects.toThrow(ConflictException);

        expect(
            prismaMock.routePricePolicy.findMany,
        ).toHaveBeenCalledTimes(1);
    });

        // Báo lỗi khi có nhiều chính sách chung cùng phù hợp với chuyến xe.
    it('should throw ConflictException when multiple generic policies match', async () => {
        const policy1 = {
            ...createNormalPolicy(),
            id: 'policy-generic-01',
        };

        const policy2 = {
            ...createNormalPolicy(),
            id: 'policy-generic-02',
        };

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([policy1, policy2]);

        await expect(
            service.calculatePrice({
                tripId: 'trip-01',
                direction: TripDirection.OUTBOUND,
                pickupTripRoutePointId: 'trip-point-01',
                dropoffTripRoutePointId: 'trip-point-05',
            }),
        ).rejects.toThrow(ConflictException);

        expect(
            prismaMock.routePricePolicy.findMany,
        ).toHaveBeenCalledTimes(2);
    });

        // Không áp dụng chính sách có ngày bắt đầu hiệu lực sau ngày khởi hành.
    it('should not apply policy before effectiveFrom date', async () => {
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
        expect(result.finalPrice).toBeNull();

        const firstQuery =
            prismaMock.routePricePolicy.findMany.mock.calls[0][0];

        expect(firstQuery.where.effectiveFrom.lte).toEqual(
            mockPolicyTrip.plannedDeparture,
        );
    });

        // Không áp dụng chính sách đã hết hiệu lực tại thời điểm khởi hành.
    it('should exclude policy when effectiveTo equals plannedDeparture', async () => {
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
        expect(result.finalPrice).toBeNull();

        const firstQuery =
            prismaMock.routePricePolicy.findMany.mock.calls[0][0];

        expect(firstQuery.where.OR).toEqual([
            { effectiveTo: null },
            {
                effectiveTo: {
                    gt: mockPolicyTrip.plannedDeparture,
                },
            },
        ]);
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

        // Từ chối giá vé bằng 0.
    it('should reject zero ticket price', async () => {
        const policy = {
            ...createNormalPolicy(),
            routePointPrices: [
                {
                    routePointId: 'route-point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 0,
                },
            ],
        };

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([policy]);

        await expect(
            service.calculatePrice({
                tripId: 'trip-01',
                direction: TripDirection.OUTBOUND,
                pickupTripRoutePointId: 'trip-point-01',
                dropoffTripRoutePointId: 'trip-point-05',
            }),
        ).rejects.toThrow(BadRequestException);
    });

        // Từ chối giá vé âm.
    it('should reject negative ticket price', async () => {
        const policy = {
            ...createNormalPolicy(),
            routePointPrices: [
                {
                    routePointId: 'route-point-05',
                    priceType: PriceEntryType.FIXED,
                    price: -100000,
                },
            ],
        };

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([policy]);

        await expect(
            service.calculatePrice({
                tripId: 'trip-01',
                direction: TripDirection.OUTBOUND,
                pickupTripRoutePointId: 'trip-point-01',
                dropoffTripRoutePointId: 'trip-point-05',
            }),
        ).rejects.toThrow(BadRequestException);
    });

        // Từ chối giá vé có phần thập phân.
    it('should reject decimal ticket price', async () => {
        const policy = {
            ...createNormalPolicy(),
            routePointPrices: [
                {
                    routePointId: 'route-point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 1000000.5,
                },
            ],
        };

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([policy]);

        await expect(
            service.calculatePrice({
                tripId: 'trip-01',
                direction: TripDirection.OUTBOUND,
                pickupTripRoutePointId: 'trip-point-01',
                dropoffTripRoutePointId: 'trip-point-05',
            }),
        ).rejects.toThrow(BadRequestException);
    });

        // Từ chối khi khoản điều chỉnh khiến giá cuối cùng bằng 0.
    it('should reject zero final price after route adjustment', async () => {
        const policy = {
            ...createNormalPolicy(),
            routeAdjustmentAmount: -1000000,
        };

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([policy]);

        await expect(
            service.calculatePrice({
                tripId: 'trip-01',
                direction: TripDirection.OUTBOUND,
                pickupTripRoutePointId: 'trip-point-01',
                dropoffTripRoutePointId: 'trip-point-05',
            }),
        ).rejects.toThrow(BadRequestException);
    });

        // Từ chối khi khoản điều chỉnh khiến giá cuối cùng âm.
    it('should reject negative final price after route adjustment', async () => {
        const policy = {
            ...createNormalPolicy(),
            routeAdjustmentAmount: -1200000,
        };

        prismaMock.routePricePolicy.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([policy]);

        await expect(
            service.calculatePrice({
                tripId: 'trip-01',
                direction: TripDirection.OUTBOUND,
                pickupTripRoutePointId: 'trip-point-01',
                dropoffTripRoutePointId: 'trip-point-05',
            }),
        ).rejects.toThrow(BadRequestException);
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

    // Tạo thành công chính sách giá NORMAL với dữ liệu hợp lệ.
    it('should create NORMAL pricing policy successfully', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({
                    id: 'policy-created-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                }),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const result = await service.create(dto);

        expect(result).toBeDefined();
        expect(result.id).toBe('policy-created-01');
        expect(result.status).toBe(PricePolicyStatus.DRAFT);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).toHaveBeenCalled();
    });

    // Từ chối tạo chính sách giá khi tuyến không tồn tại.
    it('should throw NotFoundException when route does not exist', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue(null),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-not-found',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routeAdjustmentAmount: 0,
        };

        await expect(service.create(dto)).rejects.toThrow(NotFoundException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePoint.findFirst).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách khi version nhỏ hơn 1.
    it('should reject pricing policy with invalid version', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 0,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routeAdjustmentAmount: 0,
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePoint.findFirst).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách khi effectiveTo nhỏ hơn effectiveFrom.
    it('should reject invalid effective date range', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-20T00:00:00.000Z',
            effectiveTo: '2026-12-15T00:00:00.000Z',
            routeAdjustmentAmount: 0,
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePoint.findFirst).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách khi effectiveTo bằng effectiveFrom.
    it('should reject equal effectiveFrom and effectiveTo dates', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-15T00:00:00.000Z',
            effectiveTo: '2026-12-15T00:00:00.000Z',
            routeAdjustmentAmount: 0,
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePoint.findFirst).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách NORMAL khi thiếu điểm gốc.
    it('should reject NORMAL policy without baseOriginRoutePointId', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routeAdjustmentAmount: 0,
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePoint.findFirst).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách NORMAL khi có fullRoutePrice.
    it('should reject NORMAL policy with fullRoutePrice', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            fullRoutePrice: 2200000,
            routeAdjustmentAmount: 0,
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePoint.findFirst).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách khi điểm gốc không thuộc tuyến.
    it('should reject baseOriginRoutePointId outside the route', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue(null),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-other-route',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routeAdjustmentAmount: 0,
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePoint.findFirst).toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách khi routeAdjustmentAmount là số thập phân.
    it('should reject decimal routeAdjustmentAmount', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routeAdjustmentAmount: 100000.5,
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Cho phép routeAdjustmentAmount là số nguyên âm.
    it('should allow negative routeAdjustmentAmount', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({
                    id: 'policy-created-02',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    direction: TripDirection.OUTBOUND,
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    routeAdjustmentAmount: -100000,
                }),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routeAdjustmentAmount: -100000,
        };

        const result = await service.create(dto);

        expect(result.routeAdjustmentAmount).toBe(-100000);
        expect(txMock.routePricePolicy.create).toHaveBeenCalled();
    });

    // Từ chối tạo chính sách TET khi thiếu fullRoutePrice.
    it('should reject TET policy without fullRoutePrice', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.TET,
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách TET khi fullRoutePrice bằng 0.
    it('should reject TET policy with zero fullRoutePrice', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.TET,
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            fullRoutePrice: 0,
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách TET khi fullRoutePrice là số âm.
    it('should reject TET policy with negative fullRoutePrice', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.TET,
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            fullRoutePrice: -100000,
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách TET khi fullRoutePrice có phần thập phân.
    it('should reject TET policy with decimal fullRoutePrice', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.TET,
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            fullRoutePrice: 2200000.5,
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách TET khi có baseOriginRoutePointId.
    it('should reject TET policy with baseOriginRoutePointId', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.TET,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            fullRoutePrice: 2200000,
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePoint.findFirst).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách TET khi có routePointPrices.
    it('should reject TET policy with routePointPrices', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.TET,
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            fullRoutePrice: 2200000,
            routePointPrices: [
                {
                    routePointId: 'route-point-01',
                    priceType: PriceEntryType.FIXED,
                    price: 1000000,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePoint.findMany).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách TET khi có servicePointPrices.
    it('should reject TET policy with servicePointPrices', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.TET,
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            fullRoutePrice: 2200000,
            servicePointPrices: [
                {
                    servicePointId: 'service-point-01',
                    priceType: PriceEntryType.FIXED,
                    price: 1200000,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.servicePoint.findMany).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách TET khi có priceOverrides.
    it('should reject TET policy with priceOverrides', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
            routePricePolicy: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.TET,
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            fullRoutePrice: 2200000,
            priceOverrides: [
                {
                    fromPointType: PricePointType.ROUTE_POINT,
                    toPointType: PricePointType.ROUTE_POINT,
                    fromPointKey: 'RP:route-point-01',
                    toPointKey: 'RP:route-point-05',
                    fromRoutePointId: 'route-point-01',
                    toRoutePointId: 'route-point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 1500000,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });
    
    // Từ chối tạo RoutePointPrice FIXED khi thiếu price.
    it('should reject FIXED RoutePointPrice without price', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([
                    { id: 'route-point-05' },
                ]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routePointPrices: [
                {
                    routePointId: 'route-point-05',
                    priceType: PriceEntryType.FIXED,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo RoutePointPrice FIXED khi price bằng 0.
    it('should reject FIXED RoutePointPrice with zero price', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([
                    { id: 'route-point-05' },
                ]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routePointPrices: [
                {
                    routePointId: 'route-point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 0,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo RoutePointPrice FIXED khi price âm.
    it('should reject FIXED RoutePointPrice with negative price', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([
                    { id: 'route-point-05' },
                ]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routePointPrices: [
                {
                    routePointId: 'route-point-05',
                    priceType: PriceEntryType.FIXED,
                    price: -100000,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo RoutePointPrice FIXED khi price có phần thập phân.
    it('should reject FIXED RoutePointPrice with decimal price', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([
                    { id: 'route-point-05' },
                ]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routePointPrices: [
                {
                    routePointId: 'route-point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 1000000.5,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo RoutePointPrice CONTACT khi vẫn truyền price.
    it('should reject CONTACT RoutePointPrice with price', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([
                    { id: 'route-point-05' },
                ]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routePointPrices: [
                {
                    routePointId: 'route-point-05',
                    priceType: PriceEntryType.CONTACT,
                    price: 1000000,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Chấp nhận RoutePointPrice CONTACT khi không truyền price.
    it('should accept CONTACT RoutePointPrice without price', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn()
                    .mockResolvedValueOnce([
                        { id: 'route-point-05' },
                    ])
                    .mockResolvedValueOnce([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                }),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routePointPrices: [
                {
                    routePointId: 'route-point-05',
                    priceType: PriceEntryType.CONTACT,
                },
            ],
        };

        await expect(service.create(dto)).resolves.toBeDefined();

        expect(txMock.routePricePolicy.create).toHaveBeenCalled();
    });

    // Từ chối tạo ServicePointPrice FIXED khi không có price.
    it('should reject FIXED ServicePointPrice without price', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([
                    { id: 'service-point-01' },
                ]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            servicePointPrices: [
                {
                    servicePointId: 'service-point-01',
                    priceType: PriceEntryType.FIXED,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo ServicePointPrice FIXED khi price bằng 0.
    it('should reject FIXED ServicePointPrice with zero price', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([
                    { id: 'service-point-01' },
                ]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            servicePointPrices: [
                {
                    servicePointId: 'service-point-01',
                    priceType: PriceEntryType.FIXED,
                    price: 0,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo ServicePointPrice FIXED khi price âm.
    it('should reject FIXED ServicePointPrice with negative price', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([
                    { id: 'service-point-01' },
                ]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            servicePointPrices: [
                {
                    servicePointId: 'service-point-01',
                    priceType: PriceEntryType.FIXED,
                    price: -100000,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo ServicePointPrice FIXED khi price có phần thập phân.
    it('should reject FIXED ServicePointPrice with decimal price', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([
                    { id: 'service-point-01' },
                ]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            servicePointPrices: [
                {
                    servicePointId: 'service-point-01',
                    priceType: PriceEntryType.FIXED,
                    price: 1000000.5,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo ServicePointPrice CONTACT khi vẫn truyền price.
    it('should reject CONTACT ServicePointPrice with price', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([
                    { id: 'service-point-01' },
                ]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            servicePointPrices: [
                {
                    servicePointId: 'service-point-01',
                    priceType: PriceEntryType.CONTACT,
                    price: 1000000,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Chấp nhận ServicePointPrice CONTACT khi không truyền price.
    it('should accept CONTACT ServicePointPrice without price', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([]),
            },
            servicePoint: {
                findMany: jest.fn()
                    .mockResolvedValueOnce([
                        { id: 'service-point-01' },
                    ])
                    .mockResolvedValueOnce([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                }),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            servicePointPrices: [
                {
                    servicePointId: 'service-point-01',
                    priceType: PriceEntryType.CONTACT,
                },
            ],
        };

        await expect(service.create(dto)).resolves.toBeDefined();

        expect(txMock.routePricePolicy.create).toHaveBeenCalled();
    });

    // Từ chối tạo chính sách khi ServicePoint không thuộc tuyến đã chọn.
    it('should reject ServicePointPrice outside selected route', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            servicePointPrices: [
                {
                    servicePointId: 'service-point-other-route',
                    priceType: PriceEntryType.CONTACT,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách khi RoutePoint không thuộc tuyến đã chọn.
    it('should reject RoutePointPrice outside selected route', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([]),
            },
            servicePoint: {
                findMany: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routePointPrices: [
                {
                    routePointId: 'route-point-other-route',
                    priceType: PriceEntryType.CONTACT,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách nếu một RoutePoint được khai báo giá nhiều lần.
    it('should reject duplicate RoutePointPrice entries', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([
                    { id: 'route-point-01' },
                ]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            routePointPrices: [
                {
                    routePointId: 'route-point-01',
                    priceType: PriceEntryType.FIXED,
                    price: 500000,
                },
                {
                    routePointId: 'route-point-01',
                    priceType: PriceEntryType.FIXED,
                    price: 600000,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách nếu một ServicePoint được khai báo giá nhiều lần.
    it('should reject duplicate ServicePointPrice entries', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn()
                    .mockResolvedValueOnce([
                        { id: 'service-point-01' },
                    ])
                    .mockResolvedValueOnce([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            servicePointPrices: [
                {
                    servicePointId: 'service-point-01',
                    priceType: PriceEntryType.FIXED,
                    price: 500000,
                },
                {
                    servicePointId: 'service-point-01',
                    priceType: PriceEntryType.FIXED,
                    price: 600000,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối tạo chính sách nếu khai báo trùng cặp điểm trong PriceOverride.
    it('should reject duplicate PriceOverride entries', async () => {
        const txMock = {
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePricePolicy: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const dto = {
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'route-point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            effectiveFrom: '2026-12-01T00:00:00.000Z',
            priceOverrides: [
                {
                    fromPointType: PricePointType.ROUTE_POINT,
                    toPointType: PricePointType.ROUTE_POINT,
                    fromPointKey: 'RP:route-point-01',
                    toPointKey: 'RP:route-point-02',
                    fromRoutePointId: 'route-point-01',
                    toRoutePointId: 'route-point-02',
                    priceType: PriceEntryType.FIXED,
                    price: 500000,
                },
                {
                    fromPointType: PricePointType.ROUTE_POINT,
                    toPointType: PricePointType.ROUTE_POINT,
                    fromPointKey: 'RP:route-point-01',
                    toPointKey: 'RP:route-point-02',
                    fromRoutePointId: 'route-point-01',
                    toRoutePointId: 'route-point-02',
                    priceType: PriceEntryType.FIXED,
                    price: 600000,
                },
            ],
        };

        await expect(service.create(dto)).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.create).not.toHaveBeenCalled();
    });

    // Từ chối cập nhật nếu không tìm thấy chính sách giá.
    it('should throw NotFoundException when updating non-existing policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(null),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-not-found', {}),
        ).rejects.toThrow(NotFoundException);

        expect(txMock.routePricePolicy.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'policy-not-found' },
            }),
        );
    });

    // Từ chối cập nhật chính sách không còn ở trạng thái DRAFT.
    it('should reject updating non-DRAFT policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    status: PricePolicyStatus.ACTIVE,
                }),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {}),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'policy-01' },
            }),
        );
    });

    // Từ chối cập nhật nếu dữ liệu cũ không hợp lệ sau khi hợp nhất DTO.
    it('should validate merged policy data when updating', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: null,
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: null,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            servicePoint: {
                findMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                version: 2,
            }),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.route.findUnique).toHaveBeenCalled();
        expect(txMock.routePoint.findFirst).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    
    // Giữ nguyên RoutePointPrice cũ khi request không gửi mảng RoutePointPrice mới.
    it('should preserve RoutePointPrices when not provided in update DTO', async () => {
        const existingRoutePointPrices = [
            {
                id: 'route-point-price-01',
                routePointId: 'route-point-05',
                priceType: PriceEntryType.FIXED,
                price: 1000000,
            },
        ];

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn()
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        routeId: 'route-01',
                        pricingMode: RouteScheduleType.NORMAL,
                        baseOriginRoutePointId: 'route-point-01',
                        direction: TripDirection.OUTBOUND,
                        vehicleType: '44_GIUONG',
                        version: 1,
                        status: PricePolicyStatus.DRAFT,
                        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                        effectiveTo: null,
                        fullRoutePrice: null,
                        routeAdjustmentAmount: 0,
                        routePointPrices: existingRoutePointPrices,
                        servicePointPrices: [],
                        priceOverrides: [],
                    })
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                    }),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockImplementation(({ where }) => {
                    // Trả về các RoutePoint khớp với danh sách ID cần kiểm tra.
                    return Promise.resolve(
                        (where.id.in ?? []).map((id: string) => ({ id })),
                    );
                }),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePointPrice: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await service.update('policy-01', {
            version: 2,
        });

        expect(txMock.routePointPrice.deleteMany).not.toHaveBeenCalled();
        expect(txMock.routePointPrice.createMany).not.toHaveBeenCalled();
    });

    // Giữ nguyên ServicePointPrice cũ khi request không gửi mảng ServicePointPrice mới.
    it('should preserve ServicePointPrices when not provided in update DTO', async () => {
        const existingServicePointPrices = [
            {
                id: 'service-point-price-01',
                servicePointId: 'service-point-01',
                priceType: PriceEntryType.FIXED,
                price: 1200000,
            },
        ];

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn()
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        routeId: 'route-01',
                        pricingMode: RouteScheduleType.NORMAL,
                        baseOriginRoutePointId: 'route-point-01',
                        direction: TripDirection.OUTBOUND,
                        vehicleType: '44_GIUONG',
                        version: 1,
                        status: PricePolicyStatus.DRAFT,
                        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                        effectiveTo: null,
                        fullRoutePrice: null,
                        routeAdjustmentAmount: 0,
                        routePointPrices: [],
                        servicePointPrices: existingServicePointPrices,
                        priceOverrides: [],
                    })
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                    }),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockImplementation(({ where }) => {
                    // Trả về các RoutePoint khớp với danh sách ID cần kiểm tra.
                    return Promise.resolve(
                        (where.id.in ?? []).map((id: string) => ({ id })),
                    );
                }),
            },
            servicePoint: {
                findMany: jest.fn().mockImplementation(({ where }) => {
                    // Trả về các ServicePoint khớp với danh sách ID cần kiểm tra.
                    return Promise.resolve(
                        (where.id.in ?? []).map((id: string) => ({ id })),
                    );
                }),
            },
            servicePointPrice: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await service.update('policy-01', {
            version: 2,
        });

        expect(txMock.servicePointPrice.deleteMany).not.toHaveBeenCalled();
        expect(txMock.servicePointPrice.createMany).not.toHaveBeenCalled();
    });

    // Giữ nguyên PriceOverride cũ khi request không gửi mảng PriceOverride mới.
    it('should preserve PriceOverrides when not provided in update DTO', async () => {
        const existingPriceOverrides = [
            {
                id: 'price-override-01',
                fromPointType: PricePointType.ROUTE_POINT,
                toPointType: PricePointType.ROUTE_POINT,
                fromPointKey: 'RP:route-point-01',
                toPointKey: 'RP:route-point-05',
                fromRoutePointId: 'route-point-01',
                fromServicePointId: null,
                toRoutePointId: 'route-point-05',
                toServicePointId: null,
                priceType: PriceEntryType.FIXED,
                price: 900000,
            },
        ];

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn()
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        routeId: 'route-01',
                        pricingMode: RouteScheduleType.NORMAL,
                        baseOriginRoutePointId: 'route-point-01',
                        direction: TripDirection.OUTBOUND,
                        vehicleType: '44_GIUONG',
                        version: 1,
                        status: PricePolicyStatus.DRAFT,
                        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                        effectiveTo: null,
                        fullRoutePrice: null,
                        routeAdjustmentAmount: 0,
                        routePointPrices: [],
                        servicePointPrices: [],
                        priceOverrides: existingPriceOverrides,
                    })
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                    }),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockImplementation(({ where }) => {
                    // Trả về các RoutePoint khớp với danh sách ID cần kiểm tra.
                    return Promise.resolve(
                        (where.id.in ?? []).map((id: string) => ({ id })),
                    );
                }),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePriceOverride: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await service.update('policy-01', {
            version: 2,
        });

        expect(txMock.routePriceOverride.deleteMany).not.toHaveBeenCalled();
        expect(txMock.routePriceOverride.createMany).not.toHaveBeenCalled();
    });

    // Thay thế RoutePointPrice cũ khi request gửi mảng RoutePointPrice mới.
    it('should replace RoutePointPrices when provided in update DTO', async () => {
        const existingRoutePointPrices = [
            {
                id: 'route-point-price-01',
                routePointId: 'route-point-05',
                priceType: PriceEntryType.FIXED,
                price: 1000000,
            },
        ];

        const newRoutePointPrices = [
            {
                routePointId: 'route-point-06',
                priceType: PriceEntryType.FIXED,
                price: 1200000,
            },
        ];

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn()
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        routeId: 'route-01',
                        pricingMode: RouteScheduleType.NORMAL,
                        baseOriginRoutePointId: 'route-point-01',
                        direction: TripDirection.OUTBOUND,
                        vehicleType: '44_GIUONG',
                        version: 1,
                        status: PricePolicyStatus.DRAFT,
                        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                        effectiveTo: null,
                        fullRoutePrice: null,
                        routeAdjustmentAmount: 0,
                        routePointPrices: existingRoutePointPrices,
                        servicePointPrices: [],
                        priceOverrides: [],
                    })
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                    }),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockImplementation(({ where }) => {
                    // Trả về các RoutePoint khớp với danh sách ID cần kiểm tra.
                    return Promise.resolve(
                        (where.id.in ?? []).map((id: string) => ({ id })),
                    );
                }),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePointPrice: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await service.update('policy-01', {
            version: 2,
            routePointPrices: newRoutePointPrices,
        });

        expect(txMock.routePointPrice.deleteMany).toHaveBeenCalledWith({
            where: { policyId: 'policy-01' },
        });

        expect(txMock.routePointPrice.createMany).toHaveBeenCalledWith({
            data: [
                {
                    policyId: 'policy-01',
                    routePointId: 'route-point-06',
                    priceType: PriceEntryType.FIXED,
                    price: 1200000,
                },
            ],
        });

        expect(txMock.routePointPrice.deleteMany).toHaveBeenCalledTimes(1);
        expect(txMock.routePointPrice.createMany).toHaveBeenCalledTimes(1);
    });

    // Từ chối cập nhật nếu DTO chứa RoutePointPrice bị trùng.
    it('should reject duplicate RoutePointPrice entries when updating policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'route-point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: null,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                findFirst: jest.fn(),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([
                    { id: 'route-point-05' },
                ]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePointPrice: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                routePointPrices: [
                    {
                        routePointId: 'route-point-05',
                        priceType: PriceEntryType.FIXED,
                        price: 1000000,
                    },
                    {
                        routePointId: 'route-point-05',
                        priceType: PriceEntryType.FIXED,
                        price: 1200000,
                    },
                ],
            }),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
        expect(txMock.routePointPrice.deleteMany).not.toHaveBeenCalled();
        expect(txMock.routePointPrice.createMany).not.toHaveBeenCalled();
    });

    // Từ chối cập nhật nếu DTO chứa ServicePointPrice bị trùng.
    it('should reject duplicate ServicePointPrice entries when updating policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'route-point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: null,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                findFirst: jest.fn(),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([
                    { id: 'service-point-01' },
                ]),
            },
            servicePointPrice: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                servicePointPrices: [
                    {
                        servicePointId: 'service-point-01',
                        priceType: PriceEntryType.FIXED,
                        price: 1000000,
                    },
                    {
                        servicePointId: 'service-point-01',
                        priceType: PriceEntryType.FIXED,
                        price: 1200000,
                    },
                ],
            }),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
        expect(txMock.servicePointPrice.deleteMany).not.toHaveBeenCalled();
        expect(txMock.servicePointPrice.createMany).not.toHaveBeenCalled();
    });

    // Từ chối cập nhật nếu DTO chứa PriceOverride bị trùng.
    it('should reject duplicate PriceOverride entries when updating policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'route-point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: null,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                findFirst: jest.fn(),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([
                    { id: 'route-point-01' },
                    { id: 'route-point-05' },
                ]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePriceOverride: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                priceOverrides: [
                    {
                        fromPointType: PricePointType.ROUTE_POINT,
                        toPointType: PricePointType.ROUTE_POINT,
                        fromPointKey: 'RP:route-point-01',
                        toPointKey: 'RP:route-point-05',
                        fromRoutePointId: 'route-point-01',
                        toRoutePointId: 'route-point-05',
                        priceType: PriceEntryType.FIXED,
                        price: 1000000,
                    },
                    {
                        fromPointType: PricePointType.ROUTE_POINT,
                        toPointType: PricePointType.ROUTE_POINT,
                        fromPointKey: 'RP:route-point-01',
                        toPointKey: 'RP:route-point-05',
                        fromRoutePointId: 'route-point-01',
                        toRoutePointId: 'route-point-05',
                        priceType: PriceEntryType.FIXED,
                        price: 1200000,
                    },
                ],
            }),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
        expect(txMock.routePriceOverride.deleteMany).not.toHaveBeenCalled();
        expect(txMock.routePriceOverride.createMany).not.toHaveBeenCalled();
    });

    // Thay thế ServicePointPrice cũ khi request gửi mảng ServicePointPrice mới.
    it('should replace ServicePointPrices when provided in update DTO', async () => {
        const existingServicePointPrices = [
            {
                id: 'service-point-price-01',
                servicePointId: 'service-point-01',
                priceType: PriceEntryType.FIXED,
                price: 1000000,
            },
        ];

        const newServicePointPrices = [
            {
                servicePointId: 'service-point-02',
                priceType: PriceEntryType.FIXED,
                price: 1200000,
            },
        ];

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn()
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        routeId: 'route-01',
                        pricingMode: RouteScheduleType.NORMAL,
                        baseOriginRoutePointId: 'route-point-01',
                        direction: TripDirection.OUTBOUND,
                        vehicleType: '44_GIUONG',
                        version: 1,
                        status: PricePolicyStatus.DRAFT,
                        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                        effectiveTo: null,
                        fullRoutePrice: null,
                        routeAdjustmentAmount: 0,
                        routePointPrices: [],
                        servicePointPrices: existingServicePointPrices,
                        priceOverrides: [],
                    })
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                    }),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockImplementation(({ where }) => {
                    // Trả về các ServicePoint khớp với danh sách ID cần kiểm tra.
                    return Promise.resolve(
                        (where.id.in ?? []).map((id: string) => ({ id })),
                    );
                }),
            },
            servicePointPrice: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await service.update('policy-01', {
            version: 2,
            servicePointPrices: newServicePointPrices,
        });

        expect(txMock.servicePointPrice.deleteMany).toHaveBeenCalledWith({
            where: { policyId: 'policy-01' },
        });

        expect(txMock.servicePointPrice.createMany).toHaveBeenCalledWith({
            data: [
                {
                    policyId: 'policy-01',
                    servicePointId: 'service-point-02',
                    priceType: PriceEntryType.FIXED,
                    price: 1200000,
                },
            ],
        });

        expect(txMock.servicePointPrice.deleteMany).toHaveBeenCalledTimes(1);
        expect(txMock.servicePointPrice.createMany).toHaveBeenCalledTimes(1);
    });

    // Thay thế PriceOverride cũ khi request gửi mảng PriceOverride mới.
    it('should replace PriceOverrides when provided in update DTO', async () => {
        const existingPriceOverrides = [
            {
                id: 'price-override-01',
                fromPointType: PricePointType.ROUTE_POINT,
                toPointType: PricePointType.ROUTE_POINT,
                fromPointKey: 'RP:route-point-01',
                toPointKey: 'RP:route-point-05',
                fromRoutePointId: 'route-point-01',
                fromServicePointId: null,
                toRoutePointId: 'route-point-05',
                toServicePointId: null,
                priceType: PriceEntryType.FIXED,
                price: 900000,
            },
        ];

        const newPriceOverrides = [
            {
                fromPointType: PricePointType.ROUTE_POINT,
                toPointType: PricePointType.ROUTE_POINT,
                fromPointKey: 'RP:route-point-01',
                toPointKey: 'RP:route-point-06',
                fromRoutePointId: 'route-point-01',
                toRoutePointId: 'route-point-06',
                priceType: PriceEntryType.FIXED,
                price: 1100000,
            },
        ];

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn()
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        routeId: 'route-01',
                        pricingMode: RouteScheduleType.NORMAL,
                        baseOriginRoutePointId: 'route-point-01',
                        direction: TripDirection.OUTBOUND,
                        vehicleType: '44_GIUONG',
                        version: 1,
                        status: PricePolicyStatus.DRAFT,
                        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                        effectiveTo: null,
                        fullRoutePrice: null,
                        routeAdjustmentAmount: 0,
                        routePointPrices: [],
                        servicePointPrices: [],
                        priceOverrides: existingPriceOverrides,
                    })
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                    }),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockImplementation(({ where }) => {
                    // Trả về các RoutePoint khớp với danh sách ID cần kiểm tra.
                    return Promise.resolve(
                        (where.id.in ?? []).map((id: string) => ({ id })),
                    );
                }),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePriceOverride: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await service.update('policy-01', {
            version: 2,
            priceOverrides: newPriceOverrides,
        });

        expect(txMock.routePriceOverride.deleteMany).toHaveBeenCalledWith({
            where: { policyId: 'policy-01' },
        });

        expect(txMock.routePriceOverride.createMany).toHaveBeenCalledWith({
            data: [
                {
                    policyId: 'policy-01',
                    fromPointType: PricePointType.ROUTE_POINT,
                    toPointType: PricePointType.ROUTE_POINT,
                    fromPointKey: 'RP:route-point-01',
                    toPointKey: 'RP:route-point-06',
                    fromRoutePointId: 'route-point-01',
                    fromServicePointId: null,
                    toRoutePointId: 'route-point-06',
                    toServicePointId: null,
                    priceType: PriceEntryType.FIXED,
                    price: 1100000,
                },
            ],
        });

        expect(txMock.routePriceOverride.deleteMany).toHaveBeenCalledTimes(1);
        expect(txMock.routePriceOverride.createMany).toHaveBeenCalledTimes(1);
    });

    // Xóa toàn bộ RoutePointPrice khi request gửi mảng rỗng.
    it('should delete all RoutePointPrices when empty array is provided', async () => {
        const existingRoutePointPrices = [
            {
                id: 'route-point-price-01',
                routePointId: 'route-point-05',
                priceType: PriceEntryType.FIXED,
                price: 1000000,
            },
        ];

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn()
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        routeId: 'route-01',
                        pricingMode: RouteScheduleType.NORMAL,
                        baseOriginRoutePointId: 'route-point-01',
                        direction: TripDirection.OUTBOUND,
                        vehicleType: '44_GIUONG',
                        version: 1,
                        status: PricePolicyStatus.DRAFT,
                        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                        effectiveTo: null,
                        fullRoutePrice: null,
                        routeAdjustmentAmount: 0,
                        routePointPrices: existingRoutePointPrices,
                        servicePointPrices: [],
                        priceOverrides: [],
                    })
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                    }),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePointPrice: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await service.update('policy-01', {
            version: 2,
            routePointPrices: [],
        });

        expect(txMock.routePointPrice.deleteMany).toHaveBeenCalledWith({
            where: { policyId: 'policy-01' },
        });

        expect(txMock.routePointPrice.deleteMany).toHaveBeenCalledTimes(1);
        expect(txMock.routePointPrice.createMany).not.toHaveBeenCalled();
    });

    // Xóa toàn bộ ServicePointPrice khi request gửi mảng rỗng.
    it('should delete all ServicePointPrices when empty array is provided', async () => {
        const existingServicePointPrices = [
            {
                id: 'service-point-price-01',
                servicePointId: 'service-point-01',
                priceType: PriceEntryType.FIXED,
                price: 1000000,
            },
        ];

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn()
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        routeId: 'route-01',
                        pricingMode: RouteScheduleType.NORMAL,
                        baseOriginRoutePointId: 'route-point-01',
                        direction: TripDirection.OUTBOUND,
                        vehicleType: '44_GIUONG',
                        version: 1,
                        status: PricePolicyStatus.DRAFT,
                        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                        effectiveTo: null,
                        fullRoutePrice: null,
                        routeAdjustmentAmount: 0,
                        routePointPrices: [],
                        servicePointPrices: existingServicePointPrices,
                        priceOverrides: [],
                    })
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                    }),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePointPrice: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await service.update('policy-01', {
            version: 2,
            servicePointPrices: [],
        });

        expect(txMock.servicePointPrice.deleteMany).toHaveBeenCalledWith({
            where: { policyId: 'policy-01' },
        });

        expect(txMock.servicePointPrice.deleteMany).toHaveBeenCalledTimes(1);
        expect(txMock.servicePointPrice.createMany).not.toHaveBeenCalled();
    });

    // Xóa toàn bộ PriceOverride khi request gửi mảng rỗng.
    it('should delete all PriceOverrides when empty array is provided', async () => {
        const existingPriceOverrides = [
            {
                id: 'price-override-01',
                fromPointType: PricePointType.ROUTE_POINT,
                toPointType: PricePointType.ROUTE_POINT,
                fromPointKey: 'RP:route-point-01',
                toPointKey: 'RP:route-point-05',
                fromRoutePointId: 'route-point-01',
                fromServicePointId: null,
                toRoutePointId: 'route-point-05',
                toServicePointId: null,
                priceType: PriceEntryType.FIXED,
                price: 900000,
            },
        ];

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn()
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        routeId: 'route-01',
                        pricingMode: RouteScheduleType.NORMAL,
                        baseOriginRoutePointId: 'route-point-01',
                        direction: TripDirection.OUTBOUND,
                        vehicleType: '44_GIUONG',
                        version: 1,
                        status: PricePolicyStatus.DRAFT,
                        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                        effectiveTo: null,
                        fullRoutePrice: null,
                        routeAdjustmentAmount: 0,
                        routePointPrices: [],
                        servicePointPrices: [],
                        priceOverrides: existingPriceOverrides,
                    })
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                    }),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routePriceOverride: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await service.update('policy-01', {
            version: 2,
            priceOverrides: [],
        });

        expect(txMock.routePriceOverride.deleteMany).toHaveBeenCalledWith({
            where: { policyId: 'policy-01' },
        });

        expect(txMock.routePriceOverride.deleteMany).toHaveBeenCalledTimes(1);
        expect(txMock.routePriceOverride.createMany).not.toHaveBeenCalled();
    });

    // Không cập nhật nếu chính sách giá không tồn tại.
    it('should not update policy when policy does not exist', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(null),
                update: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-not-found', {
                version: 2,
            }),
        ).rejects.toThrow(NotFoundException);

        expect(txMock.routePricePolicy.findUnique).toHaveBeenCalledWith({
            where: { id: 'policy-not-found' },
            include: {
                routePointPrices: true,
                servicePointPrices: true,
                priceOverrides: true,
            },
        });

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Từ chối cập nhật nếu phiên bản mới đã tồn tại trong cùng phạm vi chính sách.
    it('should reject updating to an existing policy version', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'route-point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: null,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                findFirst: jest.fn().mockResolvedValue({
                    id: 'policy-02',
                }),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                version: 2,
            }),
        ).rejects.toThrow(ConflictException);

        expect(txMock.routePricePolicy.findFirst).toHaveBeenCalledWith({
            where: {
                id: { not: 'policy-01' },
                routeId: 'route-01',
                pricingMode: RouteScheduleType.NORMAL,
                direction: TripDirection.OUTBOUND,
                vehicleType: '44_GIUONG',
                version: 2,
            },
        });

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Cho phép cập nhật phiên bản khi không tồn tại chính sách trùng phạm vi.
    it('should update policy when new version is unique', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn()
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        routeId: 'route-01',
                        pricingMode: RouteScheduleType.NORMAL,
                        baseOriginRoutePointId: 'route-point-01',
                        direction: TripDirection.OUTBOUND,
                        vehicleType: '44_GIUONG',
                        version: 1,
                        status: PricePolicyStatus.DRAFT,
                        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                        effectiveTo: null,
                        fullRoutePrice: null,
                        routeAdjustmentAmount: 0,
                        routePointPrices: [],
                        servicePointPrices: [],
                        priceOverrides: [],
                    })
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        version: 2,
                    }),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    version: 2,
                }),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const result = await service.update('policy-01', {
            version: 2,
        });

        expect(txMock.routePricePolicy.findFirst).toHaveBeenCalledWith({
            where: {
                id: { not: 'policy-01' },
                routeId: 'route-01',
                pricingMode: RouteScheduleType.NORMAL,
                direction: TripDirection.OUTBOUND,
                vehicleType: '44_GIUONG',
                version: 2,
            },
        });

        expect(txMock.routePricePolicy.update).toHaveBeenCalled();
        expect(result).toEqual({
            id: 'policy-01',
            version: 2,
        });
    });

    // Không kiểm tra phiên bản trùng khi cập nhật trường không ảnh hưởng phạm vi chính sách.
    it('should not check duplicate version when updating unrelated fields', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn()
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        routeId: 'route-01',
                        pricingMode: RouteScheduleType.NORMAL,
                        baseOriginRoutePointId: 'route-point-01',
                        direction: TripDirection.OUTBOUND,
                        vehicleType: '44_GIUONG',
                        version: 1,
                        status: PricePolicyStatus.DRAFT,
                        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                        effectiveTo: null,
                        fullRoutePrice: null,
                        routeAdjustmentAmount: 0,
                        routePointPrices: [],
                        servicePointPrices: [],
                        priceOverrides: [],
                    })
                    .mockResolvedValueOnce({
                        id: 'policy-01',
                        routeAdjustmentAmount: 100000,
                    }),
                findFirst: jest.fn(),
                update: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeAdjustmentAmount: 100000,
                }),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const result = await service.update('policy-01', {
            routeAdjustmentAmount: 100000,
        });

        expect(txMock.routePricePolicy.findFirst).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.update).toHaveBeenCalled();

        expect(result).toEqual({
            id: 'policy-01',
            routeAdjustmentAmount: 100000,
        });
    });

    // Kiểm tra phiên bản trùng khi thay đổi tuyến của chính sách.
    it('should check duplicate version when changing route', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'route-point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: null,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                findFirst: jest.fn().mockResolvedValue({
                    id: 'policy-02',
                }),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-02',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'route-point-02',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                routeId: 'route-02',
                baseOriginRoutePointId: 'route-point-02',
            }),
        ).rejects.toThrow(ConflictException);

        expect(txMock.routePricePolicy.findFirst).toHaveBeenCalledWith({
            where: {
                id: { not: 'policy-01' },
                routeId: 'route-02',
                pricingMode: RouteScheduleType.NORMAL,
                direction: TripDirection.OUTBOUND,
                vehicleType: '44_GIUONG',
                version: 1,
            },
        });

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra phiên bản trùng khi thay đổi chế độ định giá.
    it('should check duplicate version when changing pricing mode', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: null,
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: null,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                findFirst: jest.fn().mockResolvedValue({
                    id: 'policy-02',
                }),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn(),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                pricingMode: RouteScheduleType.TET,
                baseOriginRoutePointId: null,
                fullRoutePrice: 1500000,
            }),
        ).rejects.toThrow(ConflictException);

        expect(txMock.routePricePolicy.findFirst).toHaveBeenCalledWith({
            where: {
                id: { not: 'policy-01' },
                routeId: 'route-01',
                pricingMode: RouteScheduleType.TET,
                direction: TripDirection.OUTBOUND,
                vehicleType: '44_GIUONG',
                version: 1,
            },
        });

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra phiên bản trùng khi thay đổi chiều hoạt động của chính sách.
    it('should check duplicate version when changing direction', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: null,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                findFirst: jest.fn().mockResolvedValue({
                    id: 'policy-02',
                }),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                direction: TripDirection.RETURN,
            }),
        ).rejects.toThrow(ConflictException);

        expect(txMock.routePricePolicy.findFirst).toHaveBeenCalledWith({
            where: {
                id: { not: 'policy-01' },
                routeId: 'route-01',
                pricingMode: RouteScheduleType.NORMAL,
                direction: TripDirection.RETURN,
                vehicleType: '44_GIUONG',
                version: 1,
            },
        });

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra phiên bản trùng khi thay đổi loại xe của chính sách.
    it('should check duplicate version when changing vehicle type', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: null,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                findFirst: jest.fn().mockResolvedValue({
                    id: 'policy-02',
                }),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                vehicleType: '38_PHONG',
            }),
        ).rejects.toThrow(ConflictException);

        expect(txMock.routePricePolicy.findFirst).toHaveBeenCalledWith({
            where: {
                id: { not: 'policy-01' },
                routeId: 'route-01',
                pricingMode: RouteScheduleType.NORMAL,
                direction: TripDirection.OUTBOUND,
                vehicleType: '38_PHONG',
                version: 1,
            },
        });

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra xung đột khi thay đổi sang phiên bản đã tồn tại.
    it('should reject changing to an existing version', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: null,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                findFirst: jest.fn().mockResolvedValue({
                    id: 'policy-02',
                }),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                version: 2,
            }),
        ).rejects.toThrow(ConflictException);

        expect(txMock.routePricePolicy.findFirst).toHaveBeenCalledWith({
            where: {
                id: { not: 'policy-01' },
                routeId: 'route-01',
                pricingMode: RouteScheduleType.NORMAL,
                direction: TripDirection.OUTBOUND,
                vehicleType: '44_GIUONG',
                version: 2,
            },
        });

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra cập nhật thành công khi chuyển sang phiên bản chưa tồn tại.
    it('should update when changing to a unique version', async () => {
        const existingPolicy = {
            id: 'policy-01',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
            effectiveTo: null,
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(existingPolicy),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn().mockResolvedValue({
                    ...existingPolicy,
                    version: 2,
                }),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                version: 2,
            }),
        ).resolves.toBeDefined();

        expect(txMock.routePricePolicy.findFirst).toHaveBeenCalledWith({
            where: {
                id: { not: 'policy-01' },
                routeId: 'route-01',
                pricingMode: RouteScheduleType.NORMAL,
                direction: TripDirection.OUTBOUND,
                vehicleType: '44_GIUONG',
                version: 2,
            },
        });

        expect(txMock.routePricePolicy.update).toHaveBeenCalled();
    });

    // Kiểm tra không cho phép chỉnh sửa chính sách đang hoạt động.
    it('should reject updating an active pricing policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.ACTIVE,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: null,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                update: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                version: 2,
            }),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra không cho phép chỉnh sửa chính sách đã hết hạn.
    it('should reject updating an expired pricing policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.EXPIRED,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: new Date('2026-12-31T00:00:00.000Z'),
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                update: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.update('policy-01', {
                version: 2,
            }),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra không cho phép kích hoạt lại chính sách đang hoạt động.
    it('should reject activating an active pricing policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.ACTIVE,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: null,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                update: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-01'),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra không cho phép kích hoạt chính sách đã hết hạn.
    it('should reject activating an expired pricing policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.EXPIRED,
                    effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                    effectiveTo: new Date('2026-12-31T00:00:00.000Z'),
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                update: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-01'),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra trả về NotFoundException khi kích hoạt chính sách không tồn tại.
    it('should reject activating a non-existing pricing policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(null),
                update: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-not-found'),
        ).rejects.toThrow(NotFoundException);

        expect(txMock.routePricePolicy.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'policy-not-found',
                },
            }),
        );

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra không cho phép kích hoạt chính sách DRAFT đã quá hạn.
    it('should reject activating an expired draft policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2025-12-01T00:00:00.000Z'),
                    effectiveTo: new Date('2026-01-01T00:00:00.000Z'),
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-01'),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra không cho phép kích hoạt chính sách có thời điểm kết thúc bằng hiện tại.
    it('should reject activating a policy ending at the current time', async () => {
        const now = new Date();

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 1,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2025-12-01T00:00:00.000Z'),
                    effectiveTo: now,
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-01'),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra không cho phép kích hoạt chính sách có thời gian chồng lấn với chính sách ACTIVE khác.
    it('should reject activating a policy with overlapping active policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'policy-01',
                    routeId: 'route-01',
                    pricingMode: RouteScheduleType.NORMAL,
                    baseOriginRoutePointId: 'point-01',
                    direction: TripDirection.OUTBOUND,
                    vehicleType: '44_GIUONG',
                    version: 2,
                    status: PricePolicyStatus.DRAFT,
                    effectiveFrom: new Date('2026-12-10T00:00:00.000Z'),
                    effectiveTo: new Date('2026-12-30T00:00:00.000Z'),
                    fullRoutePrice: null,
                    routeAdjustmentAmount: 0,
                    routePointPrices: [],
                    servicePointPrices: [],
                    priceOverrides: [],
                }),
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'policy-active-01',
                        status: PricePolicyStatus.ACTIVE,
                        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                        effectiveTo: new Date('2026-12-20T00:00:00.000Z'),
                    },
                ]),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-01'),
        ).rejects.toThrow(ConflictException);

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra cho phép kích hoạt khi không có chính sách ACTIVE chồng lấn thời gian.
    it('should allow activating a policy without overlapping active policies', async () => {
        const now = new Date();
        const effectiveFrom = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const effectiveTo = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const policy = {
            id: 'policy-01',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 2,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom,
            effectiveTo,
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn().mockResolvedValue({
                    ...policy,
                    status: PricePolicyStatus.ACTIVE,
                }),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-01'),
        ).resolves.toBeDefined();

        expect(txMock.routePricePolicy.findMany).toHaveBeenCalled();

        expect(txMock.routePricePolicy.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'policy-01' },
                data: expect.objectContaining({
                    status: PricePolicyStatus.ACTIVE,
                }),
            }),
        );
    });

    // Kiểm tra cho phép kích hoạt chính sách DRAFT có thời điểm bắt đầu trong tương lai.
    it('should allow activating a draft policy with future effective date', async () => {
        const now = new Date();
        const effectiveFrom = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const effectiveTo = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const policy = {
            id: 'policy-01',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 2,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom,
            effectiveTo,
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn().mockResolvedValue({
                    ...policy,
                    status: PricePolicyStatus.ACTIVE,
                }),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({ id: 'route-01' }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-01'),
        ).resolves.toBeDefined();

        expect(txMock.routePricePolicy.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'policy-01' },
                data: expect.objectContaining({
                    status: PricePolicyStatus.ACTIVE,
                }),
            }),
        );
    });

    // Kiểm tra cho phép kích hoạt chính sách DRAFT không giới hạn ngày kết thúc.
    it('should allow activating a draft policy without effective end date', async () => {
        const now = new Date();

        const policy = {
            id: 'policy-01',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 2,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            effectiveTo: null,
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn().mockResolvedValue({
                    ...policy,
                    status: PricePolicyStatus.ACTIVE,
                }),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({ id: 'route-01' }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-01'),
        ).resolves.toBeDefined();

        expect(txMock.routePricePolicy.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'policy-01' },
                data: expect.objectContaining({
                    status: PricePolicyStatus.ACTIVE,
                }),
            }),
        );
    });

    // Kiểm tra kích hoạt thành công chính sách TET sử dụng giá toàn tuyến.
    it('should activate a valid TET pricing policy', async () => {
        const policy = {
            id: 'policy-tet-01',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.TET,
            baseOriginRoutePointId: null,
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date(Date.now() + 24 * 60 * 60 * 1000),
            effectiveTo: null,
            fullRoutePrice: 1500000,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn().mockResolvedValue({
                    ...policy,
                    status: PricePolicyStatus.ACTIVE,
                }),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({ id: 'route-01' }),
            },
            routePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-tet-01'),
        ).resolves.toBeDefined();

        expect(txMock.routePricePolicy.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'policy-tet-01' },
                data: expect.objectContaining({
                    status: PricePolicyStatus.ACTIVE,
                }),
            }),
        );
    });

    // Kiểm tra không cho phép kích hoạt chính sách TET thiếu giá toàn tuyến.
    it('should reject activating a TET policy without full route price', async () => {
        const policy = {
            id: 'policy-tet-01',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.TET,
            baseOriginRoutePointId: null,
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date(Date.now() + 24 * 60 * 60 * 1000),
            effectiveTo: null,
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({ id: 'route-01' }),
            },
            routePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-tet-01'),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Kiểm tra kích hoạt thành công chính sách NORMAL hợp lệ.
    it('should activate a valid NORMAL pricing policy', async () => {
        const policy = {
            id: 'policy-normal-01',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date(Date.now() + 24 * 60 * 60 * 1000),
            effectiveTo: null,
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn().mockResolvedValue({
                    ...policy,
                    status: PricePolicyStatus.ACTIVE,
                }),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({ id: 'route-01' }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-normal-01'),
        ).resolves.toBeDefined();

        expect(txMock.routePricePolicy.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'policy-normal-01' },
                data: expect.objectContaining({
                    status: PricePolicyStatus.ACTIVE,
                }),
            }),
        );
    });

    // Từ chối kích hoạt NORMAL policy nếu dữ liệu RoutePointPrice bị trùng.
    it('should reject activating a NORMAL policy with duplicate RoutePointPrices', async () => {
        const policy = {
            id: 'policy-normal-duplicate-01',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date(Date.now() + 24 * 60 * 60 * 1000),
            effectiveTo: null,
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [
                {
                    routePointId: 'point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 1000000,
                },
                {
                    routePointId: 'point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 1200000,
                },
            ],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                findMany: jest.fn(),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([
                    { id: 'point-05' },
                ]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-normal-duplicate-01'),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.findMany).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Từ chối kích hoạt NORMAL policy nếu dữ liệu ServicePointPrice bị trùng.
    it('should reject activating a NORMAL policy with duplicate ServicePointPrices', async () => {
        const policy = {
            id: 'policy-normal-duplicate-02',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date(Date.now() + 24 * 60 * 60 * 1000),
            effectiveTo: null,
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [
                {
                    servicePointId: 'service-point-01',
                    priceType: PriceEntryType.FIXED,
                    price: 1000000,
                },
                {
                    servicePointId: 'service-point-01',
                    priceType: PriceEntryType.FIXED,
                    price: 1200000,
                },
            ],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                findMany: jest.fn(),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([
                    { id: 'service-point-01' },
                ]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-normal-duplicate-02'),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.findMany).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Từ chối kích hoạt NORMAL policy nếu dữ liệu PriceOverride bị trùng.
    it('should reject activating a NORMAL policy with duplicate PriceOverrides', async () => {
        const policy = {
            id: 'policy-normal-duplicate-03',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date(Date.now() + 24 * 60 * 60 * 1000),
            effectiveTo: null,
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [
                {
                    fromPointType: PricePointType.ROUTE_POINT,
                    toPointType: PricePointType.ROUTE_POINT,
                    fromPointKey: 'RP:point-01',
                    toPointKey: 'RP:point-05',
                    fromRoutePointId: 'point-01',
                    toRoutePointId: 'point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 1000000,
                },
                {
                    fromPointType: PricePointType.ROUTE_POINT,
                    toPointType: PricePointType.ROUTE_POINT,
                    fromPointKey: 'RP:point-01',
                    toPointKey: 'RP:point-05',
                    fromRoutePointId: 'point-01',
                    toRoutePointId: 'point-05',
                    priceType: PriceEntryType.FIXED,
                    price: 1200000,
                },
            ],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                findMany: jest.fn(),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([
                    { id: 'point-01' },
                    { id: 'point-05' },
                ]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-normal-duplicate-03'),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.findMany).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Từ chối kích hoạt NORMAL policy đã hết thời hạn hiệu lực.
    it('should reject activating an expired NORMAL policy', async () => {
        const policy = {
            id: 'policy-normal-expired-01',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 1,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            effectiveTo: new Date('2026-01-02T00:00:00.000Z'),
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                findMany: jest.fn(),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-normal-expired-01'),
        ).rejects.toThrow(
            new BadRequestException('Chính sách đã hết thời hạn hiệu lực'),
        );

        // Không được kiểm tra trùng lịch hoặc cập nhật trạng thái sau khi phát hiện hết hạn.
        expect(txMock.routePricePolicy.findMany).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Từ chối kích hoạt policy NORMAL nếu thời gian hiệu lực chồng lấn với policy ACTIVE.
    it('should reject activating a NORMAL policy when active policy overlaps', async () => {
        const policy = {
            id: 'policy-normal-overlap-01',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 2,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
            effectiveTo: new Date('2026-12-31T23:59:59.000Z'),
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'policy-active-01',
                        effectiveFrom: new Date('2026-12-15T00:00:00.000Z'),
                        effectiveTo: new Date('2027-01-15T00:00:00.000Z'),
                    },
                ]),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-normal-overlap-01'),
        ).rejects.toThrow(ConflictException);

        expect(txMock.routePricePolicy.findMany).toHaveBeenCalled();
        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Cho phép kích hoạt policy NORMAL khi thời gian hiệu lực không chồng lấn.
    it('should activate a NORMAL policy when active policy does not overlap', async () => {
        const policy = {
            id: 'policy-normal-no-overlap-01',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 2,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date('2027-01-01T00:00:00.000Z'),
            effectiveTo: new Date('2027-12-31T23:59:59.000Z'),
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn()
                    .mockResolvedValueOnce(policy)
                    .mockResolvedValueOnce({
                        ...policy,
                        status: PricePolicyStatus.ACTIVE,
                    }),
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'policy-active-old-01',
                        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
                        effectiveTo: new Date('2026-12-31T23:59:59.000Z'),
                    },
                ]),
                update: jest.fn().mockResolvedValue({
                    ...policy,
                    status: PricePolicyStatus.ACTIVE,
                }),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        const result = await service.activate('policy-normal-no-overlap-01');

        expect(result.status).toBe(PricePolicyStatus.ACTIVE);
        expect(txMock.routePricePolicy.update).toHaveBeenCalledWith({
            where: { id: 'policy-normal-no-overlap-01' },
            data: { status: PricePolicyStatus.ACTIVE },
        });
    });

    // Từ chối kích hoạt policy mới khi policy ACTIVE cũ có thời hạn vô hạn.
    it('should reject activating a NORMAL policy when active policy has no end date', async () => {
        const policy = {
            id: 'policy-normal-infinite-overlap-01',
            routeId: 'route-01',
            pricingMode: RouteScheduleType.NORMAL,
            baseOriginRoutePointId: 'point-01',
            direction: TripDirection.OUTBOUND,
            vehicleType: '44_GIUONG',
            version: 2,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date('2027-01-01T00:00:00.000Z'),
            effectiveTo: null,
            fullRoutePrice: null,
            routeAdjustmentAmount: 0,
            routePointPrices: [],
            servicePointPrices: [],
            priceOverrides: [],
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'policy-active-infinite-01',
                        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
                        effectiveTo: null,
                    },
                ]),
                update: jest.fn(),
            },
            route: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'route-01',
                }),
            },
            routePoint: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'point-01',
                    routeId: 'route-01',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            servicePoint: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-normal-infinite-overlap-01'),
        ).rejects.toThrow(ConflictException);

        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Từ chối kích hoạt khi không tìm thấy pricing policy.
    it('should throw NotFoundException when activating a non-existing policy', async () => {
        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(null),
                findMany: jest.fn(),
                update: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-not-found'),
        ).rejects.toThrow(NotFoundException);

        expect(txMock.routePricePolicy.findUnique).toHaveBeenCalledWith({
            where: { id: 'policy-not-found' },
            include: {
                routePointPrices: true,
                servicePointPrices: true,
                priceOverrides: true,
            },
        });

        expect(txMock.routePricePolicy.findMany).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });

    // Từ chối kích hoạt policy đã ở trạng thái ACTIVE.
    it('should reject activating a policy that is already ACTIVE', async () => {
        const policy = {
            id: 'policy-already-active-01',
            status: PricePolicyStatus.ACTIVE,
        };

        const txMock = {
            routePricePolicy: {
                findUnique: jest.fn().mockResolvedValue(policy),
                findMany: jest.fn(),
                update: jest.fn(),
            },
        };

        prismaMock.$transaction = jest.fn(
            async (callback: (tx: any) => Promise<any>) => callback(txMock),
        );

        await expect(
            service.activate('policy-already-active-01'),
        ).rejects.toThrow(BadRequestException);

        expect(txMock.routePricePolicy.findMany).not.toHaveBeenCalled();
        expect(txMock.routePricePolicy.update).not.toHaveBeenCalled();
    });
});
