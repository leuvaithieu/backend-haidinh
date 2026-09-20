import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Post()
  create(@Body() data: CreateUserDto) {
    return this.userService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() data: UpdateUserDto,
  ) {
    return this.userService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}