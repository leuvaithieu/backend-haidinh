import { Test, TestingModule } from '@nestjs/testing';
import { CustomerController } from './customer.controller';
<<<<<<< HEAD
=======
import { CustomerService } from './customer.service';
>>>>>>> 69c2ac68b08d2d3e72ba87a609c226329c77c2f5

describe('CustomerController', () => {
  let controller: CustomerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerController],
<<<<<<< HEAD
=======
      providers: [CustomerService],
>>>>>>> 69c2ac68b08d2d3e72ba87a609c226329c77c2f5
    }).compile();

    controller = module.get<CustomerController>(CustomerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
