
import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';

@Injectable()
export class TicketPdfService {
    constructor(private readonly prisma: PrismaService) {}

    
    // Tạo vé PDF khổ giấy nhiệt 58mm, tối ưu cho in trực tiếp trên xe.
    async generateTicketPdf(ticketId: string): Promise<Buffer> {
        const ticket = await this.prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                bookingSeat: {
                    include: {
                        booking: {
                            include: {
                                trip: {
                                    include: {
                                        route: {
                                            select: { name: true },
                                        },
                                        vehicle: {
                                            select: {
                                                name: true,
                                                licensePlate: true,
                                                vehicleType: true,
                                                seatCount: true,
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
                        pickupRoutePoint: {
                            select: { name: true },
                        },
                        dropoffRoutePoint: {
                            select: { name: true },
                        },
                        pickupServicePoint: {
                            select: { name: true },
                        },
                        dropoffServicePoint: {
                            select: { name: true },
                        },
                    },
                },
            },
        });

        if (!ticket) {
            throw new NotFoundException('Không tìm thấy vé.');
        }

        const booking = ticket.bookingSeat.booking;
        const bookingSeat = ticket.bookingSeat;
        const trip = booking.trip;

        const fontRegular = path.join(
            process.cwd(),
            'assets',
            'fonts',
            'Arial.ttf',
        );

        const fontBold = path.join(
            process.cwd(),
            'assets',
            'fonts',
            'Arial-Bold.ttf',
        );

        if (!fs.existsSync(fontRegular) || !fs.existsSync(fontBold)) {
            throw new Error(
                'Không tìm thấy font PDF. Kiểm tra thư mục assets/fonts.',
            );
        }

        const pickupName =
            bookingSeat.pickupServicePoint?.name ??
            bookingSeat.pickupTripRoutePoint?.pointName ??
            bookingSeat.pickupRoutePoint?.name ??
            'Chưa xác định';

        const dropoffName =
            bookingSeat.dropoffServicePoint?.name ??
            bookingSeat.dropoffTripRoutePoint?.pointName ??
            bookingSeat.dropoffRoutePoint?.name ??
            'Chưa xác định';

        const departureTime =
            bookingSeat.pickupTripRoutePoint?.plannedTime ??
            trip.plannedDeparture;

        const departureDate = new Date(departureTime);

        const seat = bookingSeat.seatAllocation.tripSeat.seat;
        const seatName = seat.label ?? seat.code;

        const qrBuffer = await QRCode.toBuffer(ticket.qrToken, {
            type: 'png',
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 400,
        });

        
        // Khổ giấy nhiệt 80mm; chiều cao tạm đủ lớn và sẽ cắt theo nội dung thực tế.
        const pageWidth = (80 * 72) / 25.4;
        const canvasHeight = 2000;
        const margin = 14;
        const contentWidth = pageWidth - margin * 2;

        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({
                size: [pageWidth, canvasHeight],
                margins: {
                    top: 12,
                    bottom: 12,
                    left: margin,
                    right: margin,
                },
                info: {
                    Title: `Vé điện tử ${ticket.ticketCode}`,
                    Author: 'Công ty TNHH Hải Định',
                },
            });

            const chunks: Buffer[] = [];

            doc.on('data', (chunk: Buffer) => chunks.push(chunk));

            doc.on('error', reject);

            doc.on('end', async () => {
                try {
                    const rawPdf = Buffer.concat(chunks);
                    const pdf = await PDFLibDocument.load(rawPdf);
                    const page = pdf.getPage(0);

                    // Cắt phần giấy thừa phía dưới theo vị trí kết thúc nội dung.
                    const finalHeight = Math.ceil(doc.y + margin + 8);

                    page.setMediaBox(
                        0,
                        canvasHeight - finalHeight,
                        pageWidth,
                        finalHeight,
                    );

                    page.setCropBox(
                        0,
                        canvasHeight - finalHeight,
                        pageWidth,
                        finalHeight,
                    );

                    const result = await pdf.save();
                    resolve(Buffer.from(result));
                } catch (error) {
                    reject(error);
                }
            });

            doc.registerFont('Arial', fontRegular);
            doc.registerFont('Arial-Bold', fontBold);

            
            // Header thương hiệu Hải Định.
            doc.rect(0, 0, pageWidth, 82).fill('#B91C1C');

            doc
                .fillColor('#FFFFFF')
                .font('Arial-Bold')
                .fontSize(18)
                .text('HẢI ĐỊNH', margin, 7, {
                    width: contentWidth,
                    align: 'center',
                    lineBreak: false,
                });

            doc
                .font('Arial')
                .fontSize(7)
                .text('ĐỒNG HÀNH CÙNG MỌI HÀNH TRÌNH', margin, 28, {
                    width: contentWidth,
                    align: 'center',
                    lineBreak: false,
                });

            doc
                .font('Arial-Bold')
                .fontSize(10)
                .text('VÉ XE ĐIỆN TỬ', margin, 39, {
                    width: contentWidth,
                    align: 'center',
                    lineBreak: false,
                });

            doc
                .font('Arial')
                .fontSize(7)
                .text('ĐT: 0982561204 - 0982113878', margin, 52, {
                    width: contentWidth,
                    align: 'center',
                    lineBreak: false,
                });

            doc
                .font('Arial')
                .fontSize(7)
                .text('haidinh.com.vn | MST: 2801167692', margin, 62, {
                    width: contentWidth,
                    align: 'center',
                    lineBreak: false,
                });

            doc
                .font('Arial')
                .fontSize(7)
                .text('Địa chỉ: Man Thôn, Thọ Phú, Thanh Hóa', margin, 71, {
                    width: contentWidth,
                    align: 'center',
                    lineBreak: false,
                });

            doc.y = 92;

            // Trạng thái và mã vé.
            const statusText =
                ticket.status === 'ISSUED'
                    ? 'VÉ ĐÃ XÁC NHẬN'
                    : ticket.status === 'CHECKED_IN'
                      ? 'ĐÃ XÁC NHẬN LÊN XE'
                      : ticket.status === 'CANCELLED'
                        ? 'VÉ ĐÃ HỦY'
                        : 'VÉ ĐIỆN TỬ';

            doc
                .fillColor('#B91C1C')
                .font('Arial-Bold')
                .fontSize(10)
                .text(statusText, {
                    width: contentWidth,
                    align: 'center',
                });

            doc
                .fillColor('#222222')
                .font('Arial')
                .fontSize(8)
                .text(`Mã vé: ${ticket.ticketCode}`, {
                    width: contentWidth,
                    align: 'center',
                });

            doc.moveDown(0.6);

            // Đường phân cách.
            doc
                .moveTo(margin, doc.y)
                .lineTo(pageWidth - margin, doc.y)
                .lineWidth(0.7)
                .strokeColor('#CCCCCC')
                .stroke();

            doc.moveDown(0.6);

            // Thông tin hành trình.
            doc
                .fillColor('#B91C1C')
                .font('Arial-Bold')
                .fontSize(9)
                .text('HÀNH TRÌNH', {
                    width: contentWidth,
                    align: 'center',
                });

            doc.moveDown(0.3);

            doc
                .fillColor('#222222')
                .font('Arial-Bold')
                .fontSize(10)
                .text(trip.route.name, {
                    width: contentWidth,
                    align: 'center',
                });

            doc.moveDown(0.4);

            doc
                .font('Arial-Bold')
                .fontSize(8)
                .text('ĐIỂM ĐÓN', {
                    width: contentWidth,
                    align: 'center',
                });

            doc
                .font('Arial')
                .fontSize(9)
                .text(pickupName, {
                    width: contentWidth,
                    align: 'center',
                });

            if (bookingSeat.pickupTripRoutePoint?.plannedTime) {
                doc
                    .fontSize(8)
                    .fillColor('#555555')
                    .text(
                        `Giờ đón dự kiến: ${this.formatTime(
                            new Date(
                                bookingSeat.pickupTripRoutePoint.plannedTime,
                            ),
                        )}`,
                        {
                            width: contentWidth,
                            align: 'center',
                        },
                    );
            }

            doc.moveDown(0.4);

            doc
                .fillColor('#222222')
                .font('Arial-Bold')
                .fontSize(8)
                .text('ĐIỂM TRẢ', {
                    width: contentWidth,
                    align: 'center',
                });

            doc
                .font('Arial')
                .fontSize(9)
                .text(dropoffName, {
                    width: contentWidth,
                    align: 'center',
                });

            if (bookingSeat.dropoffTripRoutePoint?.plannedTime) {
                doc
                    .fontSize(8)
                    .fillColor('#555555')
                    .text(
                        `Giờ trả dự kiến: ${this.formatTime(
                            new Date(
                                bookingSeat.dropoffTripRoutePoint.plannedTime,
                            ),
                        )}`,
                        {
                            width: contentWidth,
                            align: 'center',
                        },
                    );
            }

            doc.moveDown(0.6);

            // Đường phân cách.
            doc
                .moveTo(margin, doc.y)
                .lineTo(pageWidth - margin, doc.y)
                .strokeColor('#CCCCCC')
                .stroke();

            doc.moveDown(0.5);

            // Thông tin phương tiện.
            doc
                .fillColor('#B91C1C')
                .font('Arial-Bold')
                .fontSize(9)
                .text('THÔNG TIN XE', {
                    width: contentWidth,
                    align: 'center',
                });

            doc.moveDown(0.2);

            doc
                .fillColor('#222222')
                .font('Arial')
                .fontSize(8)
                .text(`Biển số: ${trip.vehicle.licensePlate}`, {
                    width: contentWidth,
                    align: 'center',
                });

            doc.text(`Loại xe: ${trip.vehicle.vehicleType}`, {
                width: contentWidth,
                align: 'center',
            });

            doc.moveDown(0.6);

            // Đường phân cách.
            doc
                .moveTo(margin, doc.y)
                .lineTo(pageWidth - margin, doc.y)
                .strokeColor('#CCCCCC')
                .stroke();

            doc.moveDown(0.5);

            // Thời gian khởi hành.
            doc
                .fillColor('#B91C1C')
                .font('Arial-Bold')
                .fontSize(9)
                .text('THỜI GIAN KHỞI HÀNH', {
                    width: contentWidth,
                    align: 'center',
                });

            doc.moveDown(0.3);

            doc
                .fillColor('#222222')
                .font('Arial-Bold')
                .fontSize(17)
                .text(this.formatTime(departureDate), {
                    width: contentWidth,
                    align: 'center',
                });

            doc
                .font('Arial-Bold')
                .fontSize(11)
                .text(this.convertToVietnameseLunarDate(departureDate), {
                    width: contentWidth,
                    align: 'center',
                });

            doc
                .font('Arial')
                .fontSize(8)
                .text(`Dương lịch: ${this.formatDate(departureDate)}`, {
                    width: contentWidth,
                    align: 'center',
                });

            doc.moveDown(0.6);

            // Đường phân cách.
            doc
                .moveTo(margin, doc.y)
                .lineTo(pageWidth - margin, doc.y)
                .strokeColor('#CCCCCC')
                .stroke();

            doc.moveDown(0.5);

            // Thông tin hành khách.
            doc
                .fillColor('#B91C1C')
                .font('Arial-Bold')
                .fontSize(9)
                .text('HÀNH KHÁCH', {
                    width: contentWidth,
                    align: 'center',
                });

            doc.moveDown(0.2);

            doc
                .fillColor('#222222')
                .font('Arial')
                .fontSize(8)
                .text(
                    `Họ tên: ${
                        bookingSeat.passengerName ??
                        booking.customerName
                    }`,
                    {
                        width: contentWidth,
                        align: 'center',
                    },
                );

            doc.text(
                `Điện thoại: ${
                    bookingSeat.passengerPhone ??
                    booking.customerPhone
                }`,
                {
                    width: contentWidth,
                    align: 'center',
                },
            );

            doc.moveDown(0.5);

            // Số ghế được nhấn mạnh ở phần dưới vé.
            doc
                .font('Arial-Bold')
                .fontSize(16)
                .fillColor('#B91C1C')
                .text(`SỐ GHẾ: ${seatName}`, {
                    width: contentWidth,
                    align: 'center',
                });

            doc.moveDown(0.6);

            // Đường phân cách.
            doc
                .moveTo(margin, doc.y)
                .lineTo(pageWidth - margin, doc.y)
                .strokeColor('#CCCCCC')
                .stroke();

            doc.moveDown(0.5);

            // Thông tin thanh toán.
            doc
                .fillColor('#B91C1C')
                .font('Arial-Bold')
                .fontSize(9)
                .text('THÔNG TIN THANH TOÁN', {
                    width: contentWidth,
                    align: 'center',
                });

            doc.moveDown(0.2);

            doc
                .fillColor('#222222')
                .font('Arial')
                .fontSize(8)
                .text(
                    `Giá vé hành khách này: ${this.formatCurrency(
                        Number(bookingSeat.price),
                    )}`,
                    {
                        width: contentWidth,
                        align: 'center',
                    },
                );

            doc.moveDown(0.3);

            doc
                .font('Arial-Bold')
                .fontSize(8)
                .text('TỔNG THANH TOÁN BOOKING', {
                    width: contentWidth,
                    align: 'center',
                });

            doc
                .font('Arial')
                .fontSize(8)
                .text(
                    `Tổng tiền booking: ${this.formatCurrency(
                        Number(booking.totalAmount),
                    )}`,
                    {
                        width: contentWidth,
                        align: 'center',
                    },
                );

            doc.text(
                `Đã thanh toán: ${this.formatCurrency(
                    Number(booking.paidAmount),
                )}`,
                {
                    width: contentWidth,
                    align: 'center',
                },
            );

            doc
                .font('Arial-Bold')
                .text(
                    `Còn phải thanh toán: ${this.formatCurrency(
                        Math.max(
                            0,
                            Number(booking.totalAmount) -
                                Number(booking.paidAmount),
                        ),
                    )}`,
                    {
                        width: contentWidth,
                        align: 'center',
                    },
                );

            doc.moveDown(0.6);

            // Đường phân cách.
            doc
                .moveTo(margin, doc.y)
                .lineTo(pageWidth - margin, doc.y)
                .strokeColor('#CCCCCC')
                .stroke();

            doc.moveDown(0.6);

            // QR code xác thực vé thật.
            const qrSize = 112;
            const qrX = (pageWidth - qrSize) / 2;

            doc.image(qrBuffer, qrX, doc.y, {
                width: qrSize,
                height: qrSize,
            });

            doc.y += qrSize + 5;

            doc
                .fillColor('#222222')
                .font('Arial-Bold')
                .fontSize(9)
                .text('QUÉT MÃ QR KHI LÊN XE', {
                    width: contentWidth,
                    align: 'center',
                });

            doc.moveDown(0.3);

            doc
                .font('Arial')
                .fontSize(8)
                .text(
                    'Vui lòng có mặt tại điểm đón trước giờ khởi hành 30 phút.',
                    {
                        width: contentWidth,
                        align: 'center',
                    },
                );

            doc.text(
                'Xuất trình mã QR này cho nhân viên khi lên xe.',
                {
                    width: contentWidth,
                    align: 'center',
                },
            );

            doc.moveDown(0.5);

            doc
                .fillColor('#B91C1C')
                .font('Arial-Bold')
                .fontSize(9)
                .text('CÔNG TY TNHH HẢI ĐỊNH', {
                    width: contentWidth,
                    align: 'center',
                });

            doc.end();
        });
    }


    
    // Tạo một file PDF nhiều trang, mỗi trang là một vé thuộc booking.
    async generateBookingPdf(bookingId: string): Promise<Buffer> {
        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
            select: {
                id: true,
                seats: {
                    select: {
                        ticket: {
                            select: {
                                id: true,
                            },
                        },
                    },
                },
            },
        });

