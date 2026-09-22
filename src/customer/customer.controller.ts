import { Body , Controller, Get, Post,Patch, Delete ,Param, UseGuards } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomerController {
    constructor(private readonly customerService:CustomerService){}

    @Get()
    @Roles('ADMIN','STAFF')
    findAll(){
        return this.customerService.findAll();
    }

    @Post()
    @Roles('ADMIN', 'STAFF')
    create(@Body() data:CreateCustomerDto){
        return this.customerService.create(data);
    }

    @Patch(':id')
    @Roles('ADMIN','STAFF')
    update(
        @Param('id') id:string,
        @Body() data:CreateCustomerDto,
    ){
        return this.customerService.update(id,data)
    }

    @Delete(':id')
    @Roles('ADMIN')
    remove(@Param('id') id:string){
        return this.customerService.remove(id);
    }
}
