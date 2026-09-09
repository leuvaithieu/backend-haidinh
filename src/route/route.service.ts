import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRouteDto } from './dto/create-route.dto';

@Injectable()
export class RouteService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.route.findMany({
      include: {
        routePoints: true,
      },
    });
  }

  async create(data: CreateRouteDto) {
    return this.prisma.route.create({
      data,
    });
  }
}