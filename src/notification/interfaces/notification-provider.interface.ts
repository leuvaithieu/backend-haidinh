
import { NotificationChannel } from '@prisma/client';

// Kết quả trả về sau khi nhà cung cấp tiếp nhận yêu cầu gửi thông báo.
export interface NotificationSendResult {
  success: boolean;
  providerMessageId?: string;
}

// Thông tin tệp đính kèm khi gửi thông báo.
export interface NotificationAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  cid?: string;
}

// Giao diện chung để các nhà cung cấp SMS, Zalo và Email triển khai.
export interface NotificationProvider {
  readonly channel: NotificationChannel;

  // Gửi nội dung thông báo cùng các tệp đính kèm nếu có.
  send(data: {
    recipient: string;
    subject?: string;
    content: string;
    attachments?: NotificationAttachment[];
  }): Promise<NotificationSendResult>;
}
