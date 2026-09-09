import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateRoutePointDto } from "./dto/create-route-point.dto";

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
        return this.prisma.routePoint.create({
            data,
        });
    }
}