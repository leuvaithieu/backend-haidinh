import { IsString ,IsNotEmpty, IsOptional, IsDateString } from "class-validator";
import { ApiProperty,ApiPropertyOptional } from "@nestjs/swagger";


export class CreateTripDto{
    @ApiProperty({
        example:'cm123route',
        description:'ID tuyến'
    })
    @IsString()
    @IsNotEmpty()
    routeId!:string;

    @ApiProperty({
        example:'cm123vehicle',
        description:'ID của xe'
    })
    @IsString()
    @IsNotEmpty()
    vehicleId!:string;

    @ApiProperty({
        example:'cm123driver1',
        description:'ID của lái xe 1'
    })
    @IsString()
    @IsNotEmpty()
    driver1Id!:string;

    @ApiProperty({
        example:'cm123driver2',
        description:'ID của lái xe 2'
    })
    @IsString()
    @IsNotEmpty()
    driver2Id !:string;

    @ApiProperty({
        example:'cm123assistant1',
        description:'ID của phụ xe 1'
    })
    @IsString()
    @IsNotEmpty()
    assistant1Id !:string; 

    @ApiProperty({
        example:'cm123assistant2',
        description:'ID của phụ xe 2, có thể có chuyến không có'
    })
    @IsString()
    @IsNotEmpty()
    assistant2Id ?:string;

    @ApiProperty({
        example:'2026-09-25T06:30:00.000Z',
        description:'Thời gian dự kiến xuất phát'
    })
    @IsDateString()
    plannedDeparture!:string;

    @ApiProperty({
        example:'2026-09-27T18:00:00.000Z',
        description:'Thời gian dự kiến hoàn thành chuyến'
    })
    @IsNotEmpty()
    @IsDateString()
    plannedArrival?:string;
}