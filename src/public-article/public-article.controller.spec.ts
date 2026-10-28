import { Test, TestingModule } from '@nestjs/testing';
import { PublicArticleController } from './public-article.controller';

describe('PublicArticleController', () => {
  let controller: PublicArticleController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicArticleController],
    }).compile();

    controller = module.get<PublicArticleController>(PublicArticleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
