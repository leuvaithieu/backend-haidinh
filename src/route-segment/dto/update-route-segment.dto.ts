import { CreateRouteSegmentDto } from "./create-route-segment.dto";
import { PartialType } from "@nestjs/swagger";

export class UpdateRouteSegmentDto extends PartialType(CreateRouteSegmentDto){};