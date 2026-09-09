import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CustomerModule } from './customer/customer.module';
import { RouteModule } from './route/route.module';
import { RoutePointModule } from './route-point/route-point.module';
import { ServicePointModule } from './service-point/service-point.module';

@Module({
  imports: [PrismaModule, CustomerModule, RouteModule,RoutePointModule ,ServicePointModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}