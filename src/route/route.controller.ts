
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { RouteService } from './route.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRoute } from './dto/update-route.dto';
import { CreateRouteWebsiteContentDto } from './dto/create-route-website-content.dto';
import { UpdateRouteWebsiteContentDto } from './dto/update-route-website-content.dto';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('routes')
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  // API công khai: khách truy cập được các tuyến đã xuất bản
  @Get('website/published')
  findPublishedWebsiteRoutes() {
    return this.routeService.findPublishedWebsiteRoutes();
  }

  // Danh sách tuyến phục vụ quản trị
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  findAll() {
    return this.routeService.findAll();
  }

  // Tạo tuyến vận hành
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  create(@Body() data: CreateRouteDto) {
    return this.routeService.create(data);
  }

  // Cập nhật tuyến vận hành
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  update(
    @Param('id') id: string,
    @Body() data: UpdateRoute,
  ) {
    return this.routeService.update(id, data);
  }

  // Xóa tuyến vận hành
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.routeService.remove(id);
  }

  // Tạo nội dung website
  @Post(':id/website-content')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createWebsiteContent(
    @Param('id') id: string,
    @Body() data: CreateRouteWebsiteContentDto,
  ) {
    return this.routeService.createWebsiteContent(id, data);
  }

  // Cập nhật nội dung website
  @Patch(':id/website-content')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateWebsiteContent(
    @Param('id') id: string,
    @Body() data: UpdateRouteWebsiteContentDto,
  ) {
    return this.routeService.updateWebsiteContent(id, data);
  }
}
