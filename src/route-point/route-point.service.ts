import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateRoutePointDto } from "./dto/create-route-point.dto";
import { UpdateRoutePointDto } from "./dto/update-route-point.dto";
import { Prisma } from "@prisma/client";

@Injectable()
export class RoutePointService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.routePoint.findMany({
            orderBy: {
                sequence: 'asc',
            },
            include: {
                servicePoints: true,
            }
        });
    }

    async create(data: CreateRoutePointDto) {
        try{
            return await this.prisma.routePoint.create({
                data,
            })
        }
        catch(error){
            if(
                error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
                
            ){
                throw new ConflictException('Sequence này đã tồn tại')
            }
            throw error;
        }
    }

    async update(id:string, data: UpdateRoutePointDto){
        try{
            return await this.prisma.routePoint.update({
                where:{
                    id,
                },
                data,
            })
        }catch(error){
            if(
                error instanceof Prisma.PrismaClientKnownRequestError && error.code ==='P2002'
            ){
                throw new ConflictException('Sequence này đã tồn tại')
            }

            throw error;
        }
    }

    async remove(id:string){
        await this.prisma.servicePoint.deleteMany({
            where:{
                routePointId:id,
            }
        })
        return this.prisma.routePoint.delete({
            where:{
                id,
            }
        })
    }
}