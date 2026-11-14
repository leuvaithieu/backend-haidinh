import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {CreateTripDto, TripPointScheduleDto} from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';

import { PublicTripSearchDto } from './dto/public-trip-search.dto';
import { PublicTripSeatsDto } from './dto/public-trip-seats.dto';


@Injectable()
export class TripService {
    constructor(private prisma:PrismaService){}

    
    private calculatePointTimes(
        points: {routePointId:string}[],
        departure: Date,
        routePoints: {
            id: string;
            sequence: number;
        }[],
        segments: {
            fromRoutePointId: string;
            toRoutePointId: string;
            travelDurationMinutes: number;
        }[],
    ): Date[] {
        const result: Date[] = [new Date(departure)];

        for (let i = 1; i < points.length; i++) {
            const fromId = points[i - 1].routePointId;
            const toId = points[i].routePointId;

            const fromPoint = routePoints.find(
                (point) => point.id === fromId,
            );

            const toPoint = routePoints.find(
                (point) => point.id === toId,
            );

            if (!fromPoint || !toPoint) {
                throw new BadRequestException(
                    'Không tìm thấy điểm tuyến để tính thời gian!',
                );
            }

            if (fromPoint.sequence === toPoint.sequence) {
                throw new BadRequestException(
                    'Hai điểm liên tiếp không được trùng nhau!',
                );
            }

            // Chiều đi: sequence tăng.
            // Chiều về: sequence giảm.
            const direction =
                fromPoint.sequence < toPoint.sequence ? 1 : -1;

            let totalMinutes = 0;

            for (
                let sequence = fromPoint.sequence;
                sequence !== toPoint.sequence;
                sequence += direction
            ) {
                const nextSequence = sequence + direction;

                const currentPoint = routePoints.find(
                    (point) => point.sequence === sequence,
                );

                const nextPoint = routePoints.find(
                    (point) => point.sequence === nextSequence,
                );

                if (!currentPoint || !nextPoint) {
                    throw new BadRequestException(
                        'Thứ tự hai điểm không liên tục!',
                    );
                }

                // Tìm chặng theo cả hai hướng, chỉ cần lưu một lần.
                const segment = segments.find(
                    (item) =>
                        (
                            item.fromRoutePointId === currentPoint.id &&
                            item.toRoutePointId === nextPoint.id
                        ) ||
                        (
                            item.fromRoutePointId === nextPoint.id &&
                            item.toRoutePointId === currentPoint.id
                        ),
                );

                if (!segment) {
                    throw new BadRequestException(
                        `Chưa cấu hình thời gian chặng ${currentPoint.id} - ${nextPoint.id}!`,
                    );
                }

                totalMinutes += segment.travelDurationMinutes;
            }

            result.push(
                new Date(
                    result[i - 1].getTime() +
                        totalMinutes * 60 * 1000,
                ),
            );
        }

        return result;
    }


    private shiftScheduleTimes(
        currentTimes:Date[],
        oldDeparture: Date,
        newDeparture: Date,
    ):Date[] {
        const difference = newDeparture.getTime() - oldDeparture.getTime();

        return currentTimes.map(
            (time)=> new Date(time.getTime() + difference)
        )
    }

    async findAll(){
        return this.prisma.trip.findMany({
            orderBy:{
                createdAt:'desc'
            },
            include:{
                route: true,
                vehicle: true,
                driver1: true,
                driver2: true,
                assistant1: true,
                assistant2: true,
                tripRoutePoints: {
                    orderBy: [
                        { direction: 'asc' },
                        { sequence: 'asc' },
                    ],
                },
                createdBy: {
                    select:{
                        id:true,
                        username:true,
                        name:true,
                        role:true,
                    }
                }
            }
        })
    }

    async findOne(id:string){
        return this.prisma.trip.findUnique({
            where:{
                id
            },
            include:{
                route: true,
                vehicle: true,
                driver1: true,
                driver2: true,
                assistant1: true,
                assistant2: true,
                createdBy: {
                    select:{
                        id:true,
                        username:true,
                        name:true,
                        role:true,
                    }
                },
                tripRoutePoints:{
                    orderBy:[
                        {direction:'asc'},
                        {sequence:'asc'},
                    ]
                }
            },
        })
    }

