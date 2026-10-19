import { Injectable,BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { CreateRouteSegmentDto } from './dto/create-route-segment.dto';
import { UpdateRouteSegmentDto } from './dto/update-route-segment.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, RouteScheduleType } from '@prisma/client';

@Injectable()
export class RouteSegmentService {
    constructor(private prisma:PrismaService){}

    private async validateSegment(data:{
        routeId:string;
        fromRoutePointId:string;
        toRoutePointId:string;
        scheduleType: RouteScheduleType;
        travelDurationMinutes: number;
    }){
        if(
            !Number.isInteger(data.travelDurationMinutes) || data.travelDurationMinutes <= 0
        ){
            throw new BadRequestException('Thời lượng di chuyển phải là số phút nguyên lớn hơn 0!');
        }

        const [route, fromPoint, toPoint] = await Promise.all([
            this.prisma.route.findUnique({
                where:{id: data.routeId},
            }),
            this.prisma.routePoint.findUnique({
                where: {id : data.fromRoutePointId},
            }),
            this.prisma.routePoint.findUnique({
                where:{id: data.toRoutePointId},
            }),
        ]);

        if(!route){
            throw new BadRequestException('Không tìm thấy tuyến đường!')
        }
        if(!fromPoint || !toPoint){
            throw new BadRequestException('Không tìm thấy điểm tuyến!')
        }

        if(fromPoint.routeId !== data.routeId || toPoint.routeId !== data.routeId){
            throw new BadRequestException('Hai điểm phải thuộc tuyến đã chọn!')
        }

        if(fromPoint.sequence >= toPoint.sequence){
            throw new BadRequestException(
                'Điểm đầu phải đứng trước điểm cuối trong tuyến'
            )
        }
        
    }

    async findAll(routeId?:string){
        return this.prisma.routeSegment.findMany({
            where : routeId ? {routeId} : undefined,
            include : {
                fromRoutePoint : true,
                toRoutePoint : true,
            },
            orderBy: {
                fromRoutePoint:{
                    sequence: 'asc',
                },
            },
        });
    };

    async findOne(id:string){
        const segment = await this.prisma.routeSegment.findUnique({
            where : {id},
            include:{
                fromRoutePoint:true,
                toRoutePoint:true,
            },
        });

        if(!segment){
            throw new NotFoundException('Không tìm thấy chặng tuyến');
        }

        return segment;
    }

    async create(data:CreateRouteSegmentDto){
        await this.validateSegment(data);

        try{
            return await this.prisma.routeSegment.create({
                data,
                include:{
                    fromRoutePoint:true,
                    toRoutePoint:true,
                },
            });
        }catch(error){
            if(
                error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
            ){
                throw new ConflictException('Chặng này đã tồn tại!');
            }
            throw error;
        }
    };

    async update(id:string , data:UpdateRouteSegmentDto){
        await this.findOne(id);

        const current = await this.prisma.routeSegment.findUniqueOrThrow({
            where:{id},
        });

        const mergedData = {
            routeId: data.routeId ?? current.routeId,
            fromRoutePointId: data.fromRoutePointId ?? current.fromRoutePointId,
            toRoutePointId: data.toRoutePointId ?? current.toRoutePointId,
            scheduleType : data.scheduleType ?? current.scheduleType,
            travelDurationMinutes : data.travelDurationMinutes ?? current.travelDurationMinutes,
        };

        await this.validateSegment(mergedData);

        try{
            return await this.prisma.routeSegment.update({
                where:{id},
                data,
                include:{
                    fromRoutePoint:true,
                    toRoutePoint:true,
                },
            });
        }catch(error){
            if(
                error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
            ){
                throw new ConflictException('Chặng này đã tồn tại!');
            }
            throw error;
        }
    };

    async remove(id:string){
        await this.findOne(id);

        return this.prisma.routeSegment.delete({
            where:{id},
        })
    }
}
