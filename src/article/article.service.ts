import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, CmsStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

@Injectable()
export class ArticleService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    search?: string;
    status?: CmsStatus;
    page?: number;
    limit?: number;
    }) {
    const {
        search,
        status,
        page = 1,
        limit = 10,
    } = params;

    const where: Prisma.ArticleWhereInput = {
        ...(status && { status }),
        ...(search && {
        OR: [
            {
            title: {
                contains: search,
                mode: 'insensitive',
            },
            },
            {
            slug: {
                contains: search,
                mode: 'insensitive',
            },
            },
        ],
        }),
    };

    const [items, total] = await Promise.all([
        this.prisma.article.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
            createdAt: 'desc',
        },
        }),
        this.prisma.article.count({ where }),
    ]);

    return {
        items,
        meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        },
    };
    }

  async findOne(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!article) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    return article;
  }

  async create(dto: CreateArticleDto) {
    try {
      const { publishedAt, ...data } = dto;

      return await this.prisma.article.create({
        data: {
          ...data,
          publishedAt: publishedAt
            ? new Date(publishedAt)
            : data.status === 'PUBLISHED'
              ? new Date()
              : null,
        },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateArticleDto) {
    await this.findOne(id);

    try {
      const { publishedAt, ...data } = dto;

      return await this.prisma.article.update({
        where: { id },
        data: {
          ...data,
          ...(publishedAt !== undefined
            ? { publishedAt: publishedAt ? new Date(publishedAt) : null }
            : data.status === 'PUBLISHED'
              ? {}
              : data.status === 'DRAFT'
                ? { publishedAt: null }
                : {}),
        },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.article.delete({
      where: { id },
    });
  }

  private handlePrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Slug bài viết đã tồn tại');
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    throw error;
  }
}