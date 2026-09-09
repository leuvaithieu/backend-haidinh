import { Body, Controller, Get, Post } from "@nestjs/common";
import { RoutePointService } from "./route-point.service";
import { CreateRoutePointDto } from "./dto/create-route-point.dto";

@Controller('route-points')
export class RoutePointController{
    constructor(
        private readonly routePointService : RoutePointService,
    ){}

    @Get()
    findAll(){
        return this.routePointService.findAll();
    }

    @Post()
    create(@Body() data: CreateRoutePointDto){
        return this.routePointService.create(data);
    }
}