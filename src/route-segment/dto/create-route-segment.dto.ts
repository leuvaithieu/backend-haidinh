import { IsInt,IsString, Min, IsEnum } from "class-validator";
import { RouteScheduleType } from "@prisma/client";

export class CreateRouteSegmentDto {
    @IsString()
    routeId!:string;

    @IsString()
    fromRoutePointId!:string;

    @IsString()
    toRoutePointId!:string;

    @IsInt()
    @Min(1)
    travelDurationMinutes!: number;

    @IsEnum(RouteScheduleType)
    scheduleType!: RouteScheduleType;
}