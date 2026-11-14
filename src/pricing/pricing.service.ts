
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import {
    PriceEntryType,
    PricePointType,
    Prisma,
    PricePolicyStatus,
    RouteScheduleType,
    TripDirection,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreatePricingPolicyDto } from './dto/create-pricing-policy.dto';
import { UpdatePricingPolicyDto } from './dto/update-pricing-policy.dto';

@Injectable()
export class PricingService {
    constructor(private readonly prisma: PrismaService) {}

    // Kiểm tra cấu trúc và tính hợp lệ của toàn bộ dữ liệu chính sách giá.
    private async validatePolicyData(
        tx: Prisma.TransactionClient,
        dto: CreatePricingPolicyDto,
    ) {
        const route = await tx.route.findUnique({
            where: { id: dto.routeId },
            select: { id: true },
        });

        if (!route) {
            throw new NotFoundException('Không tìm thấy tuyến vận hành');
        }

        if (!Number.isInteger(dto.version) || dto.version < 1) {
            throw new BadRequestException('Phiên bản chính sách không hợp lệ');
        }

        const effectiveFrom = new Date(dto.effectiveFrom);
        const effectiveTo = dto.effectiveTo
        ? new Date(dto.effectiveTo)
        : null;

        if (
        Number.isNaN(effectiveFrom.getTime()) ||
        (effectiveTo && Number.isNaN(effectiveTo.getTime()))
        ) {
            throw new BadRequestException('Thời gian hiệu lực không hợp lệ');
        }

        if (
        effectiveTo &&
        effectiveTo.getTime() <= effectiveFrom.getTime()
        ) {
            throw new BadRequestException(
            'Ngày kết thúc hiệu lực phải sau ngày bắt đầu',
        );
        }

        const adjustment = dto.routeAdjustmentAmount ?? 0;

        if (!Number.isInteger(adjustment)) {
            throw new BadRequestException(
            'Giá điều chỉnh tuyến phải là số nguyên',
        );
        }

        if (dto.pricingMode === RouteScheduleType.NORMAL) {
        if (!dto.baseOriginRoutePointId) {
            throw new BadRequestException(
            'Chính sách NORMAL bắt buộc phải có điểm xuất phát gốc',
            );
        }

        if (dto.fullRoutePrice != null) {
            throw new BadRequestException(
            'Chính sách NORMAL không sử dụng giá toàn tuyến',
            );
        }

        const basePoint = await tx.routePoint.findFirst({
            where: {
                id: dto.baseOriginRoutePointId,
                routeId: dto.routeId,
            },
        });

        if (!basePoint) {
            throw new BadRequestException(
                'Điểm xuất phát gốc không thuộc tuyến đã chọn',
            );
        }
        } else {
        if (
            dto.baseOriginRoutePointId ||
            !Number.isInteger(dto.fullRoutePrice) ||
            (dto.fullRoutePrice ?? 0) <= 0
        ) {
            throw new BadRequestException(
            'Chính sách TET phải có giá toàn tuyến lớn hơn 0 và không có điểm gốc',
            );
        }

        if (
            adjustment !== 0 ||
            (dto.routePointPrices?.length ?? 0) > 0 ||
            (dto.servicePointPrices?.length ?? 0) > 0 ||
            (dto.priceOverrides?.length ?? 0) > 0
        ) {
            throw new BadRequestException(
            'Chính sách TET không được khai báo giá từng điểm hoặc điều chỉnh tuyến',
            );
        }
        }

        const routePointIds = [
        ...new Set(
            (dto.routePointPrices ?? []).map(
            (item) => item.routePointId,
            ),
        ),
        ];

        const servicePointIds = [
        ...new Set(
            (dto.servicePointPrices ?? []).map(
            (item) => item.servicePointId,
            ),
        ),
        ];

        // Từ chối nếu một ServicePoint được khai báo giá nhiều lần.
        const servicePointPriceIds = (dto.servicePointPrices ?? []).map(
            (item) => item.servicePointId,
        );

        if (new Set(servicePointPriceIds).size !== servicePointPriceIds.length) {
            throw new BadRequestException(
                'Không được khai báo trùng ServicePointPrice',
            );
        }

        const routePoints = await tx.routePoint.findMany({
            where: {
                id: { in: routePointIds },
                routeId: dto.routeId,
            },
            select: { id: true },
        });

        if (routePoints.length !== routePointIds.length) {
            throw new BadRequestException(
                'Có RoutePoint không thuộc tuyến đã chọn',
            );
        }

        const servicePoints = await tx.servicePoint.findMany({
        where: {
            id: { in: servicePointIds },
            routePoint: {
            routeId: dto.routeId,
            },
        },
        select: { id: true },
        });

        if (servicePoints.length !== servicePointIds.length) {
        throw new BadRequestException(
            'Có ServicePoint không thuộc tuyến đã chọn',
        );
        }

        // Kiểm tra giá FIXED và CONTACT tại từng điểm.
        const validateEntry = (
        priceType: PriceEntryType,
        price: number | null | undefined,
        ) => {
        if (priceType === PriceEntryType.FIXED) {
            if (!Number.isInteger(price) || (price ?? 0) <= 0) {
            throw new BadRequestException(
                'Giá FIXED phải là số nguyên lớn hơn 0',
            );
            }
        }

        if (
            priceType === PriceEntryType.CONTACT &&
            price != null
        ) {
            throw new BadRequestException(
            'Giá CONTACT không được chứa số tiền',
            );
        }
        };

        for (const item of dto.routePointPrices ?? []) {
        validateEntry(item.priceType, item.price);
        }

        for (const item of dto.servicePointPrices ?? []) {
        validateEntry(item.priceType, item.price);
        }

        // Kiểm tra tính nhất quán giữa loại điểm, ID và key của Override.
        const validateOverridePoint = (
        pointType: PricePointType,
        pointKey: string,
        routePointId?: string,
        servicePointId?: string,
        ) => {
        if (pointType === PricePointType.ROUTE_POINT) {
            if (
            !routePointId ||
            servicePointId ||
            pointKey !== `RP:${routePointId}`
            ) {
            throw new BadRequestException(
                'Thông tin RoutePoint trong PriceOverride không hợp lệ',
            );
            }
        } else {
            if (
            !servicePointId ||
            routePointId ||
            pointKey !== `SP:${servicePointId}`
            ) {
            throw new BadRequestException(
                'Thông tin ServicePoint trong PriceOverride không hợp lệ',
            );
            }
        }
        };

        const overrideRoutePointIds = new Set<string>();
        const overrideServicePointIds = new Set<string>();
        const overrideKeys = new Set<string>();

        for (const item of dto.priceOverrides ?? []) {
        validateOverridePoint(
            item.fromPointType,
            item.fromPointKey,
            item.fromRoutePointId,
            item.fromServicePointId,
        );

        validateOverridePoint(
            item.toPointType,
            item.toPointKey,
            item.toRoutePointId,
            item.toServicePointId,
        );

        validateEntry(item.priceType, item.price);

        const key = `${item.fromPointKey}->${item.toPointKey}`;

        if (overrideKeys.has(key)) {
            throw new BadRequestException(
            'Không được khai báo trùng cặp điểm trong PriceOverride',
            );
        }

        overrideKeys.add(key);

        if (item.fromRoutePointId) {
            overrideRoutePointIds.add(item.fromRoutePointId);
        }

        if (item.toRoutePointId) {
            overrideRoutePointIds.add(item.toRoutePointId);
        }

        if (item.fromServicePointId) {
            overrideServicePointIds.add(item.fromServicePointId);
        }

        if (item.toServicePointId) {
            overrideServicePointIds.add(item.toServicePointId);
        }
        }

        const overrideRoutePoints = await tx.routePoint.findMany({
        where: {
            id: { in: [...overrideRoutePointIds] },
            routeId: dto.routeId,
        },
        select: { id: true },
        });

        if (
        overrideRoutePoints.length !== overrideRoutePointIds.size
        ) {
        throw new BadRequestException(
            'RoutePoint trong PriceOverride không thuộc tuyến đã chọn',
        );
        }

        const overrideServicePoints =
        await tx.servicePoint.findMany({
            where: {
            id: { in: [...overrideServicePointIds] },
            routePoint: {
                routeId: dto.routeId,
            },
            },
            select: { id: true },
        });

        if (
        overrideServicePoints.length !==
        overrideServicePointIds.size
        ) {
        throw new BadRequestException(
            'ServicePoint trong PriceOverride không thuộc tuyến đã chọn',
        );
        }
    }

