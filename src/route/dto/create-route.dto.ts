import { IsString,IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateRouteDto{
    @ApiProperty({
        example:'Thanh Hóa - Sài Gòn - Bình Dương',
        description:'Tên tuyến xe'
    })
    @IsString()
    @IsNotEmpty()
    name!:string;
}