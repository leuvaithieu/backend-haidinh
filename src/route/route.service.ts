
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRoute } from './dto/update-route.dto';
import { CreateRouteWebsiteContentDto } from './dto/create-route-website-content.dto';
import { UpdateRouteWebsiteContentDto } from './dto/update-route-website-content.dto';

@Injectable()
export class RouteService {
  constructor(private readonly prisma: PrismaService) {}

  async findPublishedWebsiteRoutes() {
    return this.prisma.routeWebsiteContent.findMany({
      where: {
        isPublished: true,
      },
      orderBy: [
        {
          displayOrder: 'asc',
        },
        {
          title: 'asc',
        },
      ],
      include: {
        route: {
          include: {
            routePoints: {
              orderBy: {
                sequence: 'asc',
              },
              include: {
                servicePoints: true,
              },
            },
          },
        },
      },
    });
  }
  // Lấy danh sách tuyến vận hành kèm nội dung website
  async findAll() {
    return this.prisma.route.findMany({
      include: {
        websiteContent: true,
        routePoints: {
          orderBy: {
            sequence: 'asc',
          },
          include: {
            servicePoints: true,
          },
        },
      },
    });
  }

  // Tạo tuyến vận hành
  async create(data: CreateRouteDto) {
    return this.prisma.route.create({
      data,
    });
  }

  // Cập nhật tuyến vận hành
  async update(id: string, data: UpdateRoute) {
    return this.prisma.route.update({
      where: {
        id,
      },
      data,
    });
  }

  // Xóa tuyến vận hành
  async remove(id: string) {
    return this.prisma.route.delete({
      where: {
        id,
      },
    });
  }

  // Tạo nội dung website cho tuyến đã tồn tại
  async createWebsiteContent(
    routeId: string,
    data: CreateRouteWebsiteContentDto,
  ) {
    const route = await this.prisma.route.findUnique({
      where: {
        id: routeId,
      },
    });

    if (!route) {
      throw new NotFoundException('Không tìm thấy tuyến vận hành');
    }

    const existing =
      await this.prisma.routeWebsiteContent.findUnique({
        where: {
          routeId,
        },
      });

    if (existing) {
      throw new ConflictException(
        'Tuyến này đã có nội dung website. Hãy cập nhật nội dung hiện có.',
      );
    }

    return this.prisma.routeWebsiteContent.create({
      data: {
        ...data,
        routeId,
      },
    });
  }

  // Cập nhật nội dung website
  async updateWebsiteContent(
    routeId: string,
    data: UpdateRouteWebsiteContentDto,
  ) {
    const existing =
      await this.prisma.routeWebsiteContent.findUnique({
        where: {
          routeId,
        },
      });

    if (!existing) {
      throw new NotFoundException(
        'Tuyến này chưa có nội dung website',
      );
    }

    return this.prisma.routeWebsiteContent.update({
      where: {
        routeId,
      },
      data,
    });
  }
}
