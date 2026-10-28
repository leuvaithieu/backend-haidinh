import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';

import { PublicArticleService } from './public-article.service';
import { PublicArticleQueryDto } from './dto/public-article-query.dto';

@Controller('public/articles')
export class PublicArticleController {
  constructor(
    private readonly publicArticleService: PublicArticleService,
  ) {}

  @Get()
  findAll(@Query() query: PublicArticleQueryDto) {
    return this.publicArticleService.findAll(
      query.page,
      query.limit,
    );
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.publicArticleService.findBySlug(slug);
  }
}