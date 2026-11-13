
import {
    Controller,
    Get,
    Query,
    Param
} from '@nestjs/common';

import { TripService } from './trip.service';
import { PublicTripSearchDto } from './dto/public-trip-search.dto';

import { PublicTripSeatsDto } from './dto/public-trip-seats.dto';

@Controller('trips/public')
export class PublicTripController {
    constructor(
        private readonly tripService: TripService,
    ) {}

    // Tìm các chuyến xe phù hợp với điểm đón, điểm trả và ngày khởi hành của khách.
    @Get('search')
    searchTrips(@Query() query: PublicTripSearchDto) {
        return this.tripService.searchPublicTrips(query);
    }

    // Lấy sơ đồ ghế và trạng thái ghế theo đoạn đường khách muốn đặt.
    @Get(':tripId/seats')
    getTripSeats(
        @Param('tripId') tripId: string,
        @Query() query: PublicTripSeatsDto,
    ) {
        return this.tripService.getPublicTripSeats(
            tripId,
            query,
        );
    }
}
