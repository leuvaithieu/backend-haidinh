import { Test, TestingModule } from '@nestjs/testing';
import { SeatLayoutService } from './seat-layout.service';

describe('SeatLayoutService', () => {
  let service: SeatLayoutService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SeatLayoutService],
    }).compile();

    service = module.get<SeatLayoutService>(SeatLayoutService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
