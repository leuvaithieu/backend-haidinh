import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportPaymentDto } from './dto/report-payment.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class PaymentService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly settingsService: SettingsService,
    ) {}

    // Khách hàng báo chuyển khoản lần đầu hoặc thanh toán phần tiền còn lại.
    async reportPayment(bookingId: string, dto: ReportPaymentDto) {
        // Kiểm tra phương thức chuyển khoản có đang được hệ thống cho phép hay không.
        const transferEnabled =
            await this.settingsService.getValue('PAYMENT_TRANSFER_ENABLED');

        if (transferEnabled !== 'true') {
            throw new ForbiddenException(
                'Hải Định hiện tạm ngừng nhận thanh toán chuyển khoản. Vui lòng liên hệ nhân viên.',
            );
        }
        try{
            return await this.prisma.$transaction(
                async (tx) => {
                    // Khóa booking để tuần tự hóa các yêu cầu báo thanh toán cùng booking.
                    await tx.$queryRaw`
                        SELECT "id"
                        FROM "Booking"
                        WHERE "id" = ${bookingId}
                        FOR UPDATE
                    `
                    ;
                    const booking = await tx.booking.findUnique({
                        where: { id: bookingId },
                        include: {
                            payments: true,
                        },
                    });

                    if (!booking) {
                        throw new NotFoundException('Không tìm thấy booking.');
                    }

                    // Kiểm tra đây là lần thanh toán đầu tiên hay thanh toán bổ sung.
                    const isInitialPayment =
                            booking.status === BookingStatus.PENDING &&
                        (
                            booking.paymentStatus === PaymentStatus.UNPAID ||
                            booking.paymentStatus === PaymentStatus.FAILED ||
                            booking.paymentStatus === PaymentStatus.REJECTED
                        )
                    ;

                    const isAdditionalPayment =
                            booking.status === BookingStatus.CONFIRMED &&
                            booking.paymentStatus === PaymentStatus.PARTIALLY_PAID;

                    if (!isInitialPayment && !isAdditionalPayment) {
                        throw new BadRequestException(
                            'Booking không ở trạng thái có thể báo thanh toán.',
                        );
                    }

                    // Chỉ kiểm tra thời hạn giữ ghế đối với lần thanh toán đầu tiên.
                    if (isInitialPayment) {
                        if (
                            !booking.holdExpiresAt ||
                            booking.holdExpiresAt <= new Date()
                        ) {
                            throw new BadRequestException(
                                'Thời gian giữ ghế đã hết hạn. Vui lòng đặt vé lại.',
                            );
                        }
                    }

                    const remainingAmount =
                        booking.totalAmount - booking.paidAmount;

                    if (dto.amount > remainingAmount) {
                            throw new BadRequestException(
                            'Số tiền báo chuyển vượt quá số tiền còn phải thanh toán.',
                        );
                    }

                    // Lần thanh toán đầu tiên phải đạt mức cọc tối thiểu.
                    if (
                        isInitialPayment &&
                        dto.amount < booking.depositAmount
                    ) {
                        throw new BadRequestException(
                            `Số tiền thanh toán lần đầu phải tối thiểu ${booking.depositAmount} VND.`,
                        );
                    }

                    // Không cho phép nhiều giao dịch cùng chờ xác nhận.
                    const hasPendingPayment = booking.payments.some(
                        (payment) =>
                        payment.status === PaymentStatus.PENDING ||
                        payment.status === PaymentStatus.REPORTED,
                    );

                    if (hasPendingPayment) {
                        throw new ConflictException(
                            'Booking đã có giao dịch đang chờ xác nhận.',
                        );
                    }

                    const payment = await tx.payment.create({
                        data: {
                            bookingId,
                            amount: dto.amount,
                            method: PaymentMethod.BANK_TRANSFER,
                            status: PaymentStatus.REPORTED,
                            transactionCode: dto.transactionCode,
                            transferContent: dto.transferContent,
                            reportedAt: new Date(),
                        },
                    });

                    // Chỉ chuyển Booking sang PAYMENT_REVIEW ở lần thanh toán đầu tiên.
                    // Booking đã xác nhận một phần sẽ giữ nguyên trạng thái CONFIRMED.
                    if (isInitialPayment) {
                        await tx.booking.update({
                        where: { id: bookingId },
                        data: {
                            status: BookingStatus.PAYMENT_REVIEW,
                            paymentStatus: PaymentStatus.REPORTED,
                        },
                        });
                    }

                    return {
                        message: 'Đã ghi nhận thông tin chuyển khoản.',
                        payment,
                    };
                },
                {
                    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                },
            );
        }catch(error){
            if  (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2034'
            ) {
                throw new ConflictException(
                    'Booking đang được xử lý bởi một yêu cầu khác. Vui lòng thử lại.',
                );
            }
            throw error;
        }
        
    }

    // Nhân viên xác nhận giao dịch lần đầu hoặc giao dịch thanh toán bổ sung.
    async confirmPayment(paymentId: string, confirmedById: string) {
        return this.prisma.$transaction(async (tx) => {
            // Lấy ID booking liên kết với giao dịch.
            const initialPayment = await tx.payment.findUnique({
                where: { id: paymentId },
                select: {
                    id: true,
                    bookingId: true,
                },
            });

            if (!initialPayment) {
                throw new NotFoundException(
                    'Không tìm thấy giao dịch thanh toán.',
                );
            }

            // Khóa booking để tuần tự hóa các thao tác xác nhận thanh toán.
            await tx.$queryRaw`
                SELECT "id"
                FROM "Booking"
                WHERE "id" = ${initialPayment.bookingId}
                FOR UPDATE
            `;

            // Đọc lại giao dịch và booking sau khi đã lấy khóa.
            const payment = await tx.payment.findUnique({
                where: { id: paymentId },
                include: {
                    booking: {
                        include: {
                            seats: {
                                select: {
                                    seatAllocationId: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!payment) {
                throw new NotFoundException(
                    'Không tìm thấy giao dịch thanh toán.',
                );
            }

            if (payment.status !== PaymentStatus.REPORTED) {
                throw new BadRequestException(
                    'Giao dịch không ở trạng thái chờ xác nhận.',
                );
            }

            const booking = payment.booking;

            // Xác định đây là lần xác nhận đầu tiên hay thanh toán bổ sung.
            const isInitialPayment = booking.status === BookingStatus.PAYMENT_REVIEW && booking.paymentStatus === PaymentStatus.REPORTED;

            const isAdditionalPayment = booking.status === BookingStatus.CONFIRMED && booking.paymentStatus === PaymentStatus.PARTIALLY_PAID;

            if (!isInitialPayment && !isAdditionalPayment) {
                throw new ConflictException(
                    'Trạng thái booking không phù hợp để xác nhận thanh toán.',
                );
            }

            const newPaidAmount = booking.paidAmount + payment.amount;

            if (newPaidAmount > booking.totalAmount) {
                throw new BadRequestException(
                    'Tổng tiền đã thanh toán vượt quá giá trị booking.',
                );
            }

            const newPaymentStatus = newPaidAmount >= booking.totalAmount
                ? PaymentStatus.PAID
                : PaymentStatus.PARTIALLY_PAID;

            // Chỉ xác nhận giao dịch nếu nó vẫn đang chờ xử lý.
            const updatedPayment = await tx.payment.updateMany({
                where: {
                    id: paymentId,
                    status: PaymentStatus.REPORTED,
                },
                data: {
                    status: PaymentStatus.PAID,
                    confirmedAt: new Date(),
                    confirmedById,
                },
            });

            if (updatedPayment.count !== 1) {
                throw new ConflictException(
                    'Giao dịch đã được xử lý bởi một nhân viên khác.',
                );
            }

            // Cập nhật tổng tiền đã thanh toán và trạng thái booking.
            await tx.booking.update({
                where: { id: booking.id },
                data: {
                    status: BookingStatus.CONFIRMED,
                    paymentStatus: newPaymentStatus,
                    paidAmount: newPaidAmount,
                    holdExpiresAt: null,
                },
            });

            // Chỉ chuyển ghế HELD sang BOOKED ở lần xác nhận đầu tiên.
            if (isInitialPayment) {
                const allocationIds = booking.seats.map(
                    (seat) => seat.seatAllocationId,
            );

            if (allocationIds.length > 0) {
                const updatedAllocations =
                await tx.seatAllocation.updateMany({
                    where: {
                    id: { in: allocationIds },
                    status: 'HELD',
                    },
                    data: {
                    status: 'BOOKED',
                    holdExpiresAt: null,
                    },
                });

                if (updatedAllocations.count !== allocationIds.length) {
                throw new ConflictException(
                    'Không thể xác nhận toàn bộ ghế của booking.',
                );
                }
            }
            }

            return {
                message: 'Xác nhận thanh toán thành công.',
                paymentId,
                bookingId: booking.id,
                paidAmount: newPaidAmount,
                remainingAmount: booking.totalAmount - newPaidAmount,
                paymentStatus: newPaymentStatus,
                bookingStatus: BookingStatus.CONFIRMED,
            };
        });
    }

    // Nhân viên từ chối giao dịch lần đầu hoặc giao dịch thanh toán bổ sung.
    async rejectPayment(
        paymentId: string,
        dto: RejectPaymentDto,
    ) {
        return this.prisma.$transaction(async (tx) => {
            // Lấy ID booking liên kết với giao dịch.
            const initialPayment = await tx.payment.findUnique({
                where: { id: paymentId },
                select: {
                    id: true,
                    bookingId: true,
                },
            });

            if (!initialPayment) {
                throw new NotFoundException(
                    'Không tìm thấy giao dịch thanh toán.',
                );
            }

            // Khóa booking để tuần tự hóa các thao tác từ chối thanh toán.
            await tx.$queryRaw`
                SELECT "id"
                FROM "Booking"
                WHERE "id" = ${initialPayment.bookingId}
                FOR UPDATE
            `
            ;

            // Đọc lại giao dịch sau khi đã lấy khóa.
            const payment = await tx.payment.findUnique({
                where: { id: paymentId },
                include: {
                    booking: true,
                },
            });

            if (!payment) {
                throw new NotFoundException(
                    'Không tìm thấy giao dịch thanh toán.',
                );
            }

            if (payment.status !== PaymentStatus.REPORTED) {
                throw new BadRequestException(
                    'Giao dịch không ở trạng thái chờ xác nhận.',
                );
            }

            const booking = payment.booking;

            // Xác định giao dịch bị từ chối là lần thanh toán đầu hay bổ sung.
            const isInitialPayment = booking.status === BookingStatus.PAYMENT_REVIEW && booking.paymentStatus === PaymentStatus.REPORTED;

            const isAdditionalPayment = booking.status === BookingStatus.CONFIRMED && booking.paymentStatus === PaymentStatus.PARTIALLY_PAID;

            if (!isInitialPayment && !isAdditionalPayment) {
                throw new ConflictException(
                    'Trạng thái booking không phù hợp để từ chối thanh toán.',
                );
            }

            // Chỉ một nhân viên được phép xử lý giao dịch này.
            const updatedPayment = await tx.payment.updateMany({
                where: {
                    id: paymentId,
                    status: PaymentStatus.REPORTED,
                },
                data: {
                    status: PaymentStatus.REJECTED,
                    rejectionReason: dto.rejectionReason,
                },
            });

            if (updatedPayment.count !== 1) {
                throw new ConflictException(
                    'Giao dịch đã được xử lý bởi một nhân viên khác.',
                );
            }

            // Nếu từ chối lần đầu, đưa booking về chờ thanh toán lại.
            // Nếu từ chối thanh toán bổ sung, giữ nguyên booking đã xác nhận.
            if (isInitialPayment) {
            await tx.booking.update({
                where: { id: booking.id },
                data: {
                    status: BookingStatus.PENDING,
                    paymentStatus: PaymentStatus.REJECTED,
                },
            });
            }

            return {
                message: 'Đã từ chối giao dịch thanh toán.',
                paymentId,
                bookingId: booking.id,
                paymentStatus: PaymentStatus.REJECTED,
                bookingStatus: isInitialPayment
                    ? BookingStatus.PENDING
                    : BookingStatus.CONFIRMED,
                bookingPaymentStatus: isInitialPayment
                    ? PaymentStatus.REJECTED
                    : PaymentStatus.PARTIALLY_PAID,
                rejectionReason: dto.rejectionReason,
                holdExpiresAt: booking.holdExpiresAt,
            };
        });
    }

    // Lấy danh sách giao dịch chờ xác nhận và đánh dấu giao dịch đã quá thời hạn xử lý.
    async findReportedPayments() {
        const timeoutMinutes = await this.settingsService.getNumberValue(
            'PAYMENT_REVIEW_TIMEOUT_MINUTES',
            30,
        );

        const now = new Date();

        const overdueBefore = new Date(
            now.getTime() - timeoutMinutes * 60 * 1000,
        );

        const payments = await this.prisma.payment.findMany({
            where: {
                status: PaymentStatus.REPORTED,
            },
            orderBy: [
                {
                    reportedAt: 'asc',
                },
                {
                    createdAt: 'asc',
                },
            ],
            include: {
                booking: {
                    include: {
                        trip: {
                            include: {
                                route: true,
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

        return payments.map((payment) => {
            const reportedAt = payment.reportedAt;

            // Chỉ tính quá hạn đối với giao dịch thanh toán đầu tiên đang đưa booking vào PAYMENT_REVIEW.
            const isInitialPaymentReview =
                payment.booking.status === BookingStatus.PAYMENT_REVIEW;

            const isOverdue =
                isInitialPaymentReview &&
                reportedAt !== null &&
                reportedAt <= overdueBefore;

            const elapsedMinutes = reportedAt
                ? Math.floor(
                    (now.getTime() - reportedAt.getTime()) / (60 * 1000),
                )
                : null;

            return {
                ...payment,
                isOverdue,
                elapsedMinutes,
                reviewTimeoutMinutes: timeoutMinutes,
            };
        });
    }
    
    // Lấy chi tiết một giao dịch thanh toán kèm thông tin booking và khách hàng.
    async findOne(paymentId: string) {
        const payment = await this.prisma.payment.findUnique({
            where: {
                id: paymentId,
            },
            include: {
                booking: {
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
                            pickupTripRoutePoint: true,
                            dropoffTripRoutePoint: true,
                        },
                    },
                    },
                },
            },
        });

        if (!payment) {
            throw new NotFoundException(
            'Không tìm thấy giao dịch thanh toán.',
            );
        }

        return payment;
        }
}