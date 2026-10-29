import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CustomerModule } from './customer/customer.module';
import { RouteModule } from './route/route.module';
import { RoutePointModule } from './route-point/route-point.module';
import { ServicePointModule } from './service-point/service-point.module';
import { VehicleModule } from './vehicle/vehicle.module';
import { DriverModule } from './driver/driver.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { AssistantModule } from './assistant/assistant.module';
import { TripModule } from './trip/trip.module';
import { RouteSegmentModule } from './route-segment/route-segment.module';
import { ArticleModule } from './article/article.module';
import { PublicArticleModule } from './public-article/public-article.module';
import { UploadModule } from './upload/upload.module';
import { SeatLayoutModule } from './seat-layout/seat-layout.module';
import { BookingModule } from './booking/booking.module';


@Module({
  imports: [ScheduleModule.forRoot(),PrismaModule, CustomerModule, RouteModule,RoutePointModule ,ServicePointModule, VehicleModule, DriverModule, UserModule, AuthModule, AssistantModule, TripModule, RouteSegmentModule, ArticleModule, PublicArticleModule, UploadModule, SeatLayoutModule, BookingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}