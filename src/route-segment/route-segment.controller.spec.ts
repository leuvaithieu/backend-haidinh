import { Test, TestingModule } from '@nestjs/testing';
import { RouteSegmentController } from './route-segment.controller';

describe('RouteSegmentController', () => {
  let controller: RouteSegmentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RouteSegmentController],
    }).compile();

    controller = module.get<RouteSegmentController>(RouteSegmentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