    async create(data: CreateTripDto, userId: string) {
        const vehicle = await this.prisma.vehicle.findUnique({
            where: { id: data.vehicleId },
            include: {
                seatLayout: {
                    include: {
                        seats: {
                            where: {
                                isActive: true,
                            },
                            orderBy: [
                                { level: 'asc' },
                                { row: 'asc' },
                                { column: 'asc' },
                            ],
                            select: {
                                id: true,
                                code: true,
                            },
                        },
                    },
                },
            },
        });
        

        if(!vehicle){
            throw new BadRequestException('Không tìm thấy xe !');
        }

        if(vehicle.status !== 'ACTIVE'){
            throw new BadRequestException(
                `Xe ${vehicle.name} - ${vehicle.licensePlate} đang ngừng hoạt động, không thể phân công chuyến !`
            )
        }

        // Kiểm tra sơ đồ ghế của xe trước khi tạo chuyến.
        if (
            !vehicle.seatLayout ||
            vehicle.seatLayout.status !== 'ACTIVE' ||
            vehicle.seatLayout.isTemplate ||
            vehicle.seatLayout.seats.length === 0
        ) {
            throw new BadRequestException(
                'Xe chưa có sơ đồ ghế hoạt động hoặc sơ đồ ghế không có ghế hợp lệ',
            );
        }

        const drivers = await this.prisma.driver.findMany({
            where:{
                id:{
                    in:[data.driver1Id, data.driver2Id],
                },
            },
            select:{
                id:true,
                name:true,
                status:true,
                licenseExpiry:true,
            },
        });

        if(drivers.length !==2){
            throw new BadRequestException('Không tìm thấy đầy đủ thông tin hai lái xe!')
        }

        const inactiveDriver = drivers.find(
            (driver)=>driver.status !=='ACTIVE',
        );

        if(inactiveDriver){
            throw new BadRequestException(
                ` Lái xe ${inactiveDriver.name} đang ngừng hoạt dộng, không thể phân công chuyến !`
            )
        }

        if (data.driver1Id === data.driver2Id) {
            throw new BadRequestException(
            'Hai lái xe không được trùng nhau !'
            );
        }

        if (
            data.assistant2Id &&
            data.assistant1Id === data.assistant2Id
        ) {
            throw new BadRequestException(
            'Hai phụ xe không được trùng nhau !'
            );
        }

        const assistantIds = [
            data.assistant1Id,
            ...(data.assistant2Id ? [data.assistant2Id]:[]),
        ];

        const assistants = await this.prisma.assistant.findMany({
            where:{
                id: {
                    in: assistantIds,
                },
            },
            select:{
                id:true,
                name:true,
                status:true,
            },
        });

        if(assistants.length !== assistantIds.length){
            throw new BadRequestException('Không tìm thấy đầy đủ thông tin phụ xe được phân công !');
        }

        const inactiveAssistant = assistants.find(
            (assistant) => assistant.status !=='ACTIVE',
        );

        if(inactiveAssistant){
            throw new BadRequestException(
                ` Phụ xe ${inactiveAssistant.name} đang ngừng hoạt động, không thể phân công chuyến này !`
            )
        }

        const route = await this.prisma.route.findUnique({
            where:{
                id: data.routeId,
            },
            include:{
                routePoints:{
                    orderBy:{
                        sequence:'asc'
                    },
                },
            },
        });

        if(!route){
            throw new BadRequestException('Không tìm thấy tuyến xe !')
        };

        const segments = await this.prisma.routeSegment.findMany({
            where:{
                routeId: data.routeId,
                scheduleType: data.scheduleType,
            },
            select:{
                fromRoutePointId:true,
                toRoutePointId:true,
                travelDurationMinutes:true,
            }
        })
        
        if(route.routePoints.length < 2){
            throw new BadRequestException('Tuyến xe phải có ít nhất hai điểm tuyến!');
        }
        
        //Chiều đi: điểm tuyến theo sequence tăng dần.
        const outboundSchedulePoints = route.routePoints.map((point)=>({
            routePointId: point.id,
        }));

        //chiều về: đào ngược thứ tự các điểm tuyến.
        const returnSchedulePoints = [...route.routePoints]
            .reverse()
            .map((point)=>({
                routePointId: point.id,
            }))
        ;

        const outboundTimes = this.calculatePointTimes(
            outboundSchedulePoints,
            new Date(data.plannedDeparture),
            route.routePoints,
            segments,
        );
        const returnTimes = this.calculatePointTimes(
            returnSchedulePoints,
            new Date(data.returnPlannedDeparture),
            route.routePoints,
            segments
        );

        //Kiểm tra lái xe phải còn hạn cho đến khi chuyến kết thúc
        const journeyEnd = returnTimes[returnTimes.length - 1];

        const expiriedDriver = drivers.find(
            (driver)=>!driver.licenseExpiry || new Date(driver.licenseExpiry) < journeyEnd
        );

        if(expiriedDriver){
            throw new BadRequestException(
                `GPLX của tài xế ${expiriedDriver.name} đã hết hạn trước khi kết thúc chuyến này !`
            )
        }

        const outboundLastTime = outboundTimes[outboundTimes.length - 1];

        const returnDeparture = new Date(data.returnPlannedDeparture);

        if (returnDeparture <= outboundLastTime){
            throw new BadRequestException('Giờ xuất phát chiều về phải sau khi xe đến điểm cuối của chiều đi !')
        }

        const newDeparture = new Date(data.plannedDeparture);
        const newArrival = returnTimes[returnTimes.length - 1];

        const conflictingTrip = await this.prisma.trip.findFirst({
            where:{
                vehicleId: data.vehicleId,
                status:{
                    not:'CANCELLED',
                },
                plannedDeparture:{
                    lt:newArrival,
                },
                OR: [
                    {
                        plannedArrival: null,
                    },
                    {
                        plannedArrival: {
                            gt: newDeparture,
                        },
                    },
                ],
            },
        });

        if(conflictingTrip){
            throw new BadRequestException(
                `Xe đã được phân công chuyến khác trong khoảng thời gian này! Mã chuyến : ${conflictingTrip.id},`
            );
        }

        const conflictingDriverTrip = await this.prisma.trip.findFirst({
            where:{
                status:{
                    not:'CANCELLED',
                },
                AND:[
                    {
                        OR:[
                            {driver1Id:{
                                in:[
                                    data.driver1Id,
                                    data.driver2Id,
                                ]
                            }},
                            {
                                driver2Id:{
                                    in:[
                                        data.driver1Id,
                                        data.driver2Id,
                                    ]
                                }
                            }
                        ]
                    },
                    {
                        plannedDeparture:{
                            lt: newArrival,
                        },
                    },
                    {
                        OR:[
                            {plannedArrival : null},
                            {
                                plannedArrival:{
                                    gt: newDeparture,
                                },
                            },
                        ]
                    },
                ],
            },
            select:{
                id: true,
                driver1Id: true,
                driver2Id: true,
                plannedDeparture : true,
                plannedArrival : true,
            },
        });

        if(conflictingDriverTrip){
            throw new BadRequestException(
                `Tài xế đã được phân công chuyến khác trong khoảng thời gian này! Mã chuyến: ${conflictingDriverTrip.id} !`
            )
        }

       
        
        const conflictingAssistantTrip = await this.prisma.trip.findFirst({
            where: {
                status: {
                    not: 'CANCELLED',
                },
                AND: [
                    {
                        OR: [
                            { assistant1Id: { in: assistantIds } },
                            { assistant2Id: { in: assistantIds } },
                        ],
                    },
                    {
                        plannedDeparture: {
                            lt: newArrival,
                        },
                    },
                    {
                        OR: [
                            { plannedArrival: null },
                            {
                                plannedArrival: {
                                    gt: newDeparture,
                                },
                            },
                        ],
                    },
                ],
            },
            select: {
                id: true,
            },
        });

        if (conflictingAssistantTrip) {
            throw new BadRequestException(
                `Phụ xe đã được phân công chuyến khác trong khoảng thời gian này! Mã chuyến: ${conflictingAssistantTrip.id}`,
            );
        }


        const outboundSchedule = outboundSchedulePoints.map((point, index)=>({
            routePointId : point.routePointId,
            pointName: route.routePoints.find(
                (routePoint)=> routePoint.id === point.routePointId,
            )!.name,
            direction:'OUTBOUND' as const,
            sequence: index + 1,
            plannedTime : outboundTimes[index]
        }));

        const returnSchedule = returnSchedulePoints.map((point, index)=>({
            routePointId : point.routePointId,
            pointName : route.routePoints.find(
                (routePoint)=> routePoint.id === point.routePointId,
            )!.name,
            direction : 'RETURN' as const,
            sequence : index + 1,
            plannedTime: returnTimes[index]
        }))

        return await this.prisma.trip.create({
            data: {
                routeId: data.routeId,
                scheduleType: data.scheduleType,
                vehicleId: data.vehicleId,
                driver1Id: data.driver1Id,
                driver2Id: data.driver2Id,
                assistant1Id: data.assistant1Id,
                assistant2Id: data.assistant2Id ?? null,
                plannedDeparture: new Date(data.plannedDeparture),
                returnPlannedDeparture : new Date(data.returnPlannedDeparture),
                plannedArrival : returnTimes[returnTimes.length - 1],
                tripRoutePoints:{create:[...outboundSchedule, ...returnSchedule]},
                // Tạo danh sách ghế cho chuyến từ các ghế đang hoạt động của xe.
                tripSeats: {
                    create: vehicle.seatLayout.seats.map((seat) => ({
                        seatId: seat.id,
                    })),
                },
                createdById: userId,
            },
        });
    }

