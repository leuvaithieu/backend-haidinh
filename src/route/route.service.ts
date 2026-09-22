import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRoute } from './dto/update-route.dto';

@Injectable()
export class RouteService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.route.findMany({
      include: {
        routePoints: {
          orderBy:{
            sequence:'asc'
          },
          include:{
            servicePoints:true
          }
        }
      },
    });
  }

  async create(data: CreateRouteDto) {
    return this.prisma.route.create({
      data,
    });
  }

  async update(id:string, data:UpdateRoute){
    return this.prisma.route.update({
      where:{
        id,
      },
      data,
    })
  }

  async remove(id:string){
    return this.prisma.route.delete({
      where:{
        id,
      }
    })
  }
}