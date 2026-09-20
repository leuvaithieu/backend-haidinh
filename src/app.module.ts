import { Module } from '@nestjs/common';
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

@Module({
  imports: [PrismaModule, CustomerModule, RouteModule,RoutePointModule ,ServicePointModule, VehicleModule, DriverModule, UserModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}