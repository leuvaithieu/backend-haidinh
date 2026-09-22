import { Controller, Get,Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';

import { AssistantService } from './assistant.service';
import { CreateAssistantDto } from './dto/create-assistant.dto';
import { UpdateAssistantDto } from './dto/update-assistant.dto';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assistants')
export class AssistantController {
    constructor(private readonly assistantService:AssistantService){}

    @Get()
    @Roles('ADMIN','STAFF')
    findAll(){
        return this.assistantService.findAll();
    }

    @Get(':id')
    @Roles('ADMIN','STAFF')
    findOne(@Param('id') id:string){
        return this.assistantService.findOne(id);
    }

    @Post()
    @Roles('ADMIN','STAFF')
    create(@Body() data:CreateAssistantDto){
        return this.assistantService.create(data);
    }

    @Patch(':id')
    @Roles('ADMIN','STAFF')
    update(
        @Param('id') id:string,
        @Body() data:UpdateAssistantDto
    ){
        return this.assistantService.update(id,data);
    }

    @Delete(':id')
    @Roles('ADMIN')
    remove(@Param('id') id:string){
        return this.assistantService.remove(id);
    }
}
