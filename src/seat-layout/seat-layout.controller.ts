
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { SeatLayoutService } from './seat-layout.service';

import { CreateSeatLayoutDto } from './dto/create-seat-layout.dto';
import { UpdateSeatLayoutDto } from './dto/update-seat-layout.dto';
import { CreateSeatDto } from './dto/create-seat.dto';
import { UpdateSeatDto } from './dto/update-seat.dto';
import { CopySeatLayoutDto } from './dto/copy-seat-layout.dto';

import { UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('seat-layout')
export class SeatLayoutController {
    constructor(
        private readonly seatLayoutService: SeatLayoutService,
    ) {}

    // =========================================
    // SEAT LAYOUT
    // =========================================

    // GET /seat-layout
    @Roles('ADMIN', 'STAFF')
    @Get()
    findAll() {
        return this.seatLayoutService.findAll();
    }

    // GET /seat-layout/:id
    @Roles('ADMIN', 'STAFF')
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.seatLayoutService.findOne(id);
    }

    // POST /seat-layout
    @Roles('ADMIN')
    @Post()
    create(@Body() dto: CreateSeatLayoutDto) {
        return this.seatLayoutService.create(dto);
    }

    // PATCH /seat-layout/:id
    @Roles('ADMIN')
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateSeatLayoutDto,
    ) {
        return this.seatLayoutService.update(id, dto);
    }

    // DELETE /seat-layout/:id
    @Roles('ADMIN')
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.seatLayoutService.remove(id);
    }

    // =========================================
    // SEAT
    // =========================================

    // GET /seat-layout/:layoutId/seats
    @Roles('ADMIN', 'STAFF')
    @Get(':layoutId/seats')
    findSeats(@Param('layoutId') layoutId: string) {
        return this.seatLayoutService.findSeats(layoutId);
    }

    // POST /seat-layout/:layoutId/seats
    @Roles('ADMIN')
    @Post(':layoutId/seats')
    createSeat(
        @Param('layoutId') layoutId: string,
        @Body() dto: CreateSeatDto,
    ) {
        return this.seatLayoutService.createSeat(layoutId, dto);
    }

    // PATCH /seat-layout/:layoutId/seats/:seatId
    @Roles('ADMIN')
    @Patch(':layoutId/seats/:seatId')
    updateSeat(
        @Param('layoutId') layoutId: string,
        @Param('seatId') seatId: string,
        @Body() dto: UpdateSeatDto,
    ) {
        return this.seatLayoutService.updateSeat(
        layoutId,
        seatId,
        dto,
        );
    }

    // DELETE /seat-layout/:layoutId/seats/:seatId
    @Roles('ADMIN')
    @Delete(':layoutId/seats/:seatId')
    removeSeat(
        @Param('layoutId') layoutId: string,
        @Param('seatId') seatId: string,
    ) {
        return this.seatLayoutService.removeSeat(layoutId, seatId);
    }

    // =========================================
    // COPY TEMPLATE
    // =========================================

    // POST /seat-layout/:templateId/copy
    @Roles('ADMIN')
    @Post(':templateId/copy')
    copyTemplate(
        @Param('templateId') templateId: string,
        @Body() dto: CopySeatLayoutDto,
    ) {
        return this.seatLayoutService.copyTemplate(
        templateId,
        dto,
        );
    }

    // PATCH /seat-layout/:id/activate
    @Roles('ADMIN')
    @Patch(':id/activate')
    activate(@Param('id') id: string) {
        return this.seatLayoutService.activate(id);
    }

    // PATCH /seat-layout/:id/archive
    @Roles('ADMIN')
    @Patch(':id/archive')
    archive(@Param('id') id: string) {
        return this.seatLayoutService.archive(id);
    }

}
