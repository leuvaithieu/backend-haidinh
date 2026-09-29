import { PartialType } from "@nestjs/swagger";
import { CreateRouteDto } from "./create-route.dto";

export class UpdateRoute extends PartialType(CreateRouteDto){
}