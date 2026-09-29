import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CustomerService {
    constructor(private prisma: PrismaService) {}

    async findAll() {
        return this.prisma.customer.findMany({
            where: {
                deletedAt: null,
            },
        });
    }

    private capitalizeName(value: string) {
        return value
            .trim()
            .toLocaleLowerCase()
            .replace(/\s+/g, ' ')
            .split(' ')
            .map(
                (word) =>
                    word.charAt(0).toLocaleUpperCase() +
                    word.slice(1),
            )
            .join(' ');
    }

    async create(data: CreateCustomerDto) {
        const fullName = this.capitalizeName(data.fullName);

        try {
            return await this.prisma.customer.create({
                data: {
                    ...data,
                    fullName,
                },
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                    'Số điện thoại đã tồn tại',
                );
            }

            throw error;
        }
    }

    async update(id: string, data: UpdateCustomerDto) {
        const updateData = {
            ...data,
            ...(data.fullName
                ? {
                      fullName: this.capitalizeName(data.fullName),
                  }
                : {}),
        };

        try {
            return await this.prisma.customer.update({
                where: {
                    id,
                },
                data: updateData,
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                    'Số điện thoại đã tồn tại',
                );
            }

            throw error;
        }
    }

    async remove(id: string) {
        return this.prisma.customer.update({
            where: {
                id,
            },
            data: {
                deletedAt: new Date(),
            },
        });
    }
}