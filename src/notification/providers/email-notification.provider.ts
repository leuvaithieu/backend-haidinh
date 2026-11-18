
import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import * as nodemailer from 'nodemailer';

import {
  NotificationAttachment,
  NotificationProvider,
  NotificationSendResult,
} from '../interfaces/notification-provider.interface';

@Injectable()
export class EmailNotificationProvider implements NotificationProvider {
  readonly channel = NotificationChannel.EMAIL;

  private transporter?: nodemailer.Transporter;

  // Khởi tạo kết nối SMTP khi cần gửi Email.
  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;

    if (!host || !port || !user || !pass || !from) {
      throw new Error('Chưa cấu hình đầy đủ thông tin SMTP.');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user,
        pass,
      },
    });

    return this.transporter;
  }

  // Chuyển các ký tự đặc biệt thành HTML entity để tránh lỗi hiển thị nội dung.
  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };

      return entities[character];
    });
  }

  // Tạo phần HTML hiển thị mã QR của từng vé trong email.
  private buildQrHtml(attachments: NotificationAttachment[]): string {
    const qrAttachments = attachments.filter(
      (attachment) => Boolean(attachment.cid),
    );

    if (qrAttachments.length === 0) {
      return '';
    }

    const qrItems = qrAttachments
      .map(
        (attachment, index) => `
          <div style="
            margin: 20px 0;
            padding: 20px;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            text-align: center;
            background-color: #ffffff;
          ">
            <p style="
              margin: 0 0 12px;
              color: #333333;
              font-size: 15px;
              font-weight: bold;
            ">
              Mã QR vé ${index + 1}
            </p>

            <img
              src="cid:${this.escapeHtml(attachment.cid!)}"
              alt="Mã QR vé Hải Định"
              width="220"
              style="
                display: block;
                width: 220px;
                max-width: 100%;
                height: auto;
                margin: 0 auto;
              "
            />

            <p style="
              margin: 12px 0 0;
              color: #666666;
              font-size: 13px;
            ">
              ${this.escapeHtml(attachment.filename)}
            </p>
          </div>
        `,
      )
      .join('');

    return `
      <div style="margin-top: 25px;">
        <h3 style="
          color: #b91c1c;
          font-size: 18px;
          margin-bottom: 15px;
        ">
          MÃ QR LÊN XE
        </h3>

        <p style="color: #555555; font-size: 14px;">
          Vui lòng xuất trình mã QR dưới đây cho nhân viên khi lên xe.
        </p>

        ${qrItems}
      </div>
    `;
  }

  // Tạo giao diện HTML cho email thông báo của Hải Định.
  private buildHtml(
    content: string,
    attachments: NotificationAttachment[] = [],
  ): string {
    const messageHtml = this.escapeHtml(content).replace(
      /\r?\n/g,
      '<br>',
    );

    const qrHtml = this.buildQrHtml(attachments);

    return `
      <!DOCTYPE html>
      <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Thông báo từ Hải Định</title>
        </head>

        <body style="
          margin: 0;
          padding: 20px;
          background-color: #f3f4f6;
          font-family: Arial, Helvetica, sans-serif;
        ">
          <div style="
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #e5e7eb;
          ">
            <div style="
              padding: 25px 20px;
              background-color: #b91c1c;
              text-align: center;
            ">
              <h1 style="
                margin: 0;
                color: #ffffff;
                font-size: 26px;
                letter-spacing: 1px;
              ">
                HẢI ĐỊNH
              </h1>

              <p style="
                margin: 8px 0 0;
                color: #ffffff;
                font-size: 13px;
              ">
                Đồng hành cùng mọi hành trình
              </p>
            </div>

            <div style="
              padding: 25px 22px;
              color: #333333;
              font-size: 15px;
              line-height: 1.8;
            ">
              <div style="
                white-space: normal;
                overflow-wrap: break-word;
              ">
                ${messageHtml}
              </div>

              ${qrHtml}
            </div>

            <div style="
              padding: 20px;
              background-color: #f9fafb;
              border-top: 1px solid #e5e7eb;
              text-align: center;
            ">
              <p style="
                margin: 0 0 8px;
                color: #b91c1c;
                font-size: 15px;
                font-weight: bold;
              ">
                CÔNG TY TNHH HẢI ĐỊNH
              </p>

              <p style="
                margin: 0;
                color: #666666;
                font-size: 12px;
                line-height: 1.6;
              ">
                Cảm ơn quý khách đã sử dụng dịch vụ của chúng tôi.
                <br>
                Vui lòng liên hệ Hải Định nếu cần hỗ trợ.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // Gửi Email kèm ảnh QR và trả về mã xác nhận từ máy chủ SMTP.
  async send(data: {
    recipient: string;
    subject?: string;
    content: string;
    attachments?: NotificationAttachment[];
  }): Promise<NotificationSendResult> {
    const transporter = this.getTransporter();

    const attachments = data.attachments ?? [];

    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: data.recipient,
      subject: data.subject || 'Thông báo từ Hải Định',
      text: data.content,
      html: this.buildHtml(data.content, attachments),
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType || 'image/png',
        ...(attachment.cid
          ? {
              cid: attachment.cid,
              contentDisposition: 'inline' as const,
            }
          : {}),
      })),
    });

    return {
      success: (result.accepted?.length ?? 0) > 0 && (result.rejected?.length ?? 0) === 0,
      providerMessageId: result.messageId,
    };
  }
}
