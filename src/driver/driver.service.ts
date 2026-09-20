import { Injectable , ConflictException} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dtp';
import { error } from 'node:console';

@Injectable()
export class DriverService {
    constructor(private prisma:PrismaService){}

    async findAll(){
        return this.prisma.driver.findMany({
            orderBy:{
                createdAt:'desc',
            },
        })
    }

    async findOne(id:string){
        return this.prisma.driver.findUnique({
            where:{
                id,
            },
        });
    };

    async create(data:CreateDriverDto){
        try{
            return await this.prisma.driver.create({
                data:{
                    name: data.name,
                    phone: data.phone,
                    licenseNumber: data.licenseNumber,
                    licenseClass: data.licenseClass,
                    licenseExpiry: data.licenseExpiry
                    ? new Date(data.licenseExpiry)
                    : null,
                    status: data.status ?? 'ACTIVE',
                },
            });
        }
        catch(error){
            if(
                error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
            ){
                throw new ConflictException('Số điện thoại hoặc GPLX đã tồn tại')
            }
            throw error;
        }
    };
    async update(id:string, data:UpdateDriverDto){
        try{
            return await this.prisma.driver.update({
                where:{
                    id,
                },
                data:{
                    ...(data.name !== undefined && {
                    name: data.name,
                    }),

                    ...(data.phone !== undefined && {
                    phone: data.phone,
                    }),

                    ...(data.licenseNumber !== undefined && {
                    licenseNumber: data.licenseNumber,
                    }),

                    ...(data.licenseClass !== undefined && {
                    licenseClass: data.licenseClass,
                    }),

                    ...(data.licenseExpiry !== undefined && {
                    licenseExpiry: data.licenseExpiry
                        ? new Date(data.licenseExpiry)
                        : null,
                    }),

                    ...(data.status !== undefined && {
                    status: data.status,
                    }),
                },
            });
        }catch(error){
            if(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"){
                throw new ConflictException('Số điện thoại hoặc số GPLX đã tồn tại')
            };
            throw error;
        };
    };

    async remove(id:string){
        return this.prisma.driver.delete({
            where:{
                id,
            }
        })
    }
}
