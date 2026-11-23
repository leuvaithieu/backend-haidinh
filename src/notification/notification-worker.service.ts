
import { Injectable, Logger } from '@nestjs/common';

import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';

import { Interval } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationProviderRegistry } from './notification-provider.registry';
import { NotificationRateLimiterService } from './notification-rate-limiter.service';
import { TicketPdfService } from '../ticket/ticket-pdf.service';

@Injectable()
export class NotificationWorkerService {
  private readonly logger = new Logger(NotificationWorkerService.name);

  private readonly maxAttempts = 5;
  private readonly batchSize = 5;

  private isPolling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: NotificationProviderRegistry,
    private readonly rateLimiter: NotificationRateLimiterService,
    private readonly ticketPdfService: TicketPdfService,
    ) {}

  // Khôi phục thông báo bị kẹt ở PROCESSING quá 15 phút.
  @Interval(60_000)
  async recoverStuckNotifications() {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    const now = new Date();

    // Chuyển thông báo đã hết số lần thử sang FAILED.
    const failedNotifications =
      await this.prisma.notification.updateMany({
        where: {
          status: NotificationStatus.PROCESSING,
          attemptCount: {
            gte: this.maxAttempts,
          },
          lastAttemptAt: {
            lte: staleBefore,
          },
        },
        data: {
          status: NotificationStatus.FAILED,
          lastError:
            'Thông báo bị gián đoạn khi xử lý và đã hết số lần thử.',
          nextRetryAt: null,
        },
      });

    // Đưa thông báo còn lượt thử về PENDING để Worker xử lý lại.
    const pendingNotifications =
      await this.prisma.notification.updateMany({
        where: {
          status: NotificationStatus.PROCESSING,
          attemptCount: {
            lt: this.maxAttempts,
          },
          lastAttemptAt: {
            lte: staleBefore,
          },
        },
        data: {
          status: NotificationStatus.PENDING,
          lastError:
            'Thông báo bị gián đoạn khi xử lý. Hệ thống đang thử lại.',
          nextRetryAt: now,
        },
      });

    if (
      failedNotifications.count > 0 ||
      pendingNotifications.count > 0
    ) {
      this.logger.warn(
        `Phục hồi ${pendingNotifications.count} thông báo về PENDING, ` +
          `${failedNotifications.count} thông báo chuyển sang FAILED.`,
      );
    }
  }

  // Tự động quét và xử lý tối đa 20 thông báo mỗi lượt, giới hạn 5 thông báo đồng thời.
  @Interval(10_000)
  async processPendingNotifications() {
    // Không cho phép hai lượt quét chạy chồng chéo trong cùng tiến trình.
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      const notifications = await this.prisma.notification.findMany({
        where: {
          status: NotificationStatus.PENDING,
          OR: [
            { nextRetryAt: null },
            { nextRetryAt: { lte: new Date() } },
          ],
        },
        select: {
          id: true,
          channel: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 20,
      });

      // Chỉ xử lý những kênh đã đăng ký nhà cung cấp.
      const availableNotifications = notifications.filter(
        (notification) =>
          this.providerRegistry.hasProvider(notification.channel),
      );

      // Chia thông báo thành từng nhóm để giới hạn số lượng xử lý đồng thời.
      for (
        let i = 0;
        i < availableNotifications.length;
        i += this.batchSize
      ) {
        const batch = availableNotifications.slice(
          i,
          i + this.batchSize,
        );

        await Promise.allSettled(
          batch.map((notification) =>
            this.processNotification(notification.id),
          ),
        );
      }
    } catch (error) {
      this.logger.error(
        'Lỗi khi quét hàng đợi thông báo.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      // Luôn mở khóa để lượt quét tiếp theo có thể hoạt động.
      this.isPolling = false;
    }
  }

  // Xử lý gửi một thông báo theo ID, đảm bảo không gửi đồng thời cùng một thông báo.
  async processNotification(notificationId: string) {
    let notificationAttemptCount = 0;

    // Lấy thông tin thông báo trước khi nhận xử lý.
    const existingNotification =
      await this.prisma.notification.findUnique({
        where: { id: notificationId },
        select: {
          id: true,
          channel: true,
        },
      });

    if (!existingNotification) {
      return {
        success: false,
        message: 'Không tìm thấy thông báo.',
      };
    }

    // Không xử lý nếu kênh gửi chưa có nhà cung cấp.
    if (!this.providerRegistry.hasProvider(existingNotification.channel)) {
      return {
        success: false,
        message: `Chưa cấu hình nhà cung cấp cho kênh ${existingNotification.channel}.`,
      };
    }

    const now = new Date();

    // Chỉ một tiến trình được phép chuyển PENDING sang PROCESSING.
    const claimed = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        status: NotificationStatus.PENDING,
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: now } },
        ],
      },
      data: {
        status: NotificationStatus.PROCESSING,
        attemptCount: {
          increment: 1,
        },
        lastAttemptAt: now,
      },
    });

    if (claimed.count !== 1) {
      return {
        success: false,
        message: 'Thông báo đã được xử lý hoặc chưa đến thời gian gửi.',
      };
    }

    // Ghi nhận lượt thử vừa được claim để xử lý đúng nếu truy vấn sau đó lỗi.
    notificationAttemptCount = 1;

    try {
      // Lấy thông báo cùng booking và danh sách vé sau khi đã nhận quyền xử lý.
      const notification = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        include: {
          booking: {
            include: {
              seats: {
                include: {
                  ticket: {
                    select: {
                      id: true,
                      ticketCode: true,
                      qrToken: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!notification) {
        throw new Error('Không tìm thấy thông báo sau khi nhận xử lý.');
      }

      notificationAttemptCount = notification.attemptCount;

      // Chọn nhà cung cấp theo kênh gửi.
      const provider = this.providerRegistry.getProvider(
        notification.channel,
      );

      // Chờ đến lượt gửi theo giới hạn tốc độ của từng kênh.
      await this.rateLimiter.waitForSlot(notification.channel);

            // Tạo một PDF nhiều trang khi gửi email thông báo xuất vé.
        const attachments =
            notification.channel === NotificationChannel.EMAIL &&
            notification.type === NotificationType.TICKET_ISSUED
                ? [
                    {
                    filename: `${notification.booking.bookingCode}-ve-dien-tu.pdf`,
                    content: await this.ticketPdfService.generateBookingPdf(
                        notification.booking.id,
                    ),
                    contentType: 'application/pdf',
                    },
                ]
                : []
            ;

      // Gửi thông báo qua nhà cung cấp tương ứng.
      const result = await provider.send({
        recipient: notification.recipient,
        subject: notification.subject ?? undefined,
        content: notification.content,
        attachments,
      });

      if (!result.success) {
        throw new Error(
          'Nhà cung cấp không xác nhận gửi thông báo thành công.',
        );
      }

      // Chỉ chuyển sang SENT khi nhà cung cấp xác nhận gửi thành công.
      const updated = await this.prisma.notification.updateMany({
        where: {
          id: notificationId,
          status: NotificationStatus.PROCESSING,
        },
        data: {
          status: NotificationStatus.SENT,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          nextRetryAt: null,
          lastError: null,
        },
      });

      if (updated.count !== 1) {
        throw new Error(
          'Không thể cập nhật trạng thái thông báo sau khi gửi.',
        );
      }

      return {
        success: true,
        message: 'Nhà cung cấp đã xác nhận tiếp nhận thông báo.',
        notificationId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Lỗi không xác định khi gửi thông báo.';

      this.logger.error(
        `Gửi thông báo ${notificationId} thất bại: ${errorMessage}`,
      );

      // Tính thời gian chờ tăng dần giữa các lần thử gửi.
      const shouldRetry =
        notificationAttemptCount < this.maxAttempts;

      const retryDelayMinutes = Math.min(
        2 ** notificationAttemptCount,
        60,
      );

      const nextRetryAt = shouldRetry
        ? new Date(Date.now() + retryDelayMinutes * 60 * 1000)
        : null;

      // Tự động thử lại hoặc chuyển FAILED khi đã hết số lần thử.
      await this.prisma.notification.updateMany({
        where: {
          id: notificationId,
          status: NotificationStatus.PROCESSING,
        },
        data: {
          status: shouldRetry
            ? NotificationStatus.PENDING
            : NotificationStatus.FAILED,
          lastError: errorMessage,
          nextRetryAt,
        },
      });

      return {
        success: false,
        message: shouldRetry
          ? 'Gửi thất bại, thông báo đã được lên lịch thử lại.'
          : 'Gửi thất bại và đã vượt quá số lần thử tối đa.',
        notificationId,
        attemptCount: notificationAttemptCount,
        nextRetryAt,
        error: errorMessage,
      };
    }
  }
}
