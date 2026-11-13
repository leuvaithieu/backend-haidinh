
import {
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';

import { TripDirection } from '@prisma/client';

export class PublicPriceQuoteDto {
    @IsString()
    @IsNotEmpty()
    tripId!: string;

    @IsEnum(TripDirection)
    direction!: TripDirection;

    @IsString()
    @IsNotEmpty()
    pickupTripRoutePointId!: string;

    @IsString()
    @IsNotEmpty()
    dropoffTripRoutePointId!: string;

    @IsOptional()
    @IsString()
    pickupServicePointId?: string;

    @IsOptional()
    @IsString()
    dropoffServicePointId?: string;
}
