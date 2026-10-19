import { IsString, IsNotEmpty, IsInt, IsOptional,Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

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

    @IsOptional()
    @IsString()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    defaultTime?: string;
}