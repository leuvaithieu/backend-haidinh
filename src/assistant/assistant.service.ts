import { Injectable , ConflictException} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAssistantDto } from './dto/create-assistant.dto';
import { UpdateAssistantDto } from './dto/update-assistant.dto';

@Injectable()
export class AssistantService {
    constructor(private prisma:PrismaService){}

    async findAll(){
        return this.prisma.assistant.findMany({
            orderBy:{
                createdAt:'desc'
            },
        })
    }

    async findOne(id:string){
        return this.prisma.assistant.findUnique({
            where:{
                id
            }
        })
    }

    async create(data:CreateAssistantDto){
        try{
            return await this.prisma.assistant.create({
                data:{
                    name:data.name,
                    phone:data.phone,
                    cccd:data.cccd,
                    status:data.status
                }
            })
        }catch(error){
            if(
                error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
            ){
                throw new ConflictException('Số điện thoại hoặc CCCD đã tồn tại')
            }
            throw error;
        }
    }

    async update(id:string, data: UpdateAssistantDto){
        try{
            return await this.prisma.assistant.update({
                where:{
                    id,
                },
                data
            })
        }catch(error){
            if(
                error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
            ){
                throw new ConflictException('Số điện thoại hoặc CCCD đã tồn tại');
            }
            throw error;
        }
    };

    async remove(id:string){
        return this.prisma.assistant.delete({
            where:{
                id,
            },
        });
    };
}
