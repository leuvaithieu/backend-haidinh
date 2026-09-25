import { Controller, Get, UseGuards, Param, Post, Body, Patch, Delete } from '@nestjs/common';
import { CreateTripDto } from './dto/create-trip.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { TripService } from './trip.service';
import { Roles } from 'src/auth/roles.decorator';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { UpdateTripDto } from './dto/update-trip.dto';

@UseGuards(JwtAuthGuard,RolesGuard)
@Controller('trips')
export class TripController {
    constructor(private readonly tripService: TripService){}

    @Get()
    @Roles('ADMIN','STAFF')
    findAll(){
        return this.tripService.findAll()
    }

    @Get(':id')
    @Roles('ADMIN','STAFF')
    findOne(@Param('id') id:string){
        return this.tripService.findOne(id)
    }

    @Post()
    @Roles('ADMIN','STAFF')
    create(@Body() data:CreateTripDto ,  @CurrentUser() user){
        return this.tripService.create(data, user.userId)
    }

    @Patch(':id')
    @Roles('ADMIN','STAFF')
    update(
        @Param('id') id:string,
        @Body() data:UpdateTripDto
    ){
        return this.tripService.update(id,data)
    }

    @Delete(':id')
    @Roles('ADMIN')
    remove(@Param('id') id:string){
        return this.tripService.remove(id)
    }
}
