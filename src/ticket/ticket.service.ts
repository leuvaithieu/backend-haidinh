
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import {
    BookingStatus,
    TicketStatus,
    TripStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CheckInTicketDto } from './dto/check-in-ticket.dto';
import { FindTripTicketsDto } from './dto/find-trip-tickets.dto';

@Injectable()
export class TicketService {
    constructor(private readonly prisma: PrismaService) {}

    // Xác thực mã QR và ghi nhận khách đã lên xe, chỉ cho phép check-in một lần.
    async checkIn(dto: CheckInTicketDto, checkedInById: string) {
        const qrToken = dto.qrToken.trim();

        return this.prisma.$transaction(async (tx) => {
            // Tìm Booking ID từ mã QR để khóa Booking trước khi xử lý check-in.
            const ticketReference = await tx.ticket.findUnique({
                where: {
                    qrToken,
                },
                select: {
                    bookingSeat: {
                        select: {
                            bookingId: true,
                        },
                    },
                },
            });

            if (!ticketReference) {
                throw new NotFoundException(
                    'Không tìm thấy vé hoặc mã QR không hợp lệ.',
                );
            }

            const bookingId = ticketReference.bookingSeat.bookingId;

            // Khóa Booking để đồng bộ check-in với thao tác hủy Booking.
            await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id"
                FROM "Booking"
                WHERE "id" = ${bookingId}
                FOR UPDATE
            `;

            // Tìm lại vé và lấy thông tin mới nhất sau khi đã khóa Booking.
            const ticket = await tx.ticket.findUnique({
                where: {
                    qrToken,
                },
                include: {
                    bookingSeat: {
                        include: {
                            booking: {
                                include: {
                                    trip: {
                                        select: {
                                            id: true,
                                            status: true,
                                            plannedDeparture: true,
                                            plannedArrival: true,
                                            route: {
                                                select: {
                                                    name: true,
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                            seatAllocation: {
                                include: {
                                    tripSeat: {
                                        include: {
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

            if (!ticket) {
                throw new NotFoundException(
                    'Không tìm thấy vé hoặc mã QR không hợp lệ.',
                );
            }

            // Không cho phép sử dụng vé đã bị hủy.
            if (ticket.status === TicketStatus.CANCELLED) {
                throw new BadRequestException('Vé đã bị hủy.');
            }

            // Không cho phép quét lại vé đã check-in.
            if (ticket.status !== TicketStatus.ISSUED) {
                throw new ConflictException(
                    'Vé đã được xác nhận lên xe trước đó.',
                );
            }

            const booking = ticket.bookingSeat.booking;
            const trip = booking.trip;

            // Chỉ booking đã được xác nhận mới được phép lên xe.
            if (booking.status !== BookingStatus.CONFIRMED) {
                throw new BadRequestException(
                    'Booking chưa được xác nhận, không thể check-in.',
                );
            }

            // Không cho phép check-in chuyến đã hủy hoặc hoàn thành.
            if (
                trip.status === TripStatus.CANCELLED ||
                trip.status === TripStatus.COMPLETED
            ) {
                throw new BadRequestException(
                    'Chuyến xe đã hủy hoặc hoàn thành, không thể check-in.',
                );
            }

            // Cập nhật có điều kiện để ngăn hai nhân viên quét cùng một vé đồng thời.
            const updated = await tx.ticket.updateMany({
                where: {
                    id: ticket.id,
                    status: TicketStatus.ISSUED,
                },
                data: {
                    status: TicketStatus.CHECKED_IN,
                    checkedInAt: new Date(),
                    checkedInById,
                },
            });

            if (updated.count !== 1) {
                throw new ConflictException(
                    'Vé vừa được nhân viên khác xác nhận lên xe.',
                );
            }

            // Trả về thông tin xác nhận check-in cho nhân viên.
            return {
                message: 'Xác nhận khách lên xe thành công.',
                ticket: {
                    ticketCode: ticket.ticketCode,
                    status: TicketStatus.CHECKED_IN,
                    checkedInAt: new Date(),
                },
                booking: {
                    bookingCode: booking.bookingCode,
                    customerName: booking.customerName,
                },
                passenger: {
                    name: ticket.bookingSeat.passengerName,
                    phone: ticket.bookingSeat.passengerPhone,
                },
                trip: {
                    routeName: trip.route.name,
                    plannedDeparture: trip.plannedDeparture,
                    plannedArrival: trip.plannedArrival,
                },
                seat: ticket.bookingSeat.seatAllocation.tripSeat.seat,
                pickup: ticket.bookingSeat.pickupTripRoutePoint,
                dropoff: ticket.bookingSeat.dropoffTripRoutePoint,
            };
        });
    }

    // Lấy danh sách vé của một chuyến xe và hỗ trợ lọc theo trạng thái vé.
    async findTicketsByTrip(
        tripId: string,
        dto: FindTripTicketsDto,
    ) {
        const trip = await this.prisma.trip.findUnique({
            where: {
                id: tripId,
            },
            select: {
                id: true,
            },
        });

        if (!trip) {
            throw new NotFoundException('Không tìm thấy chuyến xe.');
        }

        const tickets = await this.prisma.ticket.findMany({
            where: {
                ...(dto.status && {
                    status: dto.status,
                }),
                bookingSeat: {
                    booking: {
                        tripId,
                    },
                },
            },
            orderBy: {
                issuedAt: 'desc',
            },
            select: {
                id: true,
                ticketCode: true,
                status: true,
                issuedAt: true,
                checkedInAt: true,
                cancelledAt: true,

                bookingSeat: {
                    select: {
                        passengerName: true,
                        passengerPhone: true,

                        booking: {
                            select: {
                                bookingCode: true,
                                customerName: true,
                                customerPhone: true,
                            },
                        },

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

        return {
            tripId,
            totalTickets: tickets.length,
            tickets,
        };
    }

    // Tra cứu chi tiết vé bằng mã vé để nhân viên hỗ trợ khách hàng.
    async findTicketByCode(ticketCode: string) {
        const ticket = await this.prisma.ticket.findUnique({
            where: {
                ticketCode: ticketCode.trim().toUpperCase(),
            },
            select: {
                id: true,
                ticketCode: true,
                status: true,
                issuedAt: true,
                checkedInAt: true,
                cancelledAt: true,

                bookingSeat: {
                    select: {
                        passengerName: true,
                        passengerPhone: true,
                        price: true,

                        booking: {
                            select: {
                                bookingCode: true,
                                customerName: true,
                                customerPhone: true,
                                status: true,
                                paymentStatus: true,
                            },
                        },

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

        if (!ticket) {
            throw new NotFoundException('Không tìm thấy vé.');
        }

        return ticket;
    }
}