    // Tạo chính sách giá mới ở trạng thái DRAFT.
    async create(dto: CreatePricingPolicyDto) {
        return this.prisma.$transaction(async (tx) => {
        await this.validatePolicyData(tx, dto);

        const existingVersion =
            await tx.routePricePolicy.findFirst({
            where: {
                routeId: dto.routeId,
                pricingMode: dto.pricingMode,
                direction: dto.direction,
                vehicleType: dto.vehicleType ?? null,
                version: dto.version,
            },
            });

        if (existingVersion) {
            throw new ConflictException(
            'Phiên bản chính sách giá này đã tồn tại trong cùng phạm vi',
            );
        }

        return tx.routePricePolicy.create({
            data: {
            routeId: dto.routeId,
            pricingMode: dto.pricingMode,
            baseOriginRoutePointId:
                dto.baseOriginRoutePointId ?? null,
            direction: dto.direction,
            vehicleType: dto.vehicleType ?? null,
            version: dto.version,
            status: PricePolicyStatus.DRAFT,
            effectiveFrom: new Date(dto.effectiveFrom),
            effectiveTo: dto.effectiveTo
                ? new Date(dto.effectiveTo)
                : null,
            fullRoutePrice: dto.fullRoutePrice ?? null,
            routeAdjustmentAmount:
                dto.routeAdjustmentAmount ?? 0,

            routePointPrices: {
                create: (dto.routePointPrices ?? []).map(
                (item) => ({
                    routePointId: item.routePointId,
                    priceType: item.priceType,
                    price:
                    item.priceType === PriceEntryType.FIXED
                        ? item.price
                        : null,
                }),
                ),
            },

            servicePointPrices: {
                create: (dto.servicePointPrices ?? []).map(
                (item) => ({
                    servicePointId: item.servicePointId,
                    priceType: item.priceType,
                    price:
                    item.priceType === PriceEntryType.FIXED
                        ? item.price
                        : null,
                }),
                ),
            },

            priceOverrides: {
                create: (dto.priceOverrides ?? []).map(
                (item) => ({
                    fromPointType: item.fromPointType,
                    toPointType: item.toPointType,
                    fromPointKey: item.fromPointKey,
                    toPointKey: item.toPointKey,
                    fromRoutePointId:
                    item.fromRoutePointId ?? null,
                    fromServicePointId:
                    item.fromServicePointId ?? null,
                    toRoutePointId:
                    item.toRoutePointId ?? null,
                    toServicePointId:
                    item.toServicePointId ?? null,
                    priceType: item.priceType,
                    price:
                    item.priceType === PriceEntryType.FIXED
                        ? item.price
                        : null,
                }),
                ),
            },
            },
            include: {
            routePointPrices: true,
            servicePointPrices: true,
            priceOverrides: true,
            },
        });
        });
    }

