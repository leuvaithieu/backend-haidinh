
import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { CreateRouteSegmentDto } from './dto/create-route-segment.dto';
import { UpdateRouteSegmentDto } from './dto/update-route-segment.dto';
import { RouteSegmentService } from './route-segment.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
@Controller('route-segments')
export class RouteSegmentController {
    constructor(
        private readonly routeSegmentService: RouteSegmentService,
    ) {}

    @Get()
    findAll(@Query('routeId') routeId?: string) {
        return this.routeSegmentService.findAll(routeId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.routeSegmentService.findOne(id);
    }

    @Post()
    create(@Body() data: CreateRouteSegmentDto) {
        return this.routeSegmentService.create(data);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() data: UpdateRouteSegmentDto,
    ) {
        return this.routeSegmentService.update(id, data);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.routeSegmentService.remove(id);
    }
}
