
import {
  Injectable,
  NotFoundException,
  Inject,
  Optional,
} from '@nestjs/common';

import { NotificationChannel } from '@prisma/client';

import { NotificationProvider } from './interfaces/notification-provider.interface';

export const NOTIFICATION_PROVIDERS = 'NOTIFICATION_PROVIDERS';
@Injectable()
export class NotificationProviderRegistry {
  private readonly providers = new Map<
    NotificationChannel,
    NotificationProvider
  >();

  constructor(
    @Optional()
    @Inject(NOTIFICATION_PROVIDERS)
    providers: NotificationProvider[] = [],
    ) {
        // Đăng ký các nhà cung cấp theo kênh gửi tương ứng.
        for (const provider of providers) {
            this.providers.set(provider.channel, provider);
        }
    }

  // Lấy nhà cung cấp phù hợp với kênh thông báo.
  getProvider(channel: NotificationChannel): NotificationProvider {
    const provider = this.providers.get(channel);

    if (!provider) {
      throw new NotFoundException(
        `Chưa cấu hình nhà cung cấp cho kênh ${channel}`,
      );
    }

    return provider;
  }

  // Kiểm tra một kênh gửi đã có nhà cung cấp hay chưa.
  hasProvider(channel: NotificationChannel): boolean {
    return this.providers.has(channel);
  }
}
