import { Module } from "@nestjs/common";
import { ServicePointService } from "./service-point.service";
import { ServicePointController } from "./service-point.controller";

@Module({
    controllers: [ServicePointController],
    providers: [ServicePointService],
})

export class ServicePointModule{}