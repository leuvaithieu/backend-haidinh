import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import {Prisma} from '@prisma/client'

@Injectable()
export class CustomerService {
    constructor(private prisma:PrismaService){}
    async findAll() {
        return this.prisma.customer.findMany({
            where: {
                deletedAt: null,
            },
        });
    }

    async create(data: CreateCustomerDto){
        try{
            return await this.prisma.customer.create({
                data,
            });
        }catch (error) {
            if(error instanceof Prisma.PrismaClientKnownRequestError){
                if(error.code === 'P2002'){
                    throw new ConflictException('Số điện thoại đã tồn tại')
                }
            }
            throw error;
        }
    }

    async update(id:string , data:UpdateCustomerDto){
        return this.prisma.customer.update({
            where:{
                id,
            },
            data,
        })
    };

    async remove(id:string){
        return this.prisma.customer.update({
            where:{
                id,
            },
            data:{
                deletedAt:new Date(),
            }
        })
    }
}