        if (!booking) {
            throw new NotFoundException('Không tìm thấy booking.');
        }

        const ticketIds = booking.seats
            .map((seat) => seat.ticket?.id)
            .filter((id): id is string => Boolean(id));

        if (ticketIds.length === 0) {
            throw new NotFoundException(
                'Booking chưa có vé được phát hành.',
            );
        }

        const mergedPdf = await PDFLibDocument.create();

        for (const ticketId of ticketIds) {
            const ticketBuffer = await this.generateTicketPdf(ticketId);

            const sourcePdf = await PDFLibDocument.load(ticketBuffer);

            const pages = await mergedPdf.copyPages(
                sourcePdf,
                sourcePdf.getPageIndices(),
            );

            for (const page of pages) {
                mergedPdf.addPage(page);
            }
        }

        const pdfBytes = await mergedPdf.save();

        return Buffer.from(pdfBytes);
    }


    // Vẽ đường phân cách giữa các phần thông tin trên vé.
    private drawDivider(
        doc: PDFKit.PDFDocument,
        y: number,
        width: number,
    ): void {
        doc
            .moveTo(32, y)
            .lineTo(32 + width, y)
            .lineWidth(0.6)
            .strokeColor('#DDDDDD')
            .stroke();
    }

    // Định dạng ngày dương lịch theo múi giờ Việt Nam.
    private formatDate(date: Date): string {
        return new Intl.DateTimeFormat('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        }).format(date);
    }

    // Định dạng giờ theo múi giờ Việt Nam.
    private formatTime(date: Date): string {
        return new Intl.DateTimeFormat('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(date);
    }

    // Định dạng số tiền Việt Nam đồng.
    private formatCurrency(amount: number): string {
        return `${new Intl.NumberFormat('vi-VN').format(amount)} ₫`;
    }

    // Chuyển ngày dương lịch sang ngày âm lịch Việt Nam (UTC+7).
    private convertToVietnameseLunarDate(date: Date): string {
        const localDate = new Date(
            date.toLocaleString('en-US', {
                timeZone: 'Asia/Ho_Chi_Minh',
            }),
        );

        const day = localDate.getDate();
        const month = localDate.getMonth() + 1;
        const year = localDate.getFullYear();

        const jd = this.jdFromDate(day, month, year);
        const k = Math.floor((jd - 2415021.076998695) / 29.530588853);
        let monthStart = this.getNewMoonDay(k + 1, 7);

        if (monthStart > jd) {
            monthStart = this.getNewMoonDay(k, 7);
        }

        let a11 = this.getLunarMonth11(year, 7);
        let b11 = a11;
        let lunarYear: number;

        if (a11 >= monthStart) {
            lunarYear = year;
            a11 = this.getLunarMonth11(year - 1, 7);
        } else {
            lunarYear = year + 1;
            b11 = this.getLunarMonth11(year + 1, 7);
        }

        const lunarDay = jd - monthStart + 1;
        const diff = Math.floor((monthStart - a11) / 29);
        let lunarMonth = diff + 11;
        let lunarLeap = 0;

        if (b11 - a11 > 365) {
            const leapMonthDiff = this.getLeapMonthOffset(a11, 7);

            if (diff >= leapMonthDiff) {
                lunarMonth = diff + 10;

                if (diff === leapMonthDiff) {
                    lunarLeap = 1;
                }
            }
        }

        if (lunarMonth > 12) {
            lunarMonth -= 12;
        }

        if (lunarMonth >= 11 && diff < 4) {
            lunarYear -= 1;
        }

        const leapText = lunarLeap ? ' (nhuận)' : '';

        return `Âm lịch: ${lunarDay}/${lunarMonth}${leapText}/${lunarYear}`;
    }

    // Tính số ngày Julius từ ngày dương lịch.
    private jdFromDate(day: number, month: number, year: number): number {
        const a = Math.floor((14 - month) / 12);
        const y = year + 4800 - a;
        const m = month + 12 * a - 3;

        let jd =
            day +
            Math.floor((153 * m + 2) / 5) +
            365 * y +
            Math.floor(y / 4) -
            Math.floor(y / 100) +
            Math.floor(y / 400) -
            32045;

        if (jd < 2299161) {
            jd =
                day +
                Math.floor((153 * m + 2) / 5) +
                365 * y +
                Math.floor(y / 4) -
                32083;
        }

        return jd;
    }

    // Tính ngày Sóc theo thuật toán lịch âm.
    private getNewMoonDay(k: number, timeZone: number): number {
        const t = k / 1236.85;
        const t2 = t * t;
        const t3 = t2 * t;
        const dr = Math.PI / 180;

        let jd1 =
            2415020.75933 +
            29.53058868 * k +
            0.0001178 * t2 -
            0.000000155 * t3;

        jd1 +=
            0.00033 *
            Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * dr);

        const m = 359.2242 + 29.10535608 * k - 0.0000333 * t2;
        const mPrime =
            306.0253 + 385.81691806 * k + 0.0107306 * t2;
        const f = 21.2964 + 390.67050646 * k - 0.0016528 * t2;

        let c1 =
            (0.1734 - 0.000393 * t) * Math.sin(m * dr) +
            0.0021 * Math.sin(2 * m * dr);

        c1 -= 0.4068 * Math.sin(mPrime * dr);
        c1 += 0.0161 * Math.sin(2 * mPrime * dr);
        c1 -= 0.0004 * Math.sin(3 * mPrime * dr);
        c1 += 0.0104 * Math.sin(2 * f * dr);
        c1 -= 0.0051 * Math.sin((m + mPrime) * dr);
        c1 -= 0.0074 * Math.sin((m - mPrime) * dr);
        c1 += 0.0004 * Math.sin((2 * f + m) * dr);
        c1 -= 0.0004 * Math.sin((2 * f - m) * dr);
        c1 -= 0.0006 * Math.sin((2 * f + mPrime) * dr);
        c1 += 0.0010 * Math.sin((2 * f - mPrime) * dr);
        c1 += 0.0005 * Math.sin((2 * mPrime + m) * dr);

        let deltaT: number;

        if (t < -11) {
            deltaT =
                0.001 +
                0.000839 * t +
                0.0002261 * t2 -
                0.00000845 * t3 -
                0.000000081 * t * t3;
        } else {
            deltaT =
                -0.000278 +
                0.000265 * t +
                0.000262 * t2;
        }

        const jdNew = jd1 + c1 - deltaT;

        return Math.floor(jdNew + 0.5 + timeZone / 24);
    }

    // Xác định tháng 11 âm lịch để tính năm âm lịch.
    private getLunarMonth11(year: number, timeZone: number): number {
        const off = this.jdFromDate(31, 12, year) - 2415021;
        const k = Math.floor(off / 29.530588853);
        let nm = this.getNewMoonDay(k, timeZone);
        const sunLong = this.getSunLongitude(nm, timeZone);

        if (sunLong >= 9) {
            nm = this.getNewMoonDay(k - 1, timeZone);
        }

        return nm;
    }

    // Tính vị trí Mặt Trời để xác định tháng nhuận.
    private getSunLongitude(dayNumber: number, timeZone: number): number {
        const t = (dayNumber - 2451545.5 - timeZone / 24) / 36525;
        const t2 = t * t;
        const dr = Math.PI / 180;

        const m = 357.52910 + 35999.05030 * t - 0.0001559 * t2;
        const l0 = 280.46645 + 36000.76983 * t + 0.0003032 * t2;

        let deltaL =
            (1.914600 - 0.004817 * t - 0.000014 * t2) *
                Math.sin(dr * m) +
            (0.019993 - 0.000101 * t) * Math.sin(2 * dr * m) +
            0.000290 * Math.sin(3 * dr * m);

        let longitude = (l0 + deltaL) * dr;
        longitude -= Math.PI * 2 * Math.floor(longitude / (Math.PI * 2));

        return Math.floor((longitude / Math.PI) * 6);
    }

    // Tìm tháng nhuận trong năm âm lịch.
    private getLeapMonthOffset(
        a11: number,
        timeZone: number,
    ): number {
        const k = Math.floor((a11 - 2415021.076998695) / 29.530588853);
        let last = 0;
        let i = 1;
        let arc = this.getSunLongitude(
            this.getNewMoonDay(k + i, timeZone),
            timeZone,
        );

        do {
            last = arc;
            i++;
            arc = this.getSunLongitude(
                this.getNewMoonDay(k + i, timeZone),
                timeZone,
            );
        } while (arc !== last && i < 14);

        return i - 1;
    }
}
