import {IsString, IsOptional, IsNotEmpty} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto{
    @ApiProperty({
        example: "admin",
        description:"Tên đăng nhập",
    })
    @IsString()
    @IsNotEmpty()
    username!: string;

    @ApiProperty({
        example:"123456",
        description:"Mật khẩy đăng nhập"
    })
    @IsString()
    @IsNotEmpty()
    password!:string;

    @ApiProperty({
        example:"Nguyễn Văn A",
        description:"Tên người dùng hệ thống"
    })
    @IsString()
    @IsNotEmpty()
    name!:string

    @ApiPropertyOptional({
        example: '0982113878',
        description: 'Số điện thoại',
    })
    @IsString()
    @IsOptional()
    phone?: string;

    @ApiPropertyOptional({
        example:"STAFF",
        description:"Vai trò người dùng"
    })
    @IsString()
    @IsOptional()
    role?:string;

    @ApiPropertyOptional({
        example:"ACTIVE",
        description:"Trạng thái người dùng",
    })
    @IsString()
    @IsOptional()
    status?:string;
}