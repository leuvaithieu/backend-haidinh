import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class VehicleService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.vehicle.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  // Chuẩn hóa licensePlate
  private normalizeLicensePlate(value:string){
    return  value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g,'')
  }

  async create(data: CreateVehicleDto) {
    const licensePlate = this.normalizeLicensePlate(data.licensePlate);

    try {
      return await this.prisma.vehicle.create({
        data: {
          ...data,
          licensePlate,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Mã xe hoặc biển số xe đã tồn tại',
        );
      }

      throw error;
    }
  }

  async update(id: string, data: UpdateVehicleDto) {
    const updateData = {
      ...data,
      ...(data.licensePlate ?{licensePlate:this.normalizeLicensePlate(data.licensePlate)}:{}),
    };
    try {
      return await this.prisma.vehicle.update({
        where: {
          id,
        },
        data:updateData,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Biển số xe đã tồn tại');
      }

      throw error;
    }
  }

  async remove(id: string) {
    return this.prisma.vehicle.delete({
      where: {
        id,
      },
    });
  }
}