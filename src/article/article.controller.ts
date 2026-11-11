import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { ArticleService } from './article.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { CmsStatus } from '@prisma/client';
import { UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('articles')
export class ArticleController {
  constructor(private readonly articleService: ArticleService) {}

  @Roles('ADMIN', 'STAFF')
  @Get()
  findAll(
    @Query('search') search?:string,
    @Query('status') status?:CmsStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.articleService.findAll({
       search,
       status,
       page: Math.max(1, Number(page) || 1),
       limit: Math.min(100, Math.max(1, Number(limit) || 10)),
    });
  }

  @Roles('ADMIN', 'STAFF')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.articleService.findOne(id);
  }

  @Roles('ADMIN', 'STAFF')
  @Post()
  create(@Body() dto: CreateArticleDto) {
    return this.articleService.create(dto);
  }

  @Roles('ADMIN', 'STAFF')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.articleService.update(id, dto);
  }
  
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.articleService.remove(id);
  }
}