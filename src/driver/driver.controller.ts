import { Controller, Get, Post, Patch, Delete, Param, Body , UseGuards} from '@nestjs/common';
import { DriverService } from './driver.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('drivers')
export class DriverController {
    constructor(private readonly driverService: DriverService){}

    @Get()
    @Roles('ADMIN','STAFF')
    findAll(){
        return this.driverService.findAll();
    }

    @Get(':id')
    @Roles('ADMIN','STAFF')
    findOne(@Param('id') id:string){
        return this.driverService.findOne(id);
    }

    @Post()
    @Roles('ADMIN','STAFF')
    create(@Body() data:CreateDriverDto){
        return this.driverService.create(data);
    }

    @Patch(':id')
    @Roles('ADMIN','STAFF')
    update(
        @Param('id') id:string,
        @Body() data:UpdateDriverDto
    ){
        return this.driverService.update(id, data);
    };

    @Delete(':id')
    @Roles('ADMIN')
    remove(@Param('id') id:string){
        return this.driverService.remove(id)
    }
}
