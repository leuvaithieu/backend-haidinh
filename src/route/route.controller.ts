import { Body, Controller, Get, Post, UseGuards,Patch,Delete ,Param} from '@nestjs/common';
import { RouteService } from './route.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { UpdateRoute } from './dto/update-route.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('routes')
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  @Get()
  @Roles('ADMIN','STAFF')
  findAll() {
    return this.routeService.findAll();
  }

  @Post()
  @Roles('ADMIN','STAFF')
  create(@Body() data: CreateRouteDto) {
    return this.routeService.create(data);
  }

  @Patch(':id')
  @Roles('ADMIN','STAFF')
  update(
    @Param('id') id:string,
    @Body() data:UpdateRoute
  ){
    return this.routeService.update(id, data)
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id:string){
    return this.routeService.remove('id')
  }
}