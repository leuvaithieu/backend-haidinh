import { Module } from '@nestjs/common';
import { RouteSegmentService } from './route-segment.service';
import { RouteSegmentController } from './route-segment.controller';

@Module({
  providers: [RouteSegmentService],
  controllers: [RouteSegmentController]
})
export class RouteSegmentModule {}
