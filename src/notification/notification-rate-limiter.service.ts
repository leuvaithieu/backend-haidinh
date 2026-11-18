
import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';

@Injectable()
export class NotificationRateLimiterService {
  // Khoảng cách tối thiểu giữa hai lần bắt đầu gửi trên từng kênh (ms).
  private readonly minimumIntervals: Record<NotificationChannel, number> = {
    SMS: 1000,
    ZALO: 1000,
    EMAIL: 1000,
  };

  private readonly lastStartedAt = new Map<
    NotificationChannel,
    number
  >();

  private readonly queues = new Map<
    NotificationChannel,
    Promise<void>
  >();

  // Đảm bảo các request cùng kênh được bắt đầu theo khoảng cách quy định.
  async waitForSlot(channel: NotificationChannel): Promise<void> {
    const previous =
      this.queues.get(channel) ?? Promise.resolve();

    let release!: () => void;

    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.queues.set(
      channel,
      previous.then(() => current),
    );

    await previous;

    try {
      const minimumInterval =
        this.minimumIntervals[channel];

      const lastStarted =
        this.lastStartedAt.get(channel) ?? 0;

      const waitTime = Math.max(
        0,
        lastStarted + minimumInterval - Date.now(),
      );

      if (waitTime > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, waitTime);
        });
      }

      this.lastStartedAt.set(channel, Date.now());
    } finally {
      release();
    }
  }
}
