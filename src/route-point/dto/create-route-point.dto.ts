import { IsString, IsNotEmpty, IsInt, IsOptional,Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateRoutePointDto{
    @ApiProperty({
        example:'cm123routeid',
        description:'Id của tuyến'
    })
    @IsString()
    @IsNotEmpty()
    routeId!:string;

    @ApiProperty({
        example:'Thanh Hóa',
        description:'Tên RoutePoint'
    })
    @IsString()
    @IsNotEmpty()
    name!:string;

    @ApiProperty({
        example:'1'
    })

    @ApiProperty({
        example:'1',
        description:'sequence của RoutePoint'
    })
    @IsNotEmpty()
    @IsInt()
    sequence!:number;

    @ApiPropertyOptional({
        example: '10:00',
        description: 'Giờ tùy chỉnh HH:mm. Nếu bỏ trống, sử dụng giờ mặc định của điểm tuyến.',
    })
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    time?: string;
}