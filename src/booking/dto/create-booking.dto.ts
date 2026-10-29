
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBookingDto {
  @IsString()
  tripId!: string;

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
  @ArrayUnique()
  @IsString({ each: true })
  seatIds!: string[];
}
