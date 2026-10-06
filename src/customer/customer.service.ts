import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CustomerService {
    constructor(private prisma: PrismaService) {}

    private normalizeText(value:string){
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g,'')
            .toLocaleLowerCase()
            .trim()
    }

    async suggest(search?: string) {
        if (!search?.trim()) {
            return [];
        }

        const searchText = this.normalizeText(search);

        const searchWords = searchText
            .split(/\s+/)
            .filter(Boolean);

        const customers = await this.prisma.customer.findMany({
            where: {
                deletedAt: null,
            },
            select: {
                id: true,
                fullName: true,
                phone: true,
            },
        });

        const matchedCustomers = customers.filter((customer)=>{
            const customerName = this.normalizeText(customer.fullName);

            return searchWords.every((word)=>
                customerName.includes(word)
            );
        })

        

        matchedCustomers.sort((a, b) => {
            const aName = this.normalizeText(a.fullName);
            const bName = this.normalizeText(b.fullName);

            // 1. Khớp chính xác toàn bộ tên
            if (aName === searchText && bName !== searchText) {
                return -1;
            }

            if (bName === searchText && aName !== searchText) {
                return 1;
            }

            // 2. Tên bắt đầu bằng chuỗi tìm kiếm
            const aStartsWith = aName.startsWith(searchText);
            const bStartsWith = bName.startsWith(searchText);

            if (aStartsWith && !bStartsWith) {
                return -1;
            }

            if (bStartsWith && !aStartsWith) {
                return 1;
            }

            // 3. Tên ngắn hơn ưu tiên trước
            return aName.length - bName.length;
        });

        return matchedCustomers.slice(0, 10);
    }

    async findAll(search?: string) {
        return this.prisma.customer.findMany({
            where: {
                deletedAt: null,

                ...(search
                    ? {
                        OR: [
                            {
                                fullName: {
                                    contains: search,
                                    mode: 'insensitive',
                                },
                            },
                            {
                                phone: {
                                    contains: search,
                                },
                            },
                            {
                                email: {
                                    contains: search,
                                    mode: 'insensitive',
                                },
                            },
                        ],
                    }
                    : {}),
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