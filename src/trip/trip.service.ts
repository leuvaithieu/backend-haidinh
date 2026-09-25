import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';


@Injectable()
export class TripService {
    constructor(private prisma:PrismaService){}

    async findAll(){
        return this.prisma.trip.findMany({
            orderBy:{
                createdAt:'desc'
            },
            include:{
                route: true,
                vehicle: true,
                driver1: true,
                driver2: true,
                assistant1: true,
                assistant2: true,
                createdBy: {
                    select:{
                        id:true,
                        username:true,
                        name:true,
                        role:true,
                    }
                }
            }
        })
    }

    async findOne(id:string){
        return this.prisma.trip.findUnique({
            where:{
                id
            },
            include:{
                route: true,
                vehicle: true,
                driver1: true,
                driver2: true,
                assistant1: true,
                assistant2: true,
                createdBy: {
                    select:{
                        id:true,
                        username:true,
                        name:true,
                        role:true,
                    }
                }
            },
        })
    }

    async create(data:CreateTripDto , userId:string){
        if(data.driver1Id === data.driver2Id){
            throw new BadRequestException(
                'Hai lái xe không được trùng nhau !'
            )
        }

        if(data.assistant1Id === data.assistant2Id){
            throw new BadRequestException(
                'Hai phụ xe không được trùng nhau !'
            )
        }

        return await this.prisma.trip.create({
            data:{
                routeId: data.routeId,
                vehicleId: data.vehicleId,
                driver1Id:data.driver1Id,
                driver2Id:data.driver2Id,
                assistant1Id:data.assistant1Id,
                assistant2Id: data.assistant2Id ??  null,
                plannedDeparture : new Date(data.plannedDeparture),
                plannedArrival : data.plannedArrival ? new Date(data.plannedArrival) : null,
                createdById : userId
            }
        })
    }

    async update(id:string, data:UpdateTripDto){

        const currentTrip = await this.prisma.trip.findUnique({
            where:{
                id,
            },
        });

        if(!currentTrip){
            throw new BadRequestException(
                'Không tìm thấy chuyến xe !'
            );
        };

        const driver1Id = data.driver1Id ?? currentTrip.driver1Id;
        const driver2Id = data.driver2Id ?? currentTrip.driver2Id;

        const assistant1Id = data.assistant1Id ?? currentTrip.assistant1Id;
        const assistant2Id = data.assistant2Id ?? currentTrip.assistant2Id;

        if(driver1Id === driver2Id){
            throw new BadRequestException(
                'Hai lái xe không được trùng nhau !'
            )
        }

        if(assistant2Id && assistant1Id === assistant2Id){
            throw new BadRequestException(
                'Hai phụ xe không được trùng nhau !'
            )
        }
        return this.prisma.trip.update({
            where:{
                id,
            },
            data:{
                routeId:data.routeId,
                vehicleId:data.vehicleId,
                driver1Id:data.driver1Id,
                driver2Id:data.driver2Id,
                assistant1Id:data.assistant1Id,
                assistant2Id:data.assistant2Id ?? undefined,
                plannedDeparture : data.plannedDeparture ? new Date(data.plannedDeparture) : undefined,
                plannedArrival : data.plannedArrival ? new Date(data.plannedArrival) : undefined,

            }
        })
    }

    async remove(id:string){
        return this.prisma.trip.delete({
            where:{
                id,
            }
        })
    }
}