    // Tìm chuyến công khai theo điểm đón, điểm trả và ngày khởi hành.
    async searchPublicTrips(query: PublicTripSearchDto) {
        if (query.fromRoutePointId === query.toRoutePointId) {
            throw new BadRequestException(
                'Điểm đón và điểm trả không được trùng nhau',
            );
        }

        const routePoints = await this.prisma.routePoint.findMany({
            where: {
                id: {
                    in: [
                        query.fromRoutePointId,
                        query.toRoutePointId,
                    ],
                },
            },
            select: {
                id: true,
                routeId: true,
                name: true,
                sequence: true,
                route: {
                    select: {
                        id: true,
                        name: true,
                        websiteContent: {
                            select: {
                                title: true,
                                isPublished: true,
                            },
                        },
                    },
                },
            },
        });

        if (routePoints.length !== 2) {
            throw new NotFoundException(
                'Không tìm thấy điểm đón hoặc điểm trả',
            );
        }

        const pickup = routePoints.find(
            (point) => point.id === query.fromRoutePointId,
        );

        const dropoff = routePoints.find(
            (point) => point.id === query.toRoutePointId,
        );

        if (!pickup || !dropoff) {
            throw new NotFoundException(
                'Không tìm thấy điểm đón hoặc điểm trả',
            );
        }

        if (pickup.routeId !== dropoff.routeId) {
            throw new BadRequestException(
                'Điểm đón và điểm trả phải thuộc cùng một tuyến',
            );
        }

        if (!pickup.route.websiteContent?.isPublished) {
            throw new NotFoundException(
                'Tuyến đường hiện chưa được công khai',
            );
        }

        const validDirection =
            query.direction === 'OUTBOUND'
                ? pickup.sequence < dropoff.sequence
                : pickup.sequence > dropoff.sequence;

        if (!validDirection) {
            throw new BadRequestException(
                'Thứ tự điểm đón và điểm trả không phù hợp với chiều di chuyển',
            );
        }

        // Xác định khoảng thời gian tìm kiếm theo ngày Việt Nam (UTC+7).
        const startOfDay = new Date(
            `${query.date}T00:00:00+07:00`,
        );

        if (Number.isNaN(startOfDay.getTime())) {
            throw new BadRequestException(
                'Ngày khởi hành không hợp lệ',
            );
        }

        const endOfDay = new Date(
            startOfDay.getTime() + 24 * 60 * 60 * 1000,
        );

        const pickupSchedules =
            await this.prisma.tripRoutePoint.findMany({
                where: {
                    routePointId: pickup.id,
                    direction: query.direction,
                    plannedTime: {
                        gte: startOfDay,
                        lt: endOfDay,
                    },
                    trip: {
                        routeId: pickup.routeId,
                        status: 'SCHEDULED',
                        vehicle: {
                            status: 'ACTIVE',
                        },
                    },
                },
                orderBy: {
                    plannedTime: 'asc',
                },
                select: {
                    id: true,
                    sequence: true,
                    plannedTime: true,
                    trip: {
                        select: {
                            id: true,
                            route: {
                                select: {
                                    id: true,
                                    name: true,
                                    websiteContent: {
                                        select: {
                                            title: true,
                                        },
                                    },
                                },
                            },
                            vehicle: {
                                select: {
                                    name: true,
                                    vehicleType: true,
                                    seatCount: true,
                                    seatLayout: {
                                        select: {
                                            status: true,
                                            isTemplate: true,
                                        },
                                    },
                                },
                            },
                            tripRoutePoints: {
                                where: {
                                    routePointId: dropoff.id,
                                    direction: query.direction,
                                },
                                select: {
                                    id: true,
                                    sequence: true,
                                    plannedTime: true,
                                },
                            },
                        },
                    },
                },
            });

        return pickupSchedules
            .map((schedule) => {
                const trip = schedule.trip;

                // Chiều đi có sequence tăng, chiều về có sequence giảm.
                const dropoffSchedule = trip.tripRoutePoints.find(
                    (point) => point.sequence > schedule.sequence,
                );

                const layout = trip.vehicle.seatLayout;

                if (
                    !dropoffSchedule ||
                    !layout ||
                    layout.status !== 'ACTIVE' ||
                    layout.isTemplate
                ) {
                    return null;
                }

                return {
                    tripId: trip.id,
                    route: {
                        id: trip.route.id,
                        name: trip.route.name,
                        title:
                            trip.route.websiteContent?.title ??
                            trip.route.name,
                    },
                    direction: query.direction,
                    pickup: {
                        tripRoutePointId: schedule.id,
                        routePointId: pickup.id,
                        name: pickup.name,
                        plannedTime: schedule.plannedTime,
                    },
                    dropoff: {
                        tripRoutePointId: dropoffSchedule.id,
                        routePointId: dropoff.id,
                        name: dropoff.name,
                        plannedTime: dropoffSchedule.plannedTime,
                    },
                    vehicle: {
                        name: trip.vehicle.name,
                        vehicleType: trip.vehicle.vehicleType,
                        seatCount: trip.vehicle.seatCount,
                    },
                };
            })
            .filter((trip) => trip !== null);
    }

