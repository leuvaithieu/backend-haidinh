
import {
    Controller,
    Get,
    Query,
} from '@nestjs/common';

import { PricingService } from './pricing.service';
import { PublicPriceQuoteDto } from './dto/public-price-quote.dto';

@Controller('pricing/public')
export class PublicPricingController {
    constructor(
        private readonly pricingService: PricingService,
    ) {}

    // Tính giá vé công khai theo chuyến xe, chiều đi và điểm đón trả.
    @Get('quote')
    async calculatePrice(
        @Query() query: PublicPriceQuoteDto,
    ) {
        return this.pricingService.calculatePrice({
            tripId: query.tripId,
            direction: query.direction,
            pickupTripRoutePointId:
                query.pickupTripRoutePointId,
            dropoffTripRoutePointId:
                query.dropoffTripRoutePointId,
            pickupServicePointId:
                query.pickupServicePointId,
            dropoffServicePointId:
                query.dropoffServicePointId,
        });
    }
}
