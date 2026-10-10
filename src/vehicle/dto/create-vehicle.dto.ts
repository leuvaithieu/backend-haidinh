import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';

export class CreateVehicleDto {
    @ApiProperty({
        example: '36B-01459',
        description: 'Biển số xe',
    })
    @IsString()
    @IsNotEmpty()
    licensePlate!: string;

    @ApiProperty({
        example: 'HD-01',
        description: 'Mã định danh xe từ HD-01 đến HD-40',
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^HD-(0[1-9]|[1-3][0-9]|40)$/)
    name!: string;

    @ApiProperty({
        example: '24',
        description: 'Số chỗ ngồi',
    })
    @IsNotEmpty()
    @IsInt()
    seatCount!: number;

    @ApiProperty({
        example: 'Thaco',
        description: 'Hãng xe',
    })
    @IsString()
    @IsNotEmpty()
    vehicleType!: string;

    @ApiPropertyOptional({
        example: '2026-09-01',
        description: 'Ngày đăng kiểm gần nhất',
    })
    @IsOptional()
    @IsDateString()
    inspectionDate?: string;

    @ApiPropertyOptional({
        example: '2027-03-01',
        description: 'Ngày hết hạn đăng kiểm',
    })
    @IsOptional()
    @IsDateString()
    inspectionExpiry?: string;

    @ApiPropertyOptional({
        example: 'ACTIVE',
        description: 'Trạng thái xe',
    })
    @IsOptional()
    @IsString()
    status?: string;
}