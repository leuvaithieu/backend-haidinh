import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  IsNotEmpty,
  Matches,
  MaxLength,
} from 'class-validator';

import { BookingStatus, PaymentStatus } from '@prisma/client';

export class QueryBookingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  // Lọc booking theo chuyến xe.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/\S/, {
      message: 'Mã chuyến xe không hợp lệ.',
  })
  tripId?: string;

  // Tìm booking theo số điện thoại.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/\S/, {
      message: 'Số điện thoại không hợp lệ.',
  })
  customerPhone?: string;

  // Tìm booking theo mã đặt vé.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/\S/, {
      message: 'Mã đặt vé không hợp lệ.',
  })
  bookingCode?: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;
}