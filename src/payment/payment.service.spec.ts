
import { Test, TestingModule } from '@nestjs/testing';
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import {
    BookingStatus,
    PaymentMethod,
    PaymentStatus,
    Prisma,
} from '@prisma/client';

import { PaymentService } from './payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

describe('PaymentService', () => {
    let service: PaymentService;

    const prismaMock = {
        $transaction: jest.fn(),
        payment: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            updateMany: jest.fn(),
        },
        booking: {
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        seatAllocation: {
            updateMany: jest.fn(),
        },
        $queryRaw: jest.fn(),
    };

    const settingsServiceMock = {
        getNumberValue: jest.fn(),
    };

    const txMock = {
        $queryRaw: jest.fn(),
        payment: {
            findUnique: jest.fn(),
            create: jest.fn(),
            updateMany: jest.fn(),
        },
        booking: {
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        seatAllocation: {
            updateMany: jest.fn(),
        },
    };

    beforeEach(async () => {
        jest.clearAllMocks();

        // Giả lập Prisma transaction bằng transaction client mock.
        prismaMock.$transaction.mockImplementation(
            async (callback: (tx: typeof txMock) => Promise<unknown>) => {
                return callback(txMock);
            },
        );

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PaymentService,
                {
                    provide: PrismaService,
                    useValue: prismaMock,
                },
                {
                    provide: SettingsService,
                    useValue: settingsServiceMock,
                },
            ],
        }).compile();

        service = module.get<PaymentService>(PaymentService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // Kiểm tra xác nhận thanh toán lần đầu và chuyển toàn bộ ghế HELD sang BOOKED.
    it('should confirm initial payment and book all held allocations', async () => {
        const paymentId = 'payment-1';
        const bookingId = 'booking-1';
        const confirmedById = 'staff-1';

        const booking = {
            id: bookingId,
            status: BookingStatus.PAYMENT_REVIEW,
            paymentStatus: PaymentStatus.REPORTED,
            paidAmount: 0,
            totalAmount: 1000000,
            seats: [
                { seatAllocationId: 'allocation-1' },
                { seatAllocationId: 'allocation-2' },
            ],
        };

        const payment = {
            id: paymentId,
            bookingId,
            amount: 500000,
            status: PaymentStatus.REPORTED,
            booking,
        };

        // Lần đọc đầu tiên lấy bookingId, lần thứ hai lấy đầy đủ payment và booking.
        txMock.payment.findUnique
            .mockResolvedValueOnce({
                id: paymentId,
                bookingId,
            })
            .mockResolvedValueOnce(payment);

        txMock.payment.updateMany.mockResolvedValue({ count: 1 });
        txMock.booking.update.mockResolvedValue({
            ...booking,
            status: BookingStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PARTIALLY_PAID,
            paidAmount: 500000,
            holdExpiresAt: null,
        });
        txMock.seatAllocation.updateMany.mockResolvedValue({ count: 2 });

        const result = await service.confirmPayment(
            paymentId,
            confirmedById,
        );

        expect(txMock.payment.updateMany).toHaveBeenCalledWith({
            where: {
                id: paymentId,
                status: PaymentStatus.REPORTED,
            },
            data: {
                status: PaymentStatus.PAID,
                confirmedAt: expect.any(Date),
                confirmedById,
            },
        });

        expect(txMock.booking.update).toHaveBeenCalledWith({
            where: { id: bookingId },
            data: {
                status: BookingStatus.CONFIRMED,
                paymentStatus: PaymentStatus.PARTIALLY_PAID,
                paidAmount: 500000,
                holdExpiresAt: null,
            },
        });

        expect(txMock.seatAllocation.updateMany).toHaveBeenCalledWith({
            where: {
                id: {
                    in: ['allocation-1', 'allocation-2'],
                },
                status: 'HELD',
            },
            data: {
                status: 'BOOKED',
                holdExpiresAt: null,
            },
        });

        expect(result).toEqual({
            message: 'Xác nhận thanh toán thành công.',
            paymentId,
            bookingId,
            paidAmount: 500000,
            remainingAmount: 500000,
            paymentStatus: PaymentStatus.PARTIALLY_PAID,
            bookingStatus: BookingStatus.CONFIRMED,
        });
    });

    // Kiểm tra hệ thống từ chối xác nhận nếu không chuyển được toàn bộ ghế sang BOOKED.
    it('should reject confirmation when not all allocations can be booked', async () => {
        const paymentId = 'payment-2';
        const bookingId = 'booking-2';

        const booking = {
            id: bookingId,
            status: BookingStatus.PAYMENT_REVIEW,
            paymentStatus: PaymentStatus.REPORTED,
            paidAmount: 0,
            totalAmount: 1000000,
            seats: [
                { seatAllocationId: 'allocation-1' },
                { seatAllocationId: 'allocation-2' },
            ],
        };

        const payment = {
            id: paymentId,
            bookingId,
            amount: 500000,
            status: PaymentStatus.REPORTED,
            booking,
        };

        txMock.payment.findUnique
            .mockResolvedValueOnce({
                id: paymentId,
                bookingId,
            })
            .mockResolvedValueOnce(payment);

        txMock.payment.updateMany.mockResolvedValue({ count: 1 });
        txMock.booking.update.mockResolvedValue({});
        
        // Chỉ một trong hai ghế được cập nhật thành công.
        txMock.seatAllocation.updateMany.mockResolvedValue({ count: 1 });

        await expect(
            service.confirmPayment(paymentId, 'staff-1'),
        ).rejects.toThrow(
            new ConflictException(
                'Không thể xác nhận toàn bộ ghế của booking.',
            ),
        );

        expect(txMock.seatAllocation.updateMany).toHaveBeenCalled();
    });

    // Kiểm tra thanh toán bổ sung chỉ cộng tiền và không cập nhật lại trạng thái ghế.
    it('should confirm additional payment without updating allocations', async () => {
        const paymentId = 'payment-3';
        const bookingId = 'booking-3';

        const booking = {
            id: bookingId,
            status: BookingStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PARTIALLY_PAID,
            paidAmount: 500000,
            totalAmount: 1000000,
            seats: [
                { seatAllocationId: 'allocation-1' },
                { seatAllocationId: 'allocation-2' },
            ],
        };

        const payment = {
            id: paymentId,
            bookingId,
            amount: 300000,
            status: PaymentStatus.REPORTED,
            booking,
        };

        txMock.payment.findUnique
            .mockResolvedValueOnce({
                id: paymentId,
                bookingId,
            })
            .mockResolvedValueOnce(payment);

        txMock.payment.updateMany.mockResolvedValue({ count: 1 });
        txMock.booking.update.mockResolvedValue({});

        const result = await service.confirmPayment(
            paymentId,
            'staff-1',
        );

        expect(txMock.booking.update).toHaveBeenCalledWith({
            where: { id: bookingId },
            data: {
                status: BookingStatus.CONFIRMED,
                paymentStatus: PaymentStatus.PARTIALLY_PAID,
                paidAmount: 800000,
                holdExpiresAt: null,
            },
        });

        // Thanh toán bổ sung không được cập nhật lại các ghế.
        expect(txMock.seatAllocation.updateMany).not.toHaveBeenCalled();

        expect(result).toEqual({
            message: 'Xác nhận thanh toán thành công.',
            paymentId,
            bookingId,
            paidAmount: 800000,
            remainingAmount: 200000,
            paymentStatus: PaymentStatus.PARTIALLY_PAID,
            bookingStatus: BookingStatus.CONFIRMED,
        });
    });

    // Kiểm tra thanh toán bổ sung đủ số tiền còn lại sẽ chuyển booking sang PAID.
    it('should mark booking as PAID when additional payment completes total amount', async () => {
        const paymentId = 'payment-4';
        const bookingId = 'booking-4';

        const booking = {
            id: bookingId,
            status: BookingStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PARTIALLY_PAID,
            paidAmount: 500000,
            totalAmount: 1000000,
            seats: [
                { seatAllocationId: 'allocation-1' },
            ],
        };

        const payment = {
            id: paymentId,
            bookingId,
            amount: 500000,
            status: PaymentStatus.REPORTED,
            booking,
        };

        txMock.payment.findUnique
            .mockResolvedValueOnce({
                id: paymentId,
                bookingId,
            })
            .mockResolvedValueOnce(payment);

        txMock.payment.updateMany.mockResolvedValue({ count: 1 });
        txMock.booking.update.mockResolvedValue({});

        const result = await service.confirmPayment(
            paymentId,
            'staff-1',
        );

        expect(txMock.booking.update).toHaveBeenCalledWith({
            where: { id: bookingId },
            data: {
                status: BookingStatus.CONFIRMED,
                paymentStatus: PaymentStatus.PAID,
                paidAmount: 1000000,
                holdExpiresAt: null,
            },
        });

        // Thanh toán bổ sung không được thay đổi trạng thái ghế đã BOOKED.
        expect(txMock.seatAllocation.updateMany).not.toHaveBeenCalled();

        expect(result).toEqual({
            message: 'Xác nhận thanh toán thành công.',
            paymentId,
            bookingId,
            paidAmount: 1000000,
            remainingAmount: 0,
            paymentStatus: PaymentStatus.PAID,
            bookingStatus: BookingStatus.CONFIRMED,
        });
    });

    // Kiểm tra từ chối thanh toán lần đầu và đưa booking về trạng thái chờ thanh toán lại.
    it('should reject initial payment and return booking to PENDING', async () => {
        const paymentId = 'payment-5';
        const bookingId = 'booking-5';
        const rejectionReason = 'Không tìm thấy giao dịch trong tài khoản';

        const holdExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        const booking = {
            id: bookingId,
            status: BookingStatus.PAYMENT_REVIEW,
            paymentStatus: PaymentStatus.REPORTED,
            holdExpiresAt,
        };

        const payment = {
            id: paymentId,
            bookingId,
            status: PaymentStatus.REPORTED,
            booking,
        };

        txMock.payment.findUnique
            .mockResolvedValueOnce({
                id: paymentId,
                bookingId,
            })
            .mockResolvedValueOnce(payment);

        txMock.payment.updateMany.mockResolvedValue({ count: 1 });
        txMock.booking.update.mockResolvedValue({});

        const result = await service.rejectPayment(paymentId, {
            rejectionReason,
        });

        expect(txMock.payment.updateMany).toHaveBeenCalledWith({
            where: {
                id: paymentId,
                status: PaymentStatus.REPORTED,
            },
            data: {
                status: PaymentStatus.REJECTED,
                rejectionReason,
            },
        });

        expect(txMock.booking.update).toHaveBeenCalledWith({
            where: { id: bookingId },
            data: {
                status: BookingStatus.PENDING,
                paymentStatus: PaymentStatus.REJECTED,
            },
        });

        expect(txMock.seatAllocation.updateMany).not.toHaveBeenCalled();

        expect(result).toEqual({
            message: 'Đã từ chối giao dịch thanh toán.',
            paymentId,
            bookingId,
            paymentStatus: PaymentStatus.REJECTED,
            bookingStatus: BookingStatus.PENDING,
            bookingPaymentStatus: PaymentStatus.REJECTED,
            rejectionReason,
            holdExpiresAt,
        });
    });

    // Kiểm tra từ chối thanh toán bổ sung không làm thay đổi booking đã xác nhận.
    it('should reject additional payment and keep booking confirmed', async () => {
        const paymentId = 'payment-6';
        const bookingId = 'booking-6';
        const rejectionReason = 'Số tiền chuyển khoản không khớp';

        const booking = {
            id: bookingId,
            status: BookingStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PARTIALLY_PAID,
            paidAmount: 500000,
            totalAmount: 1000000,
            holdExpiresAt: null,
        };

        const payment = {
            id: paymentId,
            bookingId,
            status: PaymentStatus.REPORTED,
            booking,
        };

        txMock.payment.findUnique
            .mockResolvedValueOnce({
                id: paymentId,
                bookingId,
            })
            .mockResolvedValueOnce(payment);

        txMock.payment.updateMany.mockResolvedValue({ count: 1 });

        const result = await service.rejectPayment(paymentId, {
            rejectionReason,
        });

        expect(txMock.payment.updateMany).toHaveBeenCalledWith({
            where: {
                id: paymentId,
                status: PaymentStatus.REPORTED,
            },
            data: {
                status: PaymentStatus.REJECTED,
                rejectionReason,
            },
        });

        // Booking đã xác nhận không được cập nhật lại khi từ chối thanh toán bổ sung.
        expect(txMock.booking.update).not.toHaveBeenCalled();

        // Không giải phóng hoặc thay đổi các ghế đã BOOKED.
        expect(txMock.seatAllocation.updateMany).not.toHaveBeenCalled();

        expect(result).toEqual({
            message: 'Đã từ chối giao dịch thanh toán.',
            paymentId,
            bookingId,
            paymentStatus: PaymentStatus.REJECTED,
            bookingStatus: BookingStatus.CONFIRMED,
            bookingPaymentStatus: PaymentStatus.PARTIALLY_PAID,
            rejectionReason,
            holdExpiresAt: null,
        });
    });

    // Kiểm tra khách báo thanh toán lần đầu hợp lệ và booking chuyển sang PAYMENT_REVIEW.
    it('should report initial payment and move booking to PAYMENT_REVIEW', async () => {
        const bookingId = 'booking-7';
        const holdExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        const booking = {
            id: bookingId,
            status: BookingStatus.PENDING,
            paymentStatus: PaymentStatus.UNPAID,
            totalAmount: 1000000,
            paidAmount: 0,
            depositAmount: 300000,
            holdExpiresAt,
            payments: [],
        };

        const dto = {
            amount: 300000,
            transactionCode: 'BANK-TRANSFER-001',
            transferContent: 'THANH TOAN VE HD',
        };

        const createdPayment = {
            id: 'payment-7',
            bookingId,
            amount: dto.amount,
            method: PaymentMethod.BANK_TRANSFER,
            status: PaymentStatus.REPORTED,
            transactionCode: dto.transactionCode,
            transferContent: dto.transferContent,
        };

        txMock.booking.findUnique.mockResolvedValue(booking);
        txMock.payment.create.mockResolvedValue(createdPayment);
        txMock.booking.update.mockResolvedValue({
            ...booking,
            status: BookingStatus.PAYMENT_REVIEW,
            paymentStatus: PaymentStatus.REPORTED,
        });

        const result = await service.reportPayment(bookingId, dto);

        expect(txMock.booking.findUnique).toHaveBeenCalledWith({
            where: { id: bookingId },
            include: {
                payments: true,
            },
        });

        expect(txMock.payment.create).toHaveBeenCalledWith({
            data: {
                bookingId,
                amount: dto.amount,
                method: PaymentMethod.BANK_TRANSFER,
                status: PaymentStatus.REPORTED,
                transactionCode: dto.transactionCode,
                transferContent: dto.transferContent,
                reportedAt: expect.any(Date),
            },
        });

        expect(txMock.booking.update).toHaveBeenCalledWith({
            where: { id: bookingId },
            data: {
                status: BookingStatus.PAYMENT_REVIEW,
                paymentStatus: PaymentStatus.REPORTED,
            },
        });

        expect(txMock.seatAllocation.updateMany).not.toHaveBeenCalled();

        expect(result).toEqual({
            message: 'Đã ghi nhận thông tin chuyển khoản.',
            payment: createdPayment,
        });
    });

    // Kiểm tra không cho khách báo số tiền vượt quá số tiền còn phải thanh toán.
    it('should reject reported payment amount greater than remaining amount', async () => {
        const bookingId = 'booking-8';

        txMock.booking.findUnique.mockResolvedValue({
            id: bookingId,
            status: BookingStatus.PENDING,
            paymentStatus: PaymentStatus.UNPAID,
            totalAmount: 1000000,
            paidAmount: 0,
            depositAmount: 300000,
            holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
            payments: [],
        });

        const dto = {
            amount: 1000001,
            transactionCode: 'BANK-TRANSFER-002',
            transferContent: 'THANH TOAN VE HD',
        };

        await expect(
            service.reportPayment(bookingId, dto),
        ).rejects.toThrow(
            new BadRequestException(
                'Số tiền báo chuyển vượt quá số tiền còn phải thanh toán.',
            ),
        );

        expect(txMock.payment.create).not.toHaveBeenCalled();
        expect(txMock.booking.update).not.toHaveBeenCalled();
    });

    // Kiểm tra không cho tạo giao dịch mới khi booking đã có giao dịch đang chờ xác nhận.
    it('should reject new payment report when another payment is pending', async () => {
        const bookingId = 'booking-9';

        txMock.booking.findUnique.mockResolvedValue({
            id: bookingId,
            status: BookingStatus.PENDING,
            paymentStatus: PaymentStatus.UNPAID,
            totalAmount: 1000000,
            paidAmount: 0,
            depositAmount: 300000,
            holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
            payments: [
                {
                    id: 'payment-existing',
                    status: PaymentStatus.REPORTED,
                },
            ],
        });

        const dto = {
            amount: 300000,
            transactionCode: 'BANK-TRANSFER-003',
            transferContent: 'THANH TOAN VE HD',
        };

        await expect(
            service.reportPayment(bookingId, dto),
        ).rejects.toThrow(
            new ConflictException(
                'Booking đã có giao dịch đang chờ xác nhận.',
            ),
        );

        expect(txMock.payment.create).not.toHaveBeenCalled();
        expect(txMock.booking.update).not.toHaveBeenCalled();
    });

    // Kiểm tra khách báo thanh toán bổ sung khi booking đã CONFIRMED và còn nợ tiền.
    it('should report additional payment without changing booking status', async () => {
        const bookingId = 'booking-10';

        const booking = {
            id: bookingId,
            status: BookingStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PARTIALLY_PAID,
            totalAmount: 1000000,
            paidAmount: 500000,
            depositAmount: 300000,
            holdExpiresAt: null,
            payments: [],
        };

        const dto = {
            amount: 500000,
            transactionCode: 'BANK-TRANSFER-004',
            transferContent: 'THANH TOAN PHAN CON LAI',
        };

        const createdPayment = {
            id: 'payment-10',
            bookingId,
            amount: dto.amount,
            method: PaymentMethod.BANK_TRANSFER,
            status: PaymentStatus.REPORTED,
            transactionCode: dto.transactionCode,
            transferContent: dto.transferContent,
        };

        txMock.booking.findUnique.mockResolvedValue(booking);
        txMock.payment.create.mockResolvedValue(createdPayment);

        const result = await service.reportPayment(bookingId, dto);

        expect(txMock.payment.create).toHaveBeenCalledWith({
            data: {
                bookingId,
                amount: dto.amount,
                method: PaymentMethod.BANK_TRANSFER,
                status: PaymentStatus.REPORTED,
                transactionCode: dto.transactionCode,
                transferContent: dto.transferContent,
                reportedAt: expect.any(Date),
            },
        });

        // Booking đã CONFIRMED nên không chuyển lại sang PAYMENT_REVIEW.
        expect(txMock.booking.update).not.toHaveBeenCalled();

        expect(result).toEqual({
            message: 'Đã ghi nhận thông tin chuyển khoản.',
            payment: createdPayment,
        });
    });

    // Kiểm tra thanh toán lần đầu không đạt mức cọc tối thiểu thì không được ghi nhận.
    it('should reject initial payment below minimum deposit', async () => {
        const bookingId = 'booking-11';

        txMock.booking.findUnique.mockResolvedValue({
            id: bookingId,
            status: BookingStatus.PENDING,
            paymentStatus: PaymentStatus.UNPAID,
            totalAmount: 1000000,
            paidAmount: 0,
            depositAmount: 300000,
            holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
            payments: [],
        });

        const dto = {
            amount: 299999,
            transactionCode: 'BANK-TRANSFER-005',
            transferContent: 'THANH TOAN VE HD',
        };

        await expect(
            service.reportPayment(bookingId, dto),
        ).rejects.toThrow(
            new BadRequestException(
                'Số tiền thanh toán lần đầu phải tối thiểu 300000 VND.',
            ),
        );

        expect(txMock.payment.create).not.toHaveBeenCalled();
        expect(txMock.booking.update).not.toHaveBeenCalled();
    });

    // Kiểm tra báo thanh toán cho booking không tồn tại phải trả về NotFoundException.
    it('should throw NotFoundException when reporting payment for missing booking', async () => {
        const bookingId = 'booking-not-found';

        txMock.booking.findUnique.mockResolvedValue(null);

        const dto = {
            amount: 300000,
            transactionCode: 'BANK-TRANSFER-006',
            transferContent: 'THANH TOAN VE HD',
        };

        await expect(
            service.reportPayment(bookingId, dto),
        ).rejects.toThrow(
            new NotFoundException('Không tìm thấy booking.'),
        );

        expect(txMock.payment.create).not.toHaveBeenCalled();
        expect(txMock.booking.update).not.toHaveBeenCalled();
    });

    // Kiểm tra không cho báo thanh toán lần đầu khi thời hạn giữ ghế đã hết.
    it('should reject initial payment when seat hold has expired', async () => {
        const bookingId = 'booking-12';

        txMock.booking.findUnique.mockResolvedValue({
            id: bookingId,
            status: BookingStatus.PENDING,
            paymentStatus: PaymentStatus.UNPAID,
            totalAmount: 1000000,
            paidAmount: 0,
            depositAmount: 300000,
            holdExpiresAt: new Date(Date.now() - 60 * 1000),
            payments: [],
        });

        const dto = {
            amount: 300000,
            transactionCode: 'BANK-TRANSFER-007',
            transferContent: 'THANH TOAN VE HD',
        };

        await expect(
            service.reportPayment(bookingId, dto),
        ).rejects.toThrow(
            new BadRequestException(
                'Thời gian giữ ghế đã hết hạn. Vui lòng đặt vé lại.',
            ),
        );

        expect(txMock.payment.create).not.toHaveBeenCalled();
        expect(txMock.booking.update).not.toHaveBeenCalled();
    });

    // Kiểm tra reportPayment chuyển lỗi xung đột transaction P2034 thành ConflictException.
    it('should convert Prisma P2034 error to ConflictException when reporting payment', async () => {
        const prismaError = new Prisma.PrismaClientKnownRequestError(
            'Transaction failed due to a write conflict or a deadlock.',
            {
                code: 'P2034',
                clientVersion: '6.16.2',
            },
        );

        prismaMock.$transaction.mockRejectedValue(prismaError);

        const dto = {
            amount: 300000,
            transactionCode: 'BANK-TRANSFER-008',
            transferContent: 'THANH TOAN VE HD',
        };

        await expect(
            service.reportPayment('booking-13', dto),
        ).rejects.toThrow(
            new ConflictException(
                'Booking đang được xử lý bởi một yêu cầu khác. Vui lòng thử lại.',
            ),
        );
    });

    // Kiểm tra chỉ một nhân viên được xác nhận giao dịch khi có yêu cầu xử lý đồng thời.
    it('should reject confirmation when payment was already processed by another staff', async () => {
        const paymentId = 'payment-14';
        const bookingId = 'booking-14';

        const booking = {
            id: bookingId,
            status: BookingStatus.PAYMENT_REVIEW,
            paymentStatus: PaymentStatus.REPORTED,
            paidAmount: 0,
            totalAmount: 1000000,
            seats: [
                { seatAllocationId: 'allocation-1' },
            ],
        };

        const payment = {
            id: paymentId,
            bookingId,
            amount: 500000,
            status: PaymentStatus.REPORTED,
            booking,
        };

        txMock.payment.findUnique
            .mockResolvedValueOnce({
                id: paymentId,
                bookingId,
            })
            .mockResolvedValueOnce(payment);

        // Nhân viên khác đã xử lý giao dịch trước đó.
        txMock.payment.updateMany.mockResolvedValue({ count: 0 });

        await expect(
            service.confirmPayment(paymentId, 'staff-2'),
        ).rejects.toThrow(
            new ConflictException(
                'Giao dịch đã được xử lý bởi một nhân viên khác.',
            ),
        );

        expect(txMock.booking.update).not.toHaveBeenCalled();
        expect(txMock.seatAllocation.updateMany).not.toHaveBeenCalled();
    });

    // Kiểm tra không cho xác nhận giao dịch khiến tổng tiền đã thanh toán vượt giá trị booking.
    it('should reject confirmation when total paid amount exceeds booking total', async () => {
        const paymentId = 'payment-15';
        const bookingId = 'booking-15';

        const booking = {
            id: bookingId,
            status: BookingStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PARTIALLY_PAID,
            paidAmount: 500000,
            totalAmount: 1000000,
            seats: [
                { seatAllocationId: 'allocation-1' },
            ],
        };

        const payment = {
            id: paymentId,
            bookingId,
            amount: 600000,
            status: PaymentStatus.REPORTED,
            booking,
        };

        txMock.payment.findUnique
            .mockResolvedValueOnce({
                id: paymentId,
                bookingId,
            })
            .mockResolvedValueOnce(payment);

        await expect(
            service.confirmPayment(paymentId, 'staff-1'),
        ).rejects.toThrow(
            new BadRequestException(
                'Tổng tiền đã thanh toán vượt quá giá trị booking.',
            ),
        );

        expect(txMock.payment.updateMany).not.toHaveBeenCalled();
        expect(txMock.booking.update).not.toHaveBeenCalled();
        expect(txMock.seatAllocation.updateMany).not.toHaveBeenCalled();
    });

    // Kiểm tra xác nhận giao dịch không tồn tại phải trả về NotFoundException.
    it('should throw NotFoundException when confirming missing payment', async () => {
        const paymentId = 'payment-not-found';

        txMock.payment.findUnique.mockResolvedValue(null);

        await expect(
            service.confirmPayment(paymentId, 'staff-1'),
        ).rejects.toThrow(
            new NotFoundException('Không tìm thấy giao dịch thanh toán.'),
        );

        expect(txMock.booking.update).not.toHaveBeenCalled();
        expect(txMock.seatAllocation.updateMany).not.toHaveBeenCalled();
    });

    // Kiểm tra không cho xác nhận lại giao dịch đã bị từ chối.
    it('should reject confirmation of an already rejected payment', async () => {
        const paymentId = 'payment-16';
        const bookingId = 'booking-16';

        txMock.payment.findUnique
            .mockResolvedValueOnce({
                id: paymentId,
                bookingId,
            })
            .mockResolvedValueOnce({
                id: paymentId,
                bookingId,
                status: PaymentStatus.REJECTED,
                booking: {
                    id: bookingId,
                    status: BookingStatus.PENDING,
                    paymentStatus: PaymentStatus.REJECTED,
                    paidAmount: 0,
                    totalAmount: 1000000,
                    seats: [],
                },
            });

        await expect(
            service.confirmPayment(paymentId, 'staff-1'),
        ).rejects.toThrow(
            new BadRequestException(
                'Giao dịch không ở trạng thái chờ xác nhận.',
            ),
        );

        expect(txMock.payment.updateMany).not.toHaveBeenCalled();
        expect(txMock.booking.update).not.toHaveBeenCalled();
        expect(txMock.seatAllocation.updateMany).not.toHaveBeenCalled();
    });

    // Kiểm tra từ chối giao dịch không tồn tại phải trả về NotFoundException.
    it('should throw NotFoundException when rejecting missing payment', async () => {
        const paymentId = 'payment-not-found';

        txMock.payment.findUnique.mockResolvedValue(null);

        await expect(
            service.rejectPayment(paymentId, {
                rejectionReason: 'Không tìm thấy giao dịch',
            }),
        ).rejects.toThrow(
            new NotFoundException('Không tìm thấy giao dịch thanh toán.'),
        );

        expect(txMock.payment.updateMany).not.toHaveBeenCalled();
        expect(txMock.booking.update).not.toHaveBeenCalled();
    });

    // Kiểm tra không cho từ chối giao dịch đã được xác nhận thanh toán thành công.
    it('should reject rejection of an already paid payment', async () => {
        const paymentId = 'payment-17';
        const bookingId = 'booking-17';

        txMock.payment.findUnique
            .mockResolvedValueOnce({
                id: paymentId,
                bookingId,
            })
            .mockResolvedValueOnce({
                id: paymentId,
                bookingId,
                status: PaymentStatus.PAID,
                booking: {
                    id: bookingId,
                    status: BookingStatus.CONFIRMED,
                    paymentStatus: PaymentStatus.PARTIALLY_PAID,
                    paidAmount: 500000,
                    totalAmount: 1000000,
                },
            });

        await expect(
            service.rejectPayment(paymentId, {
                rejectionReason: 'Kiểm tra giao dịch',
            }),
        ).rejects.toThrow(
            new BadRequestException(
                'Giao dịch không ở trạng thái chờ xác nhận.',
            ),
        );

        expect(txMock.payment.updateMany).not.toHaveBeenCalled();
        expect(txMock.booking.update).not.toHaveBeenCalled();
        expect(txMock.seatAllocation.updateMany).not.toHaveBeenCalled();
    });

    // Kiểm tra giao dịch thanh toán lần đầu được đánh dấu quá hạn sau thời gian chờ xác nhận.
    it('should mark initial payment as overdue after review timeout', async () => {
        const reportedAt = new Date(Date.now() - 31 * 60 * 1000);

        settingsServiceMock.getNumberValue.mockResolvedValue(30);

        prismaMock.payment.findMany.mockResolvedValue([
            {
                id: 'payment-18',
                status: PaymentStatus.REPORTED,
                reportedAt,
                booking: {
                    status: BookingStatus.PAYMENT_REVIEW,
                },
            },
        ]);

        const result = await service.findReportedPayments();

        expect(settingsServiceMock.getNumberValue).toHaveBeenCalledWith(
            'PAYMENT_REVIEW_TIMEOUT_MINUTES',
            30,
        );

        expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: PaymentStatus.REPORTED,
                },
                orderBy: [
                    { reportedAt: 'asc' },
                    { createdAt: 'asc' },
                ],
            }),
        );

        expect(result).toHaveLength(1);
        expect(result[0].isOverdue).toBe(true);
        expect(result[0].elapsedMinutes).toBeGreaterThanOrEqual(31);
        expect(result[0].reviewTimeoutMinutes).toBe(30);
    });

    // Kiểm tra giao dịch thanh toán bổ sung không bị đánh dấu quá hạn theo quy tắc PAYMENT_REVIEW.
    it('should not mark additional payment as overdue', async () => {
        const reportedAt = new Date(Date.now() - 60 * 60 * 1000);

        settingsServiceMock.getNumberValue.mockResolvedValue(30);

        prismaMock.payment.findMany.mockResolvedValue([
            {
                id: 'payment-19',
                status: PaymentStatus.REPORTED,
                reportedAt,
                booking: {
                    status: BookingStatus.CONFIRMED,
                },
            },
        ]);

        const result = await service.findReportedPayments();

        expect(result).toHaveLength(1);
        expect(result[0].isOverdue).toBe(false);
        expect(result[0].elapsedMinutes).toBeGreaterThanOrEqual(60);
        expect(result[0].reviewTimeoutMinutes).toBe(30);
    });

    // Kiểm tra lấy chi tiết giao dịch không tồn tại phải trả về NotFoundException.
    it('should throw NotFoundException when finding missing payment', async () => {
        const paymentId = 'payment-not-found';

        prismaMock.payment.findUnique.mockResolvedValue(null);

        await expect(
            service.findOne(paymentId),
        ).rejects.toThrow(
            new NotFoundException('Không tìm thấy giao dịch thanh toán.'),
        );

        expect(prismaMock.payment.findUnique).toHaveBeenCalledWith({
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
    });

    // Kiểm tra lấy chi tiết giao dịch thành công kèm thông tin booking và hành trình.
    it('should return payment details with booking, trip, route and seats', async () => {
        const paymentId = 'payment-20';

        const paymentDetails = {
            id: paymentId,
            amount: 500000,
            status: PaymentStatus.PAID,
            booking: {
                id: 'booking-20',
                trip: {
                    id: 'trip-20',
                    route: {
                        id: 'route-1',
                    },
                    vehicle: {
                        id: 'vehicle-1',
                    },
                },
                seats: [
                    {
                        seatAllocation: {
                            id: 'allocation-1',
                            tripSeat: {
                                seat: {
                                    id: 'seat-1',
                                    seatNumber: 'A01',
                                },
                            },
                        },
                        pickupTripRoutePoint: {
                            id: 'pickup-1',
                        },
                        dropoffTripRoutePoint: {
                            id: 'dropoff-1',
                        },
                    },
                ],
            },
        };

        prismaMock.payment.findUnique.mockResolvedValue(paymentDetails);

        const result = await service.findOne(paymentId);

        expect(prismaMock.payment.findUnique).toHaveBeenCalledWith({
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

        expect(result).toBe(paymentDetails);
        expect(result.booking.trip.route.id).toBe('route-1');
        expect(result.booking.trip.vehicle.id).toBe('vehicle-1');
        expect(result.booking.seats[0].seatAllocation.tripSeat.seat.seatNumber)
            .toBe('A01');
    });
});
