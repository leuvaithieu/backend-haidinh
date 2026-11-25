
import { PartialType, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsOptional,
  ValidateNested,
  ArrayMinSize,
} from "class-validator";

import { CreateTripDto, TripPointScheduleDto } from "./create-trip.dto";

export class UpdateTripDto extends PartialType(CreateTripDto) {
  @ApiPropertyOptional({ type: [TripPointScheduleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2, { message: "Lịch chiều đi phải có ít nhất 2 điểm tuyến" })
  @ValidateNested({ each: true })
  @Type(() => TripPointScheduleDto)
  outboundPoints?: TripPointScheduleDto[];

  @ApiPropertyOptional({ type: [TripPointScheduleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2, { message: "Lịch chiều về phải có ít nhất 2 điểm tuyến" })
  @ValidateNested({ each: true })
  @Type(() => TripPointScheduleDto)
  returnPoints?: TripPointScheduleDto[];
}
