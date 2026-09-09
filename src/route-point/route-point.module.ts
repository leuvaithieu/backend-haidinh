import { Module } from "@nestjs/common";
import { RoutePointController } from "./route-point.controller";
import { RoutePointService } from "./route-point.service";

@Module({
    controllers:[RoutePointController],
    providers:[RoutePointService],
})

export class RoutePointModule{}