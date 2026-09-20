import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty } from "class-validator";

export class LoginDto{
    @ApiProperty({
        example:'admin',
        description:'tên đăng nhập',
    })
    @IsString()
    @IsNotEmpty()
    username!:string;

    @ApiProperty({
        example:'123456',
        description:'Mật khẩu đăng nhập',
    })
    @IsString()
    @IsNotEmpty()
    password!:string;
}