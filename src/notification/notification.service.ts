
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  // Tạo thông báo xuất vé hoặc lấy thông báo đã tồn tại để tránh tạo trùng.
  async queueTicketIssuedNotification(data: {
    bookingId: string;
    channel: NotificationChannel;
    recipient: string;
    subject?: string;
    content: string;
  }) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: data.bookingId },
      select: { id: true },
    });

    if (!booking) {
      throw new NotFoundException('Không tìm thấy booking');
    }

    if (!data.recipient?.trim()) {
      throw new BadRequestException('Người nhận thông báo không hợp lệ');
    }

    if (!data.content?.trim()) {
      throw new BadRequestException('Nội dung thông báo không được để trống');
    }

    return this.prisma.notification.upsert({
      where: {
        bookingId_type_channel: {
          bookingId: data.bookingId,
          type: NotificationType.TICKET_ISSUED,
          channel: data.channel,
        },
      },
      create: {
        bookingId: data.bookingId,
        type: NotificationType.TICKET_ISSUED,
        channel: data.channel,
        recipient: data.recipient.trim(),
        subject: data.subject,
        content: data.content,
        status: NotificationStatus.PENDING,
      },
      update: {},
    });
  }

  // Lấy danh sách thông báo, hỗ trợ lọc theo trạng thái và kênh gửi.
  async findAll(params?: {
    status?: NotificationStatus;
    channel?: NotificationChannel;
    bookingId?: string;
  }) {
    return this.prisma.notification.findMany({
      where: {
        ...(params?.status && { status: params.status }),
        ...(params?.channel && { channel: params.channel }),
        ...(params?.bookingId && { bookingId: params.bookingId }),
      },
      include: {
        booking: {
          select: {
            id: true,
            bookingCode: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // Lấy chi tiết một thông báo theo ID.
  async findOne(id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      include: {
        booking: {
          select: {
            id: true,
            bookingCode: true,
          },
        },
      },
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    return notification;
  }

  // Đưa thông báo gửi thất bại về trạng thái chờ để có thể thử gửi lại.
  async retry(id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    if (notification.status !== NotificationStatus.FAILED) {
      throw new BadRequestException(
        'Chỉ có thể gửi lại thông báo ở trạng thái FAILED',
      );
    }

    await this.prisma.notification.updateMany({
      where: {
        id,
        status: NotificationStatus.FAILED,
      },
      data: {
        status: NotificationStatus.PENDING,
        nextRetryAt: new Date(),
        lastError: null,
      },
    });

    return this.findOne(id);
  }
}