    // Lấy danh sách chính sách giá.
    async findAll() {
        return this.prisma.routePricePolicy.findMany({
        orderBy: [
            { createdAt: 'desc' },
            { version: 'desc' },
        ],
        include: {
            route: {
            select: {
                id: true,
                name: true,
            },
            },
            baseOriginRoutePoint: true,
        },
        });
    }

    // Lấy chi tiết chính sách giá và toàn bộ bảng giá thành phần.
    async findOne(id: string) {
        const policy =
        await this.prisma.routePricePolicy.findUnique({
            where: { id },
            include: {
                route: {
                    include: {
                        routePoints: {
                            include: {
                                servicePoints: true,
                            },
                            orderBy: {
                                sequence: 'asc',
                            },
                        },
                    },
                },
                baseOriginRoutePoint: true,
                routePointPrices: {
                    include: {
                        routePoint: true,
                    },
                },
                servicePointPrices: {
                    include: {
                        servicePoint: true,
                    },
                },
                priceOverrides: true,
            },
        });

        if (!policy) {
        throw new NotFoundException(
            'Không tìm thấy chính sách giá',
        );
        }

        return policy;
    }

    // Cập nhật chính sách giá còn ở trạng thái DRAFT.
    async update(
        id: string,
        dto: UpdatePricingPolicyDto,
    ) {
        return this.prisma.$transaction(async (tx) => {
        const existing =
            await tx.routePricePolicy.findUnique({
            where: { id },
            include: {
                routePointPrices: true,
                servicePointPrices: true,
                priceOverrides: true,
            },
            });

        if (!existing) {
            throw new NotFoundException(
            'Không tìm thấy chính sách giá',
            );
        }

        if (existing.status !== PricePolicyStatus.DRAFT) {
            throw new BadRequestException(
            'Chỉ được cập nhật chính sách đang ở trạng thái DRAFT',
            );
        }

        const merged: CreatePricingPolicyDto = {
            routeId: dto.routeId ?? existing.routeId,
            pricingMode:
            dto.pricingMode ?? existing.pricingMode,
            baseOriginRoutePointId:
            dto.baseOriginRoutePointId === undefined
                ? existing.baseOriginRoutePointId
                : dto.baseOriginRoutePointId,
            direction: dto.direction ?? existing.direction,
            vehicleType:
            dto.vehicleType === undefined
                ? existing.vehicleType
                : dto.vehicleType,
            version: dto.version ?? existing.version,
            effectiveFrom:
            dto.effectiveFrom ??
            existing.effectiveFrom.toISOString(),
            effectiveTo:
            dto.effectiveTo === undefined
                ? existing.effectiveTo?.toISOString() ?? null
                : dto.effectiveTo,
            fullRoutePrice:
            dto.fullRoutePrice === undefined
                ? existing.fullRoutePrice
                : dto.fullRoutePrice,
            routeAdjustmentAmount:
            dto.routeAdjustmentAmount ??
            existing.routeAdjustmentAmount,

            routePointPrices:
            dto.routePointPrices ??
            existing.routePointPrices.map((item) => ({
                routePointId: item.routePointId,
                priceType: item.priceType,
                price: item.price,
            })),

            servicePointPrices:
            dto.servicePointPrices ??
            existing.servicePointPrices.map((item) => ({
                servicePointId: item.servicePointId,
                priceType: item.priceType,
                price: item.price,
            })),

            priceOverrides:
            dto.priceOverrides ??
            existing.priceOverrides.map((item) => ({
                fromPointType: item.fromPointType,
                toPointType: item.toPointType,
                fromPointKey: item.fromPointKey,
                toPointKey: item.toPointKey,
                fromRoutePointId:
                item.fromRoutePointId ?? undefined,
                fromServicePointId:
                item.fromServicePointId ?? undefined,
                toRoutePointId:
                item.toRoutePointId ?? undefined,
                toServicePointId:
                item.toServicePointId ?? undefined,
                priceType: item.priceType,
                price: item.price,
            })),
        };

        await this.validatePolicyData(tx, merged);

        if (
            merged.version !== existing.version ||
            merged.routeId !== existing.routeId ||
            merged.pricingMode !== existing.pricingMode ||
            merged.direction !== existing.direction ||
            merged.vehicleType !== existing.vehicleType
        ) {
            const duplicate =
            await tx.routePricePolicy.findFirst({
                where: {
                id: { not: id },
                routeId: merged.routeId,
                pricingMode: merged.pricingMode,
                direction: merged.direction,
                vehicleType: merged.vehicleType ?? null,
                version: merged.version,
                },
            });

            if (duplicate) {
            throw new ConflictException(
                'Phiên bản chính sách giá này đã tồn tại trong cùng phạm vi',
            );
            }
        }

        // Cập nhật thông tin chính sách.
        await tx.routePricePolicy.update({
            where: { id },
            data: {
            routeId: merged.routeId,
            pricingMode: merged.pricingMode,
            baseOriginRoutePointId:
                merged.baseOriginRoutePointId ?? null,
            direction: merged.direction,
            vehicleType: merged.vehicleType ?? null,
            version: merged.version,
            effectiveFrom: new Date(merged.effectiveFrom),
            effectiveTo: merged.effectiveTo
                ? new Date(merged.effectiveTo)
                : null,
            fullRoutePrice: merged.fullRoutePrice ?? null,
            routeAdjustmentAmount:
                merged.routeAdjustmentAmount ?? 0,
            },
        });

        // Thay thế bảng giá RoutePoint nếu request có gửi mảng mới.
        if (dto.routePointPrices !== undefined) {
            await tx.routePointPrice.deleteMany({
            where: { policyId: id },
            });

            if (merged.routePointPrices?.length) {
            await tx.routePointPrice.createMany({
                data: merged.routePointPrices.map((item) => ({
                policyId: id,
                routePointId: item.routePointId,
                priceType: item.priceType,
                price:
                    item.priceType === PriceEntryType.FIXED
                    ? item.price
                    : null,
                })),
            });
            }
        }

        // Thay thế bảng giá ServicePoint nếu request có gửi mảng mới.
        if (dto.servicePointPrices !== undefined) {
            await tx.servicePointPrice.deleteMany({
            where: { policyId: id },
            });

            if (merged.servicePointPrices?.length) {
            await tx.servicePointPrice.createMany({
                data: merged.servicePointPrices.map((item) => ({
                policyId: id,
                servicePointId: item.servicePointId,
                priceType: item.priceType,
                price:
                    item.priceType === PriceEntryType.FIXED
                    ? item.price
                    : null,
                })),
            });
            }
        }

        // Thay thế bảng giá Override nếu request có gửi mảng mới.
        if (dto.priceOverrides !== undefined) {
            await tx.routePriceOverride.deleteMany({
            where: { policyId: id },
            });

            if (merged.priceOverrides?.length) {
            await tx.routePriceOverride.createMany({
                data: merged.priceOverrides.map((item) => ({
                policyId: id,
                fromPointType: item.fromPointType,
                toPointType: item.toPointType,
                fromPointKey: item.fromPointKey,
                toPointKey: item.toPointKey,
                fromRoutePointId:
                    item.fromRoutePointId ?? null,
                fromServicePointId:
                    item.fromServicePointId ?? null,
                toRoutePointId:
                    item.toRoutePointId ?? null,
                toServicePointId:
                    item.toServicePointId ?? null,
                priceType: item.priceType,
                price:
                    item.priceType === PriceEntryType.FIXED
                    ? item.price
                    : null,
                })),
            });
            }
        }

        return tx.routePricePolicy.findUnique({
            where: { id },
            include: {
            routePointPrices: true,
            servicePointPrices: true,
            priceOverrides: true,
            },
        });
        });
    }

