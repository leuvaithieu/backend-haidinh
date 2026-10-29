import {
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CopySeatLayoutDto {
  @IsString()
  vehicleId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
