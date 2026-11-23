
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { TicketPdfService } from './ticket-pdf.service';

@Module({
    imports: [PrismaModule],
    controllers: [TicketController],
    providers: [TicketService, TicketPdfService],
    exports: [TicketService, TicketPdfService],
})
export class TicketModule {}