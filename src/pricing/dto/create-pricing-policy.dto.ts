import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PriceEntryType,
  PricePointType,
  RouteScheduleType,
  TripDirection,
} from '@prisma/client';

// DTO khai báo giá tại một RoutePoint.
export class CreateRoutePointPriceDto {
  @IsString()
  routePointId!: string;

  @IsEnum(PriceEntryType)
  priceType!: PriceEntryType;

  @IsOptional()
  @IsInt()
  @Min(1)
  price?: number | null;
}

// DTO khai báo giá tại một ServicePoint.
export class CreateServicePointPriceDto {
  @IsString()
  servicePointId!: string;

  @IsEnum(PriceEntryType)
  priceType!: PriceEntryType;

  @IsOptional()
  @IsInt()
  @Min(1)
  price?: number | null;
}

// DTO khai báo giá riêng cho một cặp điểm đón và trả.
export class CreateRoutePriceOverrideDto {
  @IsEnum(PricePointType)
  fromPointType!: PricePointType;

  @IsEnum(PricePointType)
  toPointType!: PricePointType;

  @IsString()
  fromPointKey!: string;

  @IsString()
  toPointKey!: string;

  @IsOptional()
  @IsString()
  fromRoutePointId?: string;

  @IsOptional()
  @IsString()
  fromServicePointId?: string;

  @IsOptional()
  @IsString()
  toRoutePointId?: string;

  @IsOptional()
  @IsString()
  toServicePointId?: string;

  @IsEnum(PriceEntryType)
  priceType!: PriceEntryType;

  @IsOptional()
  @IsInt()
  @Min(1)
  price?: number | null;
}

// DTO tạo chính sách giá cho một tuyến vận hành.
export class CreatePricingPolicyDto {
  @IsString()
  routeId!: string;

  @IsEnum(RouteScheduleType)
  pricingMode!: RouteScheduleType;

  @IsOptional()
  @IsString()
  baseOriginRoutePointId?: string | null;

  @IsEnum(TripDirection)
  direction!: TripDirection;

  @IsOptional()
  @IsString()
  vehicleType?: string | null;

  @IsInt()
  @Min(1)
  version!: number;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  fullRoutePrice?: number | null;

  @IsOptional()
  @IsInt()
  routeAdjustmentAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRoutePointPriceDto)
  routePointPrices?: CreateRoutePointPriceDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateServicePointPriceDto)
  servicePointPrices?: CreateServicePointPriceDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRoutePriceOverrideDto)
  priceOverrides?: CreateRoutePriceOverrideDto[];
}
