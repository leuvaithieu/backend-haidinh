
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { SeatType } from '@prisma/client';

export class CreateSeatDto {
  @IsString()
  @MaxLength(20)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @IsOptional()
  @IsEnum(SeatType)
  type?: SeatType;

  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;

  @IsInt()
  @Min(1)
  row!: number;

  @IsInt()
  @Min(1)
  column!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
