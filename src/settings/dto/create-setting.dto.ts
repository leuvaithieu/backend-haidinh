import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSettingDto {
    @IsString()
    @IsNotEmpty()
    key!: string;

    @IsString()
    @IsNotEmpty()
    value!: string;

    @IsOptional()
    @IsString()
    description?: string;
}