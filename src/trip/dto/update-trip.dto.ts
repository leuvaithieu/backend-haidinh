
import { PartialType, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsOptional,
  ValidateNested,
} from "class-validator";

import { CreateTripDto, TripPointScheduleDto } from "./create-trip.dto";

export class UpdateTripDto extends PartialType(CreateTripDto) {
  @ApiPropertyOptional({ type: [TripPointScheduleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripPointScheduleDto)
  outboundPoints?: TripPointScheduleDto[];

  @ApiPropertyOptional({ type: [TripPointScheduleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripPointScheduleDto)
  returnPoints?: TripPointScheduleDto[];
}