    // Lấy sơ đồ ghế công khai và xác định ghế còn trống theo đoạn đường khách chọn.
    async getPublicTripSeats(
        tripId: string,
        query: PublicTripSeatsDto,
    ) {
        if (
            query.pickupTripRoutePointId ===
            query.dropoffTripRoutePointId
        ) {
            throw new BadRequestException(
                'Điểm đón và điểm trả không được trùng nhau',
            );
        }

        const now = new Date();

        const trip = await this.prisma.trip.findUnique({
            where: {
                id: tripId,
            },
            select: {
                id: true,
                status: true,
                route: {
                    select: {
                        websiteContent: {
                            select: {
                                isPublished: true,
                            },
                        },
                    },
                },
                vehicle: {
                    select: {
                        status: true,
                        seatLayout: {
                            select: {
                                id: true,
                                name: true,
                                status: true,
                                isTemplate: true,
                                seats: {
                                    where: {
                                        isActive: true,
                                    },
                                    orderBy: [
                                        { level: 'asc' },
                                        { row: 'asc' },
                                        { column: 'asc' },
                                    ],
                                    select: {
                                        id: true,
                                        code: true,
                                        label: true,
                                        type: true,
                                        level: true,
                                        row: true,
                                        column: true,
                                    },
                                },
                            },
                        },
                    },
                },
                tripRoutePoints: {
                    where: {
                        id: {
                            in: [
                                query.pickupTripRoutePointId,
                                query.dropoffTripRoutePointId,
                            ],
                        },
                        direction: query.direction,
                    },
                    select: {
                        id: true,
                        pointName: true,
                        direction: true,
                        sequence: true,
                        plannedTime: true,
                    },
                },
                tripSeats: {
                    select: {
                        seatId: true,
                        seatAllocations: {
                            where: {
                                direction: query.direction,
                                OR: [
                                    {
                                        status: 'BOOKED',
                                    },
                                    {
                                        status: 'HELD',
                                        holdExpiresAt: {
                                            gt: now,
                                        },
                                    },
                                ],
                            },
                            select: {
                                pickupSequence: true,
                                dropoffSequence: true,
                                status: true,
                            },
                        },
                    },
                },
            },
        });

        if (!trip) {
            throw new NotFoundException(
                'Không tìm thấy chuyến xe',
            );
        }

        if (trip.status !== 'SCHEDULED') {
            throw new BadRequestException(
                'Chuyến xe hiện không nhận đặt vé',
            );
        }

        if (
            !trip.route.websiteContent?.isPublished
        ) {
            throw new NotFoundException(
                'Tuyến đường hiện chưa được công khai',
            );
        }

        if (trip.vehicle.status !== 'ACTIVE') {
            throw new BadRequestException(
                'Xe hiện không hoạt động',
            );
        }

        const layout = trip.vehicle.seatLayout;

        if (
            !layout ||
            layout.status !== 'ACTIVE' ||
            layout.isTemplate
        ) {
            throw new NotFoundException(
                'Xe chưa có sơ đồ ghế hoạt động',
            );
        }

        const pickup = trip.tripRoutePoints.find(
            (point) =>
                point.id === query.pickupTripRoutePointId,
        );

        const dropoff = trip.tripRoutePoints.find(
            (point) =>
                point.id === query.dropoffTripRoutePointId,
        );

        if (!pickup || !dropoff) {
            throw new BadRequestException(
                'Điểm đón hoặc điểm trả không thuộc lịch trình chuyến xe',
            );
        }

        if (pickup.sequence >= dropoff.sequence) {
            throw new BadRequestException(
                'Thứ tự điểm đón và điểm trả không hợp lệ',
            );
        }

        const tripSeatMap = new Map(
            trip.tripSeats.map((tripSeat) => [
                tripSeat.seatId,
                tripSeat,
            ]),
        );

        
        // Xác định trạng thái ghế theo phân bổ trên đoạn đường khách chọn.
        const seats = layout.seats.map((seat) => {
            const tripSeat = tripSeatMap.get(seat.id);

            const overlappingAllocation =
                tripSeat?.seatAllocations.find(
                    (allocation) =>
                        allocation.pickupSequence < dropoff.sequence &&
                        allocation.dropoffSequence > pickup.sequence,
                );

            const seatStatus = overlappingAllocation
                ? overlappingAllocation.status
                : tripSeat
                    ? 'AVAILABLE'
                    : 'UNAVAILABLE';

            return {
                id: seat.id,
                code: seat.code,
                label: seat.label,
                type: seat.type,
                level: seat.level,
                row: seat.row,
                column: seat.column,
                isAvailable: seatStatus === 'AVAILABLE',
                status: seatStatus,
            };
        });

        return {
            tripId: trip.id,
            direction: query.direction,
            pickup: {
                id: pickup.id,
                name: pickup.pointName,
                sequence: pickup.sequence,
                plannedTime: pickup.plannedTime,
            },
            dropoff: {
                id: dropoff.id,
                name: dropoff.pointName,
                sequence: dropoff.sequence,
                plannedTime: dropoff.plannedTime,
            },
            layout: {
                id: layout.id,
                name: layout.name,
            },
            totalSeats: seats.length,
            availableSeats: seats.filter(
                (seat) => seat.isAvailable,
            ).length,
            seats,
        };
    }
    
