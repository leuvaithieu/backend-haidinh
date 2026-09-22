import { Body,Controller, Get, Post,Delete,Param, UseGuards } from "@nestjs/common";
import { ServicePointService } from "./service-point.service";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { RolesGuard } from "src/auth/roles.guard";
import { Roles } from "src/auth/roles.decorator";

@UseGuards(JwtAuthGuard,RolesGuard)
@Controller('service-points')
export class ServicePointController{
    constructor(
        private readonly servicePointService : ServicePointService,
    ){}

    @Get()
    @Roles('ADMIN','STAFF')
    findAll(){
        return this.servicePointService.findAll()
    }

    @Post()
    @Roles('ADMIN','STAFF')
    create(@Body() data: CreateServicePointDto){
        return this.servicePointService.create(data);
    }

    @Delete(':id')
    @Roles('ADMIN')
    remove(@Param('id') id:string){
        return this.servicePointService.remove(id);
    }
}
