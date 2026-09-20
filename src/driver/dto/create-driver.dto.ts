import { IsDateString, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateDriverDto{
    @ApiProperty({
        example:'Nguyễn Văn A',
        description:'Tên tài xế',
    })
    @IsString()
    @IsNotEmpty()
    name!:string;

    @ApiProperty({
        example:'0982113878',
        description:'Số điện thoại tài xế',
    })
    @IsString()
    @IsNotEmpty()
    phone!:string;

    @ApiProperty({
        example:'785444656232',
        description:'Số GPLX',
    })
    @IsString()
    @IsNotEmpty()
    licenseNumber!:string;

    @ApiPropertyOptional({
        example:'E',
        description: 'Hạng GPLX'
    })
    @IsString()
    @IsOptional()
    licenseClass?:string;

    @ApiPropertyOptional({
        example:'2030-12-31',
        description:'Ngày hết hạn GPLX'
    })
    @IsDateString()
    @IsOptional()
    licenseExpiry?:string;

    @ApiPropertyOptional({
        example:'ACTIVE',
        description:'Trạng tái lái xe'
    })
    @IsString()
    @IsOptional()
    status?:string;
}