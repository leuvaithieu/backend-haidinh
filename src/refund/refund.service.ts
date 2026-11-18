
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { RefundStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RefundService {
    constructor(private readonly prisma: PrismaService) {}

    // Lấy danh sách yêu cầu hoàn tiền, có thể lọc theo trạng thái.
    async findAll(status?: RefundStatus) {
        return this.prisma.refund.findMany({
            where: status ? { status } : undefined,
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                booking: {
                    select: {
                        id: true,
                        bookingCode: true,
                        customerName: true,
                        customerPhone: true,
                        totalAmount: true,
                        paidAmount: true,
                        status: true,
                        paymentStatus: true,
                        cancelledAt: true,
                        cancellationReason: true,
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
                    },
                },
                reviewedBy: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });
    }

    // Lấy chi tiết một yêu cầu hoàn tiền theo ID.
    async findOne(id: string) {
        const refund = await this.prisma.refund.findUnique({
            where: { id },
            include: {
                booking: {
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
                },
                reviewedBy: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        if (!refund) {
            throw new NotFoundException('Không tìm thấy yêu cầu hoàn tiền.');
        }

        return refund;
    }

    // Duyệt yêu cầu hoàn tiền đang ở trạng thái REQUESTED.
    async approve(id: string, reviewedById: string) {
        return this.prisma.$transaction(async (tx) => {
            const refund = await tx.refund.findUnique({
                where: { id },
                select: {
                    id: true,
                    status: true,
                },
            });

            if (!refund) {
                throw new NotFoundException(
                    'Không tìm thấy yêu cầu hoàn tiền.',
                );
            }

            if (refund.status !== 'REQUESTED') {
                throw new BadRequestException(
                    'Chỉ có thể duyệt yêu cầu hoàn tiền đang chờ xử lý.',
                );
            }

            const result = await tx.refund.updateMany({
                where: {
                    id,
                    status: 'REQUESTED',
                },
                data: {
                    status: 'APPROVED',
                    reviewedById,
                    reviewedAt: new Date(),
                },
            });

            if (result.count !== 1) {
                throw new ConflictException(
                    'Yêu cầu hoàn tiền đã được xử lý bởi nhân viên khác.',
                );
            }

            return {
                message: 'Duyệt yêu cầu hoàn tiền thành công.',
                refundId: id,
                status: 'APPROVED',
            };
        });
    }

    // Từ chối yêu cầu hoàn tiền và lưu lý do từ chối.
    async reject(
        id: string,
        rejectionReason: string,
        reviewedById: string,
    ) {
        const reason = rejectionReason?.trim();

        if (!reason) {
            throw new BadRequestException(
                'Vui lòng nhập lý do từ chối hoàn tiền.',
            );
        }

        return this.prisma.$transaction(async (tx) => {
            const refund = await tx.refund.findUnique({
                where: { id },
                select: {
                    id: true,
                    status: true,
                },
            });

            if (!refund) {
                throw new NotFoundException(
                    'Không tìm thấy yêu cầu hoàn tiền.',
                );
            }

            if (refund.status !== 'REQUESTED') {
                throw new BadRequestException(
                    'Chỉ có thể từ chối yêu cầu hoàn tiền đang chờ xử lý.',
                );
            }

            const result = await tx.refund.updateMany({
                where: {
                    id,
                    status: 'REQUESTED',
                },
                data: {
                    status: 'REJECTED',
                    rejectionReason: reason,
                    reviewedById,
                    reviewedAt: new Date(),
                },
            });

            if (result.count !== 1) {
                throw new ConflictException(
                    'Yêu cầu hoàn tiền đã được xử lý bởi nhân viên khác.',
                );
            }

            return {
                message: 'Từ chối yêu cầu hoàn tiền thành công.',
                refundId: id,
                status: 'REJECTED',
                rejectionReason: reason,
            };
        });
    }
}
