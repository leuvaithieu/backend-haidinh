
import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TripDirection } from '@prisma/client';

export class PublicTripSearchDto {
    @ApiProperty({
        example: 'cm123routepoint1',
        description: 'ID điểm đón thuộc tuyến',
    })
    @IsString()
    @IsNotEmpty()
    fromRoutePointId!: string;

    @ApiProperty({
        example: 'cm123routepoint2',
        description: 'ID điểm trả thuộc tuyến',
    })
    @IsString()
    @IsNotEmpty()
    toRoutePointId!: string;

    @ApiProperty({
        example: '2026-11-20',
        description: 'Ngày khách muốn khởi hành, định dạng YYYY-MM-DD',
    })
    @IsDateString()
    date!: string;

    @ApiProperty({
        enum: TripDirection,
        example: TripDirection.OUTBOUND,
        description: 'Chiều di chuyển của khách',
    })
    @IsEnum(TripDirection)
    direction!: TripDirection;
}
