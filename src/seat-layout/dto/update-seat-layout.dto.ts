import { PartialType } from '@nestjs/swagger';
import { CreateSeatLayoutDto } from './create-seat-layout.dto';

export class UpdateSeatLayoutDto extends PartialType(
  CreateSeatLayoutDto,
) {}
