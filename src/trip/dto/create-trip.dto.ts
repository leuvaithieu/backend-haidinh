
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsDateString,
    IsArray,
    IsEnum,
    ValidateNested,
    Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouteScheduleType } from '@prisma/client';

export class TripPointScheduleDto {
    @ApiProperty({
        example: 'cm123routepoint',
        description: 'ID điểm tuyến',
    })
    @IsString()
    @IsNotEmpty()
    routePointId!: string;

    @ApiProperty({
        example: '10:00',
        description: 'Giờ dự kiến đến điểm, định dạng HH:mm',
    })
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    time!: string;
}

export class CreateTripDto {
    @ApiProperty({ example: 'cm123route', description: 'ID tuyến' })
    @IsString()
    @IsNotEmpty()
    routeId!: string;

    @ApiProperty({ example: 'cm123vehicle', description: 'ID xe' })
    @IsString()
    @IsNotEmpty()
    vehicleId!: string;

    @ApiProperty({ example: 'cm123driver1', description: 'ID lái xe 1' })
    @IsString()
    @IsNotEmpty()
    driver1Id!: string;

    @ApiProperty({ example: 'cm123driver2', description: 'ID lái xe 2' })
    @IsString()
    @IsNotEmpty()
    driver2Id!: string;

    @ApiProperty({ example: 'cm123assistant1', description: 'ID phụ xe 1' })
    @IsString()
    @IsNotEmpty()
    assistant1Id!: string;

    @ApiPropertyOptional({
        example: 'cm123assistant2',
        description: 'ID phụ xe 2, không bắt buộc với chuyến ngắn',
    })
    @IsOptional()
    @IsString()
    assistant2Id?: string;

    @ApiProperty({
        example: '2026-10-13T06:30:00+07:00',
        description: 'Ngày giờ xuất phát chiều đi',
    })
    @IsDateString()
    plannedDeparture!: string;

    @ApiProperty({
        example: '2026-10-14T06:30:00+07:00',
        description: 'Ngày giờ xuất phát chiều về',
    })
    @IsDateString()
    returnPlannedDeparture!: string;

    // @ApiProperty({
    //     type: [TripPointScheduleDto],
    //     description: 'Lịch các điểm theo thứ tự chạy chiều đi',
    // })
    // @IsArray()
    // @ValidateNested({ each: true })
    // @Type(() => TripPointScheduleDto)
    // outboundPoints!: TripPointScheduleDto[];

    // @ApiProperty({
    //     type: [TripPointScheduleDto],
    //     description: 'Lịch các điểm theo thứ tự chạy chiều về',
    // })
    // @IsArray()
    // @ValidateNested({ each: true })
    // @Type(() => TripPointScheduleDto)
    // returnPoints!: TripPointScheduleDto[];

    @ApiProperty({
        enum: RouteScheduleType,
        example: RouteScheduleType.NORMAL,
        description: 'Loại lịch chạy: NORMAL (ngày thường) hoặc TET (dịp Tết)',
    })
    @IsEnum(RouteScheduleType)
    scheduleType!: RouteScheduleType;
}
