
import {
    IsEnum,
    IsNotEmpty,
    IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TripDirection } from '@prisma/client';

export class PublicTripSeatsDto {
    @ApiProperty({
        enum: TripDirection,
        example: TripDirection.OUTBOUND,
        description: 'Chiều di chuyển của khách',
    })
    @IsEnum(TripDirection)
    direction!: TripDirection;

    @ApiProperty({
        example: 'cm123pickuppoint',
        description: 'ID điểm đón trong lịch trình chuyến xe',
    })
    @IsString()
    @IsNotEmpty()
    pickupTripRoutePointId!: string;

    @ApiProperty({
        example: 'cm123dropoffpoint',
        description: 'ID điểm trả trong lịch trình chuyến xe',
    })
    @IsString()
    @IsNotEmpty()
    dropoffTripRoutePointId!: string;
}
