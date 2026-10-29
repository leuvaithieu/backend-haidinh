import { Test, TestingModule } from '@nestjs/testing';
import { SeatLayoutController } from './seat-layout.controller';

describe('SeatLayoutController', () => {
  let controller: SeatLayoutController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SeatLayoutController],
    }).compile();

    controller = module.get<SeatLayoutController>(SeatLayoutController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
