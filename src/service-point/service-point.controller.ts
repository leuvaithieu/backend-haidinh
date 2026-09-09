import { Body,Controller, Get, Post } from "@nestjs/common";
import { ServicePointService } from "./service-point.service";
import { CreateServicePointDto } from "./dto/create-service-point.dto";

@Controller('service-points')
export class ServicePointController{
    constructor(
        private readonly servicePointService : ServicePointService,
    ){}

    @Get()
    findAll(){
        return this.servicePointService.findAll()
    }

    @Post()
    create(@Body() data: CreateServicePointDto){
        return this.servicePointService.create(data);
    }
}
