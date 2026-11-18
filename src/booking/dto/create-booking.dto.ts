
import {
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
    IsNotEmpty,
    MaxLength,
    Matches,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TripDirection } from '@prisma/client';

// Thông tin một ghế và hành trình tương ứng trong booking.
export class CreateBookingSeatDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    seatId!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    pickupTripRoutePointId!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    dropoffTripRoutePointId!: string;

    // ID điểm dịch vụ đón, nếu khách chọn ServicePoint.
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    pickupServicePointId?: string;

    // ID điểm dịch vụ trả, nếu khách chọn ServicePoint.
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    dropoffServicePointId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Matches(/\S/, {
        message: 'Tên hành khách không được chỉ chứa khoảng trắng.',
    })
    passengerName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    @Matches(/\S/, {
        message: 'Số điện thoại hành khách không hợp lệ.',
    })
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
    @IsNotEmpty()
    @MaxLength(100)
    @Matches(/\S/, {
        message: 'Tên người đặt vé không được để trống.',
    })
    customerName!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    @Matches(/\S/, {
        message: 'Số điện thoại không hợp lệ.',
    })
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
