import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateServicePointDto } from "./dto/create-service-point.dto";

@Injectable()
export class ServicePointService{
    constructor(private prisma:PrismaService){}
    async findAll(){
        return this.prisma.servicePoint.findMany({
            orderBy:{
                name: 'asc'
            },
        });
    };

    async create(data:CreateServicePointDto){
        return this.prisma.servicePoint.create({
            data,
        })
    }

    async remove(id:string){
        return this.prisma.servicePoint.delete({
            where:{
                id
            }
        })
    }
}