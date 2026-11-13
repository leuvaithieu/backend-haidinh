
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';

import { PublicPricingController } from './public-pricing.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PricingController, PublicPricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
