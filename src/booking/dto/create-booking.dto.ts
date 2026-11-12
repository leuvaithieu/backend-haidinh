
import {
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TripDirection } from '@prisma/client';

// Thông tin một ghế và hành trình tương ứng trong booking.
export class CreateBookingSeatDto {
    @IsString()
    seatId!: string;

    @IsString()
    pickupTripRoutePointId!: string;

    @IsString()
    dropoffTripRoutePointId!: string;

    // ID điểm dịch vụ đón, nếu khách chọn ServicePoint.
    @IsOptional()
    @IsString()
    pickupServicePointId?: string;

    // ID điểm dịch vụ trả, nếu khách chọn ServicePoint.
    @IsOptional()
    @IsString()
    dropoffServicePointId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    passengerName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    passengerPhone?: string;
}

export class CreateBookingDto {
    @IsString()
    tripId!: string;

    @IsEnum(TripDirection)
    direction!: TripDirection;

    @IsOptional()
    @IsString()
    customerId?: string;

    @IsString()
    @MaxLength(100)
    customerName!: string;

    @IsString()
    @MaxLength(20)
    customerPhone!: string;

    @IsOptional()
    @IsEmail()
    customerEmail?: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayUnique((seat: CreateBookingSeatDto) => seat.seatId)
    @ValidateNested({ each: true })
    @Type(() => CreateBookingSeatDto)
    seats!: CreateBookingSeatDto[];
}
