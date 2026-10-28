import {
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

import * as bcrypt from 'bcryptjs'

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      omit:{
        password:true,
      }
    });
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: {
        id,
      },
      omit:{
        password:true,
      }
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: {
        username,
      },
    });
  }

  async create(data: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(data.password, 10)
    try {
      return await this.prisma.user.create({
        data: {
          username: data.username,
          password: hashedPassword,
          name: data.name,
          phone: data.phone,
          role: data.role ?? 'STAFF',
          status: data.status ?? 'ACTIVE',
        },
        omit:{
          password:true,
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Tên đăng nhập hoặc số điện thoại đã tồn tại',
        );
      }

      throw error;
    }
  }

  async update(id: string, data: UpdateUserDto) {
    const updateData:any={
      username:data.username,
      name:data.name,
      phone:data.phone,
      role:data.role,
      status:data.status,
    }
    if(data.password){
      updateData.password = await bcrypt.hash(data.password, 10);
    }
    try {
      return await this.prisma.user.update({
        where: {
            id,
        },
        data:updateData,
        omit:{
          password:true,
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Tên đăng nhập hoặc số điện thoại đã tồn tại',
        );
      }

      throw error;
    }
  }

  async remove(id: string) {
    return this.prisma.user.delete({
      where: {
        id,
      },
      omit:{
        password:true,
      }
    });
  }
}