    // Kích hoạt chính sách giá sau khi kiểm tra hiệu lực và xung đột.
    async activate(id: string) {
        return this.prisma.$transaction(async (tx) => {
        const policy =
            await tx.routePricePolicy.findUnique({
            where: { id },
            include: {
                routePointPrices: true,
                servicePointPrices: true,
                priceOverrides: true,
            },
            });

        if (!policy) {
            throw new NotFoundException(
            'Không tìm thấy chính sách giá',
            );
        }

        if (policy.status !== PricePolicyStatus.DRAFT) {
            throw new BadRequestException(
            'Chỉ có thể kích hoạt chính sách đang ở trạng thái DRAFT',
            );
        }

        // Chuyển dữ liệu đã lưu trong DB về cấu trúc DTO để kiểm tra lại toàn bộ.
        const validationData: CreatePricingPolicyDto = {
            routeId: policy.routeId,
            pricingMode: policy.pricingMode,
            baseOriginRoutePointId:
            policy.baseOriginRoutePointId,
            direction: policy.direction,
            vehicleType: policy.vehicleType,
            version: policy.version,
            effectiveFrom: policy.effectiveFrom.toISOString(),
            effectiveTo:
            policy.effectiveTo?.toISOString() ?? null,
            fullRoutePrice: policy.fullRoutePrice,
            routeAdjustmentAmount:
            policy.routeAdjustmentAmount,

            routePointPrices: policy.routePointPrices.map(
            (item) => ({
                routePointId: item.routePointId,
                priceType: item.priceType,
                price: item.price,
            }),
            ),

            servicePointPrices: policy.servicePointPrices.map(
            (item) => ({
                servicePointId: item.servicePointId,
                priceType: item.priceType,
                price: item.price,
            }),
            ),

            priceOverrides: policy.priceOverrides.map(
            (item) => ({
                fromPointType: item.fromPointType,
                toPointType: item.toPointType,
                fromPointKey: item.fromPointKey,
                toPointKey: item.toPointKey,
                fromRoutePointId:
                item.fromRoutePointId ?? undefined,
                fromServicePointId:
                item.fromServicePointId ?? undefined,
                toRoutePointId:
                item.toRoutePointId ?? undefined,
                toServicePointId:
                item.toServicePointId ?? undefined,
                priceType: item.priceType,
                price: item.price,
            }),
            ),
        };

        await this.validatePolicyData(tx, validationData);

        const now = new Date();

        if (
            policy.effectiveTo &&
            policy.effectiveTo <= now
        ) {
            throw new BadRequestException(
            'Chính sách đã hết thời hạn hiệu lực',
            );
        }

        const activePolicies =
            await tx.routePricePolicy.findMany({
            where: {
                id: { not: id },
                routeId: policy.routeId,
                pricingMode: policy.pricingMode,
                direction: policy.direction,
                vehicleType: policy.vehicleType,
                status: PricePolicyStatus.ACTIVE,
            },
            select: {
                id: true,
                effectiveFrom: true,
                effectiveTo: true,
            },
            });

        // Không cho phép hai chính sách ACTIVE cùng phạm vi có thời gian hiệu lực chồng lấn.
        const hasOverlap = activePolicies.some((active) => {
            const newEnd =
            policy.effectiveTo?.getTime() ??
            Number.POSITIVE_INFINITY;

            const activeEnd =
            active.effectiveTo?.getTime() ??
            Number.POSITIVE_INFINITY;

            return (
            policy.effectiveFrom.getTime() < activeEnd &&
            active.effectiveFrom.getTime() < newEnd
            );
        });

        if (hasOverlap) {
            throw new ConflictException(
            'Đã có chính sách ACTIVE cùng phạm vi và thời gian hiệu lực bị chồng lấn',
            );
        }

        return tx.routePricePolicy.update({
            where: { id },
            data: {
            status: PricePolicyStatus.ACTIVE,
            },
        });
        });
    }

