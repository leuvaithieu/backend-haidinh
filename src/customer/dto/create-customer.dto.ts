import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString } from "class-validator";

export class CreateCustomerDto {
  @ApiProperty({
    example : 'Lê Công Hoàng',
    description:'Họ và tên khách hàng'
  })
  @IsString()
  fullName! : string;

  @ApiProperty({
  example: '0982113878',
  description:'Số điện thoại khách hàng'
  })
  @IsString()
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
  note?:string
}