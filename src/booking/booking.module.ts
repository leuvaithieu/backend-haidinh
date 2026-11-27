
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
    imports: [
      PrismaModule,
      SettingsModule,
      PricingModule,
      ThrottlerModule.forRoot([
        {
            // Giới hạn 3 lần gọi trong 15 phút.
            ttl: 15 * 60 * 1000,
            limit: 3,
        },
      ]),
    ],
    controllers: [BookingController],
    providers: [BookingService],
    exports: [BookingService],
})
export class BookingModule {}
