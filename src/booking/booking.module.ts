
import { Module } from '@nestjs/common';

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
    ],
    controllers: [BookingController],
    providers: [BookingService],
    exports: [BookingService],
})
export class BookingModule {}
