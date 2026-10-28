import { Test, TestingModule } from '@nestjs/testing';
import { PublicArticleService } from './public-article.service';

describe('PublicArticleService', () => {
  let service: PublicArticleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PublicArticleService],
    }).compile();

    service = module.get<PublicArticleService>(PublicArticleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
