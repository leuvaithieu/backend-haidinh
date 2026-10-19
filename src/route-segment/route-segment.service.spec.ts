import { Test, TestingModule } from '@nestjs/testing';
import { RouteSegmentService } from './route-segment.service';

describe('RouteSegmentService', () => {
  let service: RouteSegmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RouteSegmentService],
    }).compile();

    service = module.get<RouteSegmentService>(RouteSegmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
