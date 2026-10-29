import { PartialType } from '@nestjs/swagger';
import { CreateRouteWebsiteContentDto } from './create-route-website-content.dto';

export class UpdateRouteWebsiteContentDto extends PartialType(
  CreateRouteWebsiteContentDto,
) {}