    // Lưu trữ chính sách giá và không cho phép tiếp tục sử dụng.
    async archive(id: string) {
        const policy =
            await this.prisma.routePricePolicy.findUnique({
                where: { id },
            });

        if (!policy) {
        throw new NotFoundException(
            'Không tìm thấy chính sách giá',
        );
        }

        if (policy.status === PricePolicyStatus.ARCHIVED) {
        throw new BadRequestException(
            'Chính sách giá đã được lưu trữ',
        );
        }

        return this.prisma.routePricePolicy.update({
        where: { id },
        data: {
            status: PricePolicyStatus.ARCHIVED,
        },
        });
    }

      // Tìm chính sách giá ACTIVE phù hợp với chuyến, chiều chạy, ngày khởi hành và loại xe.
    async findApplicablePolicy(
        tripId: string,
        direction: TripDirection,
        db: Prisma.TransactionClient | PrismaService = this.prisma,
    ) {
        const trip = await db.trip.findUnique({
            where: { id: tripId },
            select: {
                id: true,
                routeId: true,
                scheduleType: true,
                plannedDeparture: true,
                vehicle: {
                select: {
                    vehicleType: true,
                },
                },
            },
        });

        if (!trip) {
            throw new NotFoundException('Không tìm thấy chuyến xe');
        }

        const commonWhere: Prisma.RoutePricePolicyWhereInput = {
            routeId: trip.routeId,
            pricingMode: trip.scheduleType,
            direction,
            status: PricePolicyStatus.ACTIVE,
            effectiveFrom: {
                lte: trip.plannedDeparture,
            },
            OR: [
                { effectiveTo: null },
                {
                    effectiveTo: {
                        gt: trip.plannedDeparture,
                    },
                },
            ],
        };

        const include = {
            routePointPrices: true,
            servicePointPrices: true,
            priceOverrides: true,
        } satisfies Prisma.RoutePricePolicyInclude;

        // Ưu tiên chính sách dành riêng cho loại xe của chuyến.
        const exactPolicies =
        await db.routePricePolicy.findMany({
            where: {
                ...commonWhere,
                vehicleType: trip.vehicle.vehicleType,
            },
            include,
        });

        if (exactPolicies.length > 1) {
            throw new ConflictException(
                'Có nhiều chính sách giá ACTIVE cùng phù hợp với chuyến xe và loại xe',
            );
        }

        if (exactPolicies.length === 1) {
            return exactPolicies[0];
        }

        // Nếu không có chính sách riêng, tìm chính sách áp dụng chung mọi loại xe.
        const genericPolicies =
            await db.routePricePolicy.findMany({
                where: {
                    ...commonWhere,
                    vehicleType: null,
                },
                include,
            })
        ;

        if (genericPolicies.length > 1) {
            throw new ConflictException(
                'Có nhiều chính sách giá chung ACTIVE cùng phù hợp với chuyến xe',
            );
        }

        return genericPolicies[0] ?? null;
    }

