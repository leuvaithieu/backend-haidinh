
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SeatLayoutController } from './seat-layout.controller';
import { SeatLayoutService } from './seat-layout.service';

@Module({
  imports: [PrismaModule],
  controllers: [SeatLayoutController],
  providers: [SeatLayoutService],
  exports: [SeatLayoutService],
})
export class SeatLayoutModule {}
