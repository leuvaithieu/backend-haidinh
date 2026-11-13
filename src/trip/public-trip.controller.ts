
import {
    Controller,
    Get,
    Query,
} from '@nestjs/common';

import { TripService } from './trip.service';
import { PublicTripSearchDto } from './dto/public-trip-search.dto';

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
}
