import { Body, Controller, Get, Post } from '@nestjs/common';
import { RouteService } from './route.service';
import { CreateRouteDto } from './dto/create-route.dto';

@Controller('routes')
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  @Get()
  findAll() {
    return this.routeService.findAll();
  }

  @Post()
  create(@Body() data: CreateRouteDto) {
    return this.routeService.create(data);
  }
}