    async update(id: string, data: UpdateTripDto) {
        const currentTrip = await this.prisma.trip.findUnique({
            where: { id },
        });
        
        if(!currentTrip){
            throw new BadRequestException('Không tìm thấy chuyến xe !');
        }

        if(
            data.scheduleType !== undefined && data.scheduleType !== currentTrip.scheduleType
        ){
            throw new BadRequestException('Không hỗ trợ đổi loại lịch khi cập nhật chuyến xe!')
        }

        const vehicleId = data.vehicleId ?? currentTrip.vehicleId;

        const vehicle = await this.prisma.vehicle.findUnique({
            where: {
                id: vehicleId,
            },
            include: {
                seatLayout: {
                    include: {
                        seats: {
                            where: {
                                isActive: true,
                            },
                            orderBy: [
                                { level: 'asc' },
                                { row: 'asc' },
                                { column: 'asc' },
                            ],
                        },
                    },
                },
            },
        });

        if (!vehicle) {
            throw new BadRequestException('Không tìm thấy xe được phân công!');
        }

        if (vehicle.status !== 'ACTIVE') {
            throw new BadRequestException(
                `Xe ${vehicle.name} - ${vehicle.licensePlate} đang ngừng hoạt động, không thể phân công chuyến!`,
            );
        }

        if (
            !vehicle.seatLayout ||
            vehicle.seatLayout.status !== 'ACTIVE' ||
            vehicle.seatLayout.isTemplate ||
            vehicle.seatLayout.seats.length === 0
        ) {
            throw new BadRequestException(
                'Xe chưa có sơ đồ ghế hoạt động hợp lệ!',
            );
        }

        // Tạm thời chưa cho đổi tuyến khi chưa xử lý việc thay thế lịch trình.
        if (data.routeId && data.routeId !== currentTrip.routeId) {
            throw new BadRequestException(
                'Chưa hỗ trợ đổi tuyến khi cập nhật chuyến xe!',
            );
        }

        // Kiểm tra tài xế và phụ xe không bị trùng.
        const driver1Id = data.driver1Id ?? currentTrip.driver1Id;
        const driver2Id = data.driver2Id ?? currentTrip.driver2Id;

        const drivers = await this.prisma.driver.findMany({
            where :{
                id: {
                    in:[driver1Id, driver2Id],
                },
            },
            select:{
                id:true,
                name:true,
                status:true,
                phone:true,
                licenseExpiry:true,
            },
        });

        if(drivers.length !==2){
            throw new BadRequestException('Không tìm thấy đầy đủ thông tin hai lái xe !');
        }

        const inactiveDriver = drivers.find(
            (driver)=> driver.status !== 'ACTIVE'
        );

        if(inactiveDriver){
            throw new BadRequestException(
                ` Lái xe ${inactiveDriver.name} đang ngừng hoạt động, không thể phân công chuyến này !`
            );
        }

        const assistant1Id = data.assistant1Id ?? currentTrip.assistant1Id;
        const assistant2Id = data.assistant2Id !== undefined ? data.assistant2Id : currentTrip.assistant2Id;

        const assistantIds = [assistant1Id,...(assistant2Id ? [assistant2Id]:[])];

        const assistants =  await this.prisma.assistant.findMany({
            where:{
                id:{
                    in:assistantIds,
                },
            },
            select:{
                id:true,
                name:true,
                status:true,
                phone:true,
            },
        });

        if(assistants.length !== assistantIds.length){
            throw new BadRequestException(
                'Không thể tìm thấy đầy đủ thông tin phụ xe được phân công !'
            );
        }

        const inactiveAssistant = assistants.find(
            (assistant)=> assistant.status !== 'ACTIVE',
        );

        if(inactiveAssistant){
            throw new BadRequestException(
                ` Phụ xe ${inactiveAssistant.name} đã ngừng hoạt động, không thể phân công chuyến này !`
            )
        }

        if (driver1Id === driver2Id) {
            throw new BadRequestException(
                'Hai lái xe không được trùng nhau!',
            );
        }

        if (assistant2Id && assistant1Id === assistant2Id) {
            throw new BadRequestException(
                'Hai phụ xe không được trùng nhau!',
            );
        }

        // Lấy lịch trình hiện tại của cả hai chiều.
        const currentSchedule = await this.prisma.tripRoutePoint.findMany({
            where: {
                tripId: id,
                direction: 'OUTBOUND',
            },
            orderBy: {
                sequence: 'asc',
            },
        });

        const currentReturnSchedule =
            await this.prisma.tripRoutePoint.findMany({
                where: {
                    tripId: id,
                    direction: 'RETURN',
                },
                orderBy: {
                    sequence: 'asc',
                },
        });

        const routePoints = await this.prisma.routePoint.findMany({
            where:{
                routeId:currentTrip.routeId,
            },
            select:{
                id:true,
                name:true,
                sequence:true,
                defaultTime:true,
            }
        });

        const segments = await this.prisma.routeSegment.findMany({
            where:{
                routeId: currentTrip.routeId,
                scheduleType: currentTrip.scheduleType,
            },
            select:{
                fromRoutePointId:true,
                toRoutePointId:true,
                travelDurationMinutes:true,
            }
        })

        const buildScheduleData = (
            points : TripPointScheduleDto[],
            times: Date[],
            direction : 'OUTBOUND' | 'RETURN',
        ) => {
            return points.map((point,index)=>{
                const routePoint = routePoints.find(
                    (item)=> item.id === point.routePointId,
                );

                if(!routePoint){
                    throw new BadRequestException(
                        ` Không tìm thấy điểm ${point.routePointId} trên tuyến!`
                    );
                }

                return{
                    tripId:id,
                    routePointId: routePoint.id,
                    pointName: routePoint.name,
                    direction,
                    sequence: index + 1,
                    plannedTime: times[index],
                }
            })
        };

        // Kiểm tra giờ xuất phát chiều đi có thay đổi không.
        const departureChanged = data.plannedDeparture !== undefined && new Date(data.plannedDeparture).getTime() !== currentTrip.plannedDeparture.getTime();

        // Kiểm tra giờ xuất phát chiều về có thay đổi không.
        const returnDepartureChanged = data.returnPlannedDeparture !== undefined && new Date(data.returnPlannedDeparture).getTime() !== (currentTrip.returnPlannedDeparture?.getTime() ?? null);

        const outboundPointsProvided = data.outboundPoints !== undefined;
        const returnPointsProvided = data.returnPoints !== undefined;

        const shouldUpdateOutbound = departureChanged || outboundPointsProvided;
        const shouldUpdateReturn = returnDepartureChanged || returnPointsProvided;

        if(outboundPointsProvided){
            for(const point of data.outboundPoints!){
                const exists = routePoints.some(
                    (routePoint)=> routePoint.id === point.routePointId,
                );
                if(!exists){
                    throw new BadRequestException(
                        ` Điểm ${point.routePointId} không thuộc tuyến này!`
                    );
                }
            }
        }

        if(returnPointsProvided){
            for(const point of data.returnPoints!){
                const exists = routePoints.some(
                    (routePoint)=> routePoint.id === point.routePointId,
                );
                if(!exists){
                    throw new BadRequestException(
                        ` Điểm ${point.routePointId} không thuộc tuyến này!`
                    )
                }
            }
        }

        //Kiểm tra hai đầu tuyến chiều đi và chiều về 
        if(outboundPointsProvided){
            const firstRoutePoint = routePoints[0];
            const lastRoutePoint = routePoints[routePoints.length -1];

            if(
                data.outboundPoints![0].routePointId !== firstRoutePoint.id ||
                data.outboundPoints![data.outboundPoints!.length - 1].routePointId !== lastRoutePoint.id
            ){
                throw new BadRequestException('Lịch chiều đi phải bắt đầu tại đầu tuyến và kết thúc tại cuối tuyến !');
            }
        }

        if(returnPointsProvided){
            const firstRoutePoint = routePoints[0];
            const lastRoutePoint = routePoints[routePoints.length - 1];

            if(
                data.returnPoints![0].routePointId !== lastRoutePoint.id ||
                data.returnPoints![data.returnPoints!.length - 1].routePointId !== firstRoutePoint.id
            ){
                throw new BadRequestException('Lịch chiều về phải bắt đầu tại cuối tuyến và kết thúc tại đầu tuyến!')
            }
        }

        if(outboundPointsProvided && data.outboundPoints!.length < 2){
            throw new BadRequestException('Lịch chiều đi phải có ít nhất 2 điểm tuyến!');
        }

        if(returnPointsProvided && data.returnPoints!.length < 2){
            throw new BadRequestException('Lịch chiều về phải có ít nhất 2 điểm tuyến!');
        }

        if(outboundPointsProvided){
            const outboundIds = data.outboundPoints!.map(
                (point)=> point.routePointId,
            )

            if(new Set(outboundIds).size !== outboundIds.length){
                throw new BadRequestException('Lịch trình chiều đi không được có điểm trùng lặp!')
            }
        }

        if(outboundPointsProvided){
            const sequences = data.outboundPoints!.map((point)=>{
                const routePoint = routePoints.find(
                    (item)=>item.id === point.routePointId,
                );
                return routePoint!.sequence;
            });

            for(let i= 1; i < sequences.length; i++){
                if(sequences[i] <= sequences[i - 1]){
                    throw new BadRequestException('Thứ tự điểm chiều đi không đúng với tuyến đường!')
                }
            }
        }

        if(returnPointsProvided){
            const sequences = data.returnPoints!.map((point)=>{
                const routePoint = routePoints.find(
                    (item)=> item.id === point.routePointId,
                );
                return routePoint!.sequence;
            });

            for(let i= 1; i< sequences.length; i++){
                if(sequences[i]>= sequences[i - 1]){
                    throw new BadRequestException('Thứ tự điểm chiều về không đúng với tuyến đường!')
                }
            }
        }

        if(returnPointsProvided){
            const returnIds = data.returnPoints!.map(
                (point)=>point.routePointId,
            )
            if(new Set(returnIds).size !== returnIds.length){
                throw new BadRequestException('Lịch trình chiều về không được có điểm trùng lặp!')
            }
        }
        
        // lấy giờ mới giờ đi chiều về nếu có cập nhật mới , còn không lấy giờ đã được lưu
        const newDeparture = data.plannedDeparture ? new Date(data.plannedDeparture) : currentTrip.plannedDeparture;
        const newReturnDeparture =  returnDepartureChanged && data.returnPlannedDeparture ? new Date(data.returnPlannedDeparture) : currentTrip.returnPlannedDeparture;

        
        // Tính lại giờ các điểm chiều đi.
        let outboundTimes: Date[] = [];
        if(shouldUpdateOutbound){
            if(outboundPointsProvided){
                if(data.outboundPoints!.length <2){
                    throw new BadRequestException(' Lịch chiều đi phải có ít nhất hai điểm');
                }

                outboundTimes = this.calculatePointTimes(data.outboundPoints!, newDeparture, routePoints, segments);
            }
            else{
                if(currentSchedule.length === 0){
                    throw new BadRequestException('Không có lịch chiều đi để cập nhật !');
                }

                outboundTimes = this.shiftScheduleTimes(
                    currentSchedule.map((point)=> point.plannedTime),
                    currentTrip.plannedDeparture,
                    newDeparture,
                )
            }
        }

        // Tính lại giờ các điểm chiều về.
        let returnTimes: Date[] = [];
        if(shouldUpdateReturn){
            if(returnPointsProvided){
                if(data.returnPoints!.length < 2){
                    throw new BadRequestException('Lịch chiều về phải có ít nhật hai điểm!');
                }

                if(!newReturnDeparture){
                    throw new BadRequestException('Chưa có giờ khởi hành chiều về !')
                }

                returnTimes = this.calculatePointTimes(data.returnPoints!, newReturnDeparture, routePoints, segments);
            }
            else{
                if(!currentTrip.returnPlannedDeparture || currentReturnSchedule.length === 0){
                    throw new BadRequestException('Không có lịch trình chiều về để cập nhật !')
                }

                if(!newReturnDeparture){
                    throw new BadRequestException('Chưa có giờ khởi hành chiều về!')
                }

                returnTimes = this.shiftScheduleTimes(
                    currentReturnSchedule.map((point) => point.plannedTime),
                    currentTrip.returnPlannedDeparture,
                    newReturnDeparture,
                    );
            }
        }
        

        const outboundScheduleData = shouldUpdateOutbound
            ? outboundPointsProvided
                ? buildScheduleData(
                    data.outboundPoints!,
                    outboundTimes,
                    'OUTBOUND',
                )
                : currentSchedule.map((point,index)=>({
                    tripId : id,
                    routePointId : point.routePointId,
                    pointName : point.pointName,
                    direction: 'OUTBOUND' as const,
                    sequence : point.sequence,
                    plannedTime : outboundTimes[index],
                }))
            :[]
        ;

        
        const returnScheduleData = shouldUpdateReturn 
            ? returnPointsProvided
                ? buildScheduleData(
                    data.returnPoints!,
                    returnTimes,
                    'RETURN',
                )
                : currentReturnSchedule.map((point, index)=>({
                    tripId: id,
                    routePointId: point.routePointId,
                    pointName : point.pointName,
                    direction: 'RETURN' as const,
                    sequence : point.sequence,
                    plannedTime : returnTimes[index]
                }))
            :[]
        ;
        //lấy giờ mới điểm đến chiều đi nếu giờ chiều đi có cập nhật mới , nếu không cứ lấy giờ cũ
        const newOutboundArrival =
            shouldUpdateOutbound && outboundTimes.length > 0
                ? outboundTimes[outboundTimes.length - 1]
                : currentSchedule.length > 0
                    ? currentSchedule[currentSchedule.length - 1].plannedTime
                    : null
        ;    

        if(newOutboundArrival && newReturnDeparture && newReturnDeparture <= newOutboundArrival){
            throw new BadRequestException('Giờ khởi hành chiều về phải sau giờ đến điểm cuối chiều đi !')
        }

        const newArrival = shouldUpdateReturn && returnTimes.length > 0 ? returnTimes[returnTimes.length - 1] : currentTrip.plannedArrival;

        const formatTime = (date:Date)=>`${String((date.getUTCHours() + 7) % 24).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;

        if(data.outboundPoints?.length && data.outboundPoints[0].time && data.outboundPoints[0].time !== formatTime(newDeparture)){
            throw new BadRequestException('Giờ điểm đầu chiều đi phải trùng giờ khởi hành !')
        }

        if(data.returnPoints?.length && newReturnDeparture && data.returnPoints[0].time && data.returnPoints[0].time !== formatTime(newReturnDeparture)){
            throw new BadRequestException('Giờ điểm đầu chiều về phải trùng giờ khởi hành chiều về !');
        }

        if(!newArrival){
            throw new BadRequestException('Không thể xác định giờ đến dự kiến của chuyến');
        }

        const expiriedDriver = drivers.find(
            (driver)=> !driver.licenseExpiry || new Date(driver.licenseExpiry) < newArrival
        );

        if(expiriedDriver){
            throw new BadRequestException(
                `GPLX của tài xế ${expiriedDriver.name} đã hết hạn trước khi kết thúc chuyến này !`
            )
        }

        const conflictingTrip = await this.prisma.trip.findFirst({
            where : {
                id:{
                    not: id,
                },
                vehicleId,
                status:{
                    not : 'CANCELLED',
                },
                plannedDeparture:{
                    lt: newArrival,
                },
                OR:[
                    {
                        plannedArrival:null,
                    },
                    {
                        plannedArrival : {
                            gt: newDeparture,
                        },
                    },
                ],
            },
        });

        if(conflictingTrip){
            throw new BadRequestException(
                'Xe đã được phân công cho chuyến khác trong khoảng thời gian này !'
            );
        }

        const conflictingDriverTrip = await this.prisma.trip.findFirst({
            where : {
                id:{
                    not:id,
                },
                status:{
                    not:'CANCELLED',
                },
                AND:[
                    {
                      OR: [
                            {
                                driver1Id: {
                                    in: [driver1Id, driver2Id],
                                },
                            },
                            {
                                driver2Id: {
                                    in: [driver1Id, driver2Id],
                                },
                            },
                        ],
                    },
                    {
                        plannedDeparture:{
                            lt: newArrival,
                        }
                    },
                    {
                        OR: [
                            {
                                plannedArrival: null,
                            },
                            {
                                plannedArrival: {
                                    gt: newDeparture,
                                },
                            },
                        ]
                    }
                ]
            },
            select:{
                id: true,
            }
        });

        if(conflictingDriverTrip){
            throw new BadRequestException(
                ` Tài xế đã được phân công chuyến khác trong khoảng thời gian này! Mã chuyến: ${conflictingDriverTrip.id} !`
            )
        }

        
        const conflictingAssistantTrip = await this.prisma.trip.findFirst({
            where: {
                id: {
                    not: id,
                },
                status: {
                    not: 'CANCELLED',
                },
                AND: [
                    {
                        OR: [
                            { assistant1Id: { in: assistantIds } },
                            { assistant2Id: { in: assistantIds } },
                        ],
                    },
                    {
                        plannedDeparture: {
                            lt: newArrival,
                        },
                    },
                    {
                        OR: [
                            { plannedArrival: null },
                            {
                                plannedArrival: {
                                    gt: newDeparture,
                                },
                            },
                        ],
                    },
                ],
            },
            select: {
                id: true,
            },
        });

        if (conflictingAssistantTrip) {
            throw new BadRequestException(
                `Phụ xe đã được phân công chuyến khác trong khoảng thời gian này! Mã chuyến: ${conflictingAssistantTrip.id}`,
            );
        }

        
        // Giờ đến cuối chuyến được lấy từ điểm cuối chiều về.
        const plannedArrival =  shouldUpdateReturn ? returnTimes[returnTimes.length - 1] : undefined;
        if(shouldUpdateReturn && !plannedArrival){
            throw new BadRequestException('Không xác định được thời gian đến cuối hành trình!');
        }

        return this.prisma.$transaction(async (tx) => {
            // Kiểm tra chuyến đã phát sinh booking hoặc phân bổ ghế chưa.
            const [bookingCount, seatAllocationCount] = await Promise.all([
                tx.booking.count({
                    where: { tripId: id },
                }),
                tx.seatAllocation.count({
                    where: {
                        tripSeat: {
                            tripId: id,
                        },
                    },
                }),
            ]);

            const hasBookingData = bookingCount > 0 || seatAllocationCount > 0;
            const isVehicleChanged = vehicleId !== currentTrip.vehicleId;

            // Không cho đổi xe hoặc lịch trình khi chuyến đã có dữ liệu đặt vé.
            if (hasBookingData && isVehicleChanged) {
                throw new BadRequestException(
                    'Không thể đổi xe vì chuyến đã phát sinh dữ liệu đặt vé!',
                );
            }

            if (hasBookingData && (shouldUpdateOutbound || shouldUpdateReturn)) {
                throw new BadRequestException(
                    'Không thể thay đổi lịch trình vì chuyến đã phát sinh dữ liệu đặt vé!',
                );
            }

            // Đồng bộ danh sách ghế khi chuyến được đổi sang xe khác.
            if (isVehicleChanged) {
                // Xóa danh sách ghế cũ của chuyến.
                await tx.tripSeat.deleteMany({
                    where: {
                        tripId: id,
                    },
                });

                // Tạo danh sách ghế mới theo sơ đồ xe được phân công.
                await tx.tripSeat.createMany({
                    data: vehicle.seatLayout!.seats.map((seat) => ({
                        tripId: id,
                        seatId: seat.id,
                    })),
                });
            }

            const updatedTrip = await tx.trip.update({
                where: { id },
                data: {
                    vehicleId: data.vehicleId,
                    driver1Id: data.driver1Id,
                    driver2Id: data.driver2Id,
                    assistant1Id: data.assistant1Id,
                    assistant2Id: data.assistant2Id,

                    plannedDeparture: departureChanged
                        ? new Date(data.plannedDeparture!)
                        : undefined,

                    returnPlannedDeparture: returnDepartureChanged
                        ? new Date(data.returnPlannedDeparture!)
                        : undefined,

                    plannedArrival,
                },
            });

            // Cập nhật giờ các điểm chiều đi.
            if(shouldUpdateOutbound){
                await tx.tripRoutePoint.deleteMany({
                    where:{
                        tripId:id,
                        direction:'OUTBOUND',
                    },
                });

                if(outboundScheduleData.length > 0){
                    await tx.tripRoutePoint.createMany({
                        data: outboundScheduleData,
                    })
                }
            }

            // Cập nhật giờ các điểm chiều về.
            if(shouldUpdateReturn){
                await tx.tripRoutePoint.deleteMany({
                    where : {
                        tripId : id,
                        direction : 'RETURN',
                    }
                });

                if(returnScheduleData.length > 0){
                    await tx.tripRoutePoint.createMany({
                        data: returnScheduleData,
                    })
                }
            }

            return updatedTrip;
        });
    }


   // Xóa chuyến xe khi chuyến chưa phát sinh dữ liệu đặt vé hoặc phân bổ ghế.
    async remove(id: string) {
        return this.prisma.$transaction(async (tx) => {
            // Kiểm tra chuyến có tồn tại không.
            const trip = await tx.trip.findUnique({
                where: { id },
            });

            if (!trip) {
                throw new BadRequestException('Không tìm thấy chuyến xe!');
            }

            // Kiểm tra booking và phân bổ ghế của chuyến.
            const [bookingCount, seatAllocationCount] = await Promise.all([
                tx.booking.count({
                    where: { tripId: id },
                }),
                tx.seatAllocation.count({
                    where: {
                        tripSeat: {
                            tripId: id,
                        },
                    },
                }),
            ]);

            if (bookingCount > 0) {
                throw new BadRequestException(
                    'Không thể xóa chuyến xe đã phát sinh dữ liệu đặt vé!',
                );
            }

            if (seatAllocationCount > 0) {
                throw new BadRequestException(
                    'Không thể xóa chuyến xe còn dữ liệu phân bổ ghế!',
                );
            }

            // Xóa danh sách ghế thuộc chuyến trước.
            await tx.tripSeat.deleteMany({
                where: { tripId: id },
            });

            // Xóa chuyến xe.
            return tx.trip.delete({
                where: { id },
            });
        });
    }
}
