import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean ,IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateCustomerDto {
  @ApiProperty({
    example : 'Lê Công Hoàng',
    description:'Họ và tên khách hàng'
  })
  @IsString()
  @IsNotEmpty()
  fullName! : string;

  @ApiProperty({
    example: '0982113878',
    description:'Số điện thoại khách hàng'
  })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({
    example:'abc@gmail.com'
  })
  @IsOptional()
  @IsEmail()
  email?:string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?:string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?:string;

  @ApiPropertyOptional({
    example: false,
    description: 'Khách hàng VIP',
  })
  @IsBoolean()
  @IsOptional()
  isVip?: boolean;
}