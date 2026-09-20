import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { DriverService } from './driver.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dtp';

@Controller('drivers')
export class DriverController {
    constructor(private readonly driverService: DriverService){}

    @Get()
    findAll(){
        return this.driverService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id:string){
        return this.driverService.findOne(id);
    }

    @Post()
    create(@Body() data:CreateDriverDto){
        return this.driverService.create(data);
    }

    @Patch(':id')
    update(
        @Param('id') id:string,
        @Body() data:UpdateDriverDto
    ){
        return this.driverService.update(id, data);
    };

    @Delete(':id')
    remove(@Param('id') id:string){
        return this.driverService.remove(id)
    }
}
