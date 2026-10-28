import { Injectable, NotFoundException } from '@nestjs/common';
import { CmsStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicArticleService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page = 1, limit = 10) {
    const where = {
      status: CmsStatus.PUBLISHED,
      publishedAt: {
        not: null,
        lte: new Date(),
      },
    };

    const [items, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          coverImage: true,
          category: true,
          tags: true,
          featured: true,
          seoTitle: true,
          seoDescription: true,
          publishedAt: true,
        },
        orderBy: {
          publishedAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
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

  async findBySlug(slug: string) {
    const article = await this.prisma.article.findFirst({
      where: {
        slug,
        status: CmsStatus.PUBLISHED,
        publishedAt: {
          not: null,
          lte: new Date(),
        },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        content: true,
        coverImage: true,
        category: true,
        tags: true,
        featured: true,
        seoTitle: true,
        seoDescription: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!article) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    return article;
  }
}