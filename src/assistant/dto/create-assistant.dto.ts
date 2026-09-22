import { IsString, IsNotEmpty,IsEnum} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { AssistantStatus } from '@prisma/client'

export class CreateAssistantDto{
    @ApiProperty({
        example:"Nguyễn Văn A",
        description : "Tên phụ xe"
    })
    @IsString()
    @IsNotEmpty()
    name!:string;

    @ApiProperty({
        example:"0982113878",
        description:"Số điện thoại phụ xe"
    })
    @IsString()
    @IsNotEmpty()
    phone!:string
    
    @ApiProperty({
        example:"038095014563",
        description:"Số căn cước cômg dân"
    })
    @IsString()
    @IsNotEmpty()
    cccd!:string;

    @ApiProperty({
        enum:AssistantStatus,
    })
    @IsString()
    @IsEnum(AssistantStatus)
    status?:AssistantStatus;
}