    // Tính giá vé theo chính sách và trả về dữ liệu snapshot tại thời điểm tính.
    async calculatePrice(params: {
        tripId: string;
        direction: TripDirection;
        pickupTripRoutePointId: string;
        dropoffTripRoutePointId: string;
        pickupServicePointId?: string;
        dropoffServicePointId?: string;
        tx?: Prisma.TransactionClient;
    }) {
        const {
        tripId,
        direction,
        pickupTripRoutePointId,
        dropoffTripRoutePointId,
        pickupServicePointId,
        dropoffServicePointId,
        } = params;

        const db = params.tx ?? this.prisma;

        const trip = await db.trip.findUnique({
        where: { id: tripId },
        select: {
            id: true,
            routeId: true,
            scheduleType: true,
            tripRoutePoints: {
            where: { direction },
            orderBy: { sequence: 'asc' },
            select: {
                id: true,
                routePointId: true,
                pointName: true,
                sequence: true,
            },
            },
        },
        });

        if (!trip) {
        throw new NotFoundException('Không tìm thấy chuyến xe');
        }

        const pickup = trip.tripRoutePoints.find(
        (point) => point.id === pickupTripRoutePointId,
        );

        const dropoff = trip.tripRoutePoints.find(
        (point) => point.id === dropoffTripRoutePointId,
        );

        if (!pickup || !dropoff) {
        throw new BadRequestException(
            'Điểm đón hoặc điểm trả không thuộc lịch trình của chuyến xe',
        );
        }

        if (
        pickup.sequence >= dropoff.sequence ||
        !pickup.routePointId ||
        !dropoff.routePointId
        ) {
        throw new BadRequestException(
            'Điểm đón và điểm trả không hợp lệ',
        );
        }

        const [pickupServicePoint, dropoffServicePoint] =
        await Promise.all([
            pickupServicePointId
            ? db.servicePoint.findFirst({
                where: {
                    id: pickupServicePointId,
                    routePointId: pickup.routePointId,
                },
                select: {
                    id: true,
                    name: true,
                    routePointId: true,
                },
                })
            : null,

            dropoffServicePointId
            ? db.servicePoint.findFirst({
                where: {
                    id: dropoffServicePointId,
                    routePointId: dropoff.routePointId,
                },
                select: {
                    id: true,
                    name: true,
                    routePointId: true,
                },
                })
            : null,
        ]);

        if (pickupServicePointId && !pickupServicePoint) {
        throw new BadRequestException(
            'Điểm đón phụ không thuộc RoutePoint đã chọn',
        );
        }

        if (dropoffServicePointId && !dropoffServicePoint) {
        throw new BadRequestException(
            'Điểm trả phụ không thuộc RoutePoint đã chọn',
        );
        }

        const policy = await this.findApplicablePolicy(
            tripId,
            direction,
            db,
        );

        const calculatedAt = new Date();

        // Không có chính sách giá thì yêu cầu khách liên hệ nhân viên.
        if (!policy) {
        return {
            pricingMode: trip.scheduleType,
            direction,
            policyId: null,
            policyVersion: null,
            currency: 'VND',
            priceSource: 'CONTACT',
            basePrice: null,
            routeAdjustmentAmount: 0,
            finalPrice: null,
            pickup: {
                tripRoutePointId: pickup.id,
                routePointId: pickup.routePointId,
                pointName: pickup.pointName,
                servicePointId: pickupServicePoint?.id ?? null,
                servicePointName: pickupServicePoint?.name ?? null,
                sequence: pickup.sequence,
            },
            dropoff: {
                tripRoutePointId: dropoff.id,
                routePointId: dropoff.routePointId,
                pointName: dropoff.pointName,
                servicePointId: dropoffServicePoint?.id ?? null,
                servicePointName: dropoffServicePoint?.name ?? null,
                sequence: dropoff.sequence,
            },
            calculatedAt,
        };
        }

        let priceType: PriceEntryType = PriceEntryType.CONTACT;
        let basePrice: number | null = null;
        let priceSource = 'CONTACT';
        let routeAdjustmentAmount = 0;

        const fromPointKey = pickupServicePoint
            ? `SP:${pickupServicePoint.id}`
            : `RP:${pickup.routePointId}`;

        const toPointKey = dropoffServicePoint
            ? `SP:${dropoffServicePoint.id}`
            : `RP:${dropoff.routePointId}`;

        if (policy.pricingMode === RouteScheduleType.TET) {
            const firstPoint = trip.tripRoutePoints[0];
            const lastPoint =
                trip.tripRoutePoints[trip.tripRoutePoints.length - 1];

            const isFullRoute =
                firstPoint?.id === pickup.id &&
                lastPoint?.id === dropoff.id;

            if (isFullRoute) {
                priceType = policy.fullRoutePrice
                ? PriceEntryType.FIXED
                : PriceEntryType.CONTACT;

                basePrice = policy.fullRoutePrice;
                priceSource = 'TET_FULL_ROUTE';
            }
        } else {
            // Ưu tiên giá Override cho đúng cặp điểm lên và xuống.
            const override = policy.priceOverrides.find(
                (item) =>
                item.fromPointKey === fromPointKey &&
                item.toPointKey === toPointKey,
            );

            if (override) {
                priceType = override.priceType;
                basePrice = override.price;
                priceSource = 'ROUTE_PRICE_OVERRIDE';
            } else if (
                pickup.routePointId ===
                policy.baseOriginRoutePointId
            ) {
                // Giá ServicePoint được ưu tiên khi khách chọn điểm phụ.
                if (dropoffServicePoint) {
                    const servicePrice =
                        policy.servicePointPrices.find(
                        (item) =>
                            item.servicePointId ===
                            dropoffServicePoint.id,
                        );

                    if (servicePrice) {
                        priceType = servicePrice.priceType;
                        basePrice = servicePrice.price;
                        priceSource = 'SERVICE_POINT_PRICE';
                    }
                }

                // Nếu không có giá ServicePoint thì dùng giá RoutePoint.
                if (
                    priceSource !== 'SERVICE_POINT_PRICE'
                ) {
                    const routePointPrice =
                        policy.routePointPrices.find(
                        (item) =>
                            item.routePointId ===
                            dropoff.routePointId,
                        );

                    if (routePointPrice) {
                        priceType = routePointPrice.priceType;
                        basePrice = routePointPrice.price;
                        priceSource = 'ROUTE_POINT_PRICE';
                    }
                }

                routeAdjustmentAmount =
                policy.routeAdjustmentAmount;
            }
        }

        if (
            priceType !== PriceEntryType.FIXED ||
            basePrice === null
        ) {
        return {
            pricingMode: policy.pricingMode,
            direction,
            policyId: policy.id,
            policyVersion: policy.version,
            currency: 'VND',
            priceSource: 'CONTACT',
            basePrice: null,
            routeAdjustmentAmount: 0,
            finalPrice: null,
            pickup: {
                tripRoutePointId: pickup.id,
                routePointId: pickup.routePointId,
                pointName: pickup.pointName,
                servicePointId: pickupServicePoint?.id ?? null,
                servicePointName: pickupServicePoint?.name ?? null,
                sequence: pickup.sequence,
            },
            dropoff: {
                tripRoutePointId: dropoff.id,
                routePointId: dropoff.routePointId,
                pointName: dropoff.pointName,
                servicePointId: dropoffServicePoint?.id ?? null,
                servicePointName: dropoffServicePoint?.name ?? null,
                sequence: dropoff.sequence,
            },
            calculatedAt,
        };
        }

        const finalPrice =
            basePrice + routeAdjustmentAmount;

        if (!Number.isInteger(finalPrice) || finalPrice <= 0) {
            throw new BadRequestException(
                'Giá vé sau điều chỉnh không hợp lệ',
            );
        }

        return {
            pricingMode: policy.pricingMode,
            direction,
            policyId: policy.id,
            policyVersion: policy.version,
            currency: 'VND',
            priceSource,
            basePrice,
            routeAdjustmentAmount,
            finalPrice,
            pickup: {
                tripRoutePointId: pickup.id,
                routePointId: pickup.routePointId,
                pointName: pickup.pointName,
                servicePointId: pickupServicePoint?.id ?? null,
                servicePointName: pickupServicePoint?.name ?? null,
                sequence: pickup.sequence,
            },
            dropoff: {
                tripRoutePointId: dropoff.id,
                routePointId: dropoff.routePointId,
                pointName: dropoff.pointName,
                servicePointId: dropoffServicePoint?.id ?? null,
                servicePointName: dropoffServicePoint?.name ?? null,
                sequence: dropoff.sequence,
            },
            calculatedAt,
        };
    }

}
