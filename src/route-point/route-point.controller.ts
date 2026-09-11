import { Body, Controller, Get, Post ,Delete,Param,Patch} from "@nestjs/common";
import { RoutePointService } from "./route-point.service";
import { CreateRoutePointDto } from "./dto/create-route-point.dto";
import { UpdateRoutePointDto } from "./dto/update-route-point.dto";

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

    @Patch(':id')
    update(
        @Param('id') id:string,
        @Body() data: UpdateRoutePointDto,
    ){
        return this.routePointService.update(id,data)
    }

    @Delete(':id')
    remove(@Param('id') id:string){
        return this.routePointService.remove(id)
    }
}