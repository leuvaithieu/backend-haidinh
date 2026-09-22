import { Body, Controller, Get, Post ,Delete,Param,Patch, UseGuards} from "@nestjs/common";
import { RoutePointService } from "./route-point.service";
import { CreateRoutePointDto } from "./dto/create-route-point.dto";
import { UpdateRoutePointDto } from "./dto/update-route-point.dto";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { RolesGuard } from "src/auth/roles.guard";
import { Roles } from "src/auth/roles.decorator";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('route-points')
export class RoutePointController{
    constructor(private readonly routePointService : RoutePointService,){}

    @Get()
    @Roles('ADMIN','STAFF')
    findAll(){
        return this.routePointService.findAll();
    }

    @Post()
    @Roles('ADMIN','STAFF')
    create(@Body() data: CreateRoutePointDto){
        return this.routePointService.create(data);
    }

    @Patch(':id')
    @Roles('ADMIN','STAFF')
    update(
        @Param('id') id:string,
        @Body() data: UpdateRoutePointDto,
    ){
        return this.routePointService.update(id,data)
    }

    @Delete(':id')
    @Roles('ADMIN')
    remove(@Param('id') id:string){
        return this.routePointService.remove(id)
    }
}