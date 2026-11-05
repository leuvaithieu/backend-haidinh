
import { Test, TestingModule } from '@nestjs/testing';
import { BookingService } from './booking.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

describe('BookingService', () => {
    let service: BookingService;

    // Khởi tạo BookingService với các dependency giả lập phục vụ kiểm thử.
    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BookingService,
                {
                    provide: PrismaService,
                    useValue: {},
                },
                {
                    provide: SettingsService,
                    useValue: {
                        getNumberValue: jest.fn().mockResolvedValue(20),
                    },
                },
            ],
        }).compile();

        service = module.get<BookingService>(BookingService);
    });

    // Kiểm tra BookingService được khởi tạo thành công.
    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
