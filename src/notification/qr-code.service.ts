
import { BadRequestException, Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class QrCodeService {
  // Chuyển qrToken của vé thành ảnh QR PNG để đính kèm trong email.
  async generateQrCode(qrToken: string): Promise<Buffer> {
    if (!qrToken?.trim()) {
      throw new BadRequestException('Mã QR không hợp lệ.');
    }

    return QRCode.toBuffer(qrToken.trim(), {
      type: 'png',
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320,
    });
  }
}
