import { Module } from '@nestjs/common';
import { TripService } from './trip.service';
import { TripController } from './trip.controller';

import { PublicTripController } from './public-trip.controller';

@Module({
  providers: [TripService],
  controllers: [TripController, PublicTripController]
})
export class TripModule {}
