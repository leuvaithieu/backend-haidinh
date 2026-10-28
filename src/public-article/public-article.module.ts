import { Module } from '@nestjs/common';

import { PublicArticleController } from './public-article.controller';
import { PublicArticleService } from './public-article.service';

@Module({
  controllers: [PublicArticleController],
  providers: [PublicArticleService],
})
export class PublicArticleModule {}