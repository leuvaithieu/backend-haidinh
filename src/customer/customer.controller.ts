import { Body , Controller, Get, Post,Patch, Delete ,Param } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
export class CustomerController {
    constructor(private readonly customerService:CustomerService){}

    @Get()
    findAll(){
        return this.customerService.findAll();
    }

    @Post()
    create(@Body() data:CreateCustomerDto){
        return this.customerService.create(data);
    }

    @Patch(':id')
    update(
        @Param('id') id:string,
        @Body() data:CreateCustomerDto,
    ){
        return this.customerService.update(id,data)
    }

    @Delete(':id')
    remove(@Param('id') id:string){
        return this.customerService.remove(id);
    }
}
