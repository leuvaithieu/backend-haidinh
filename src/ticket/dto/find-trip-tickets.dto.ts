
import { IsEnum, IsOptional } from 'class-validator';
import { TicketStatus } from '@prisma/client';

export class FindTripTicketsDto {
    @IsOptional()
    @IsEnum(TicketStatus, {
        message: 'Trạng thái vé không hợp lệ.',
    })
    status?: TicketStatus;
}
