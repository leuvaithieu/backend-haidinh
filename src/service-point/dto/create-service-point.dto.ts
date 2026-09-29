import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty } from "class-validator";

export class CreateServicePointDto{

    @ApiProperty({
        example:'cm123routepointid',
        description:'id của routePoint'
    })
    @IsString()
    @IsNotEmpty()
    routePointId!:string;

    @ApiProperty({
        example:'Thọ Phú',
        description:'Tên ServicePoint'
    })
    @IsString()
    @IsNotEmpty()
    name!:string;
}