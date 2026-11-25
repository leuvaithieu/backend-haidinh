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
                seatLayout: true,
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
                seatLayout: true,
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

    // Tạo chuyến từ sơ đồ ghế mẫu; xe và nhân sự có thể phân công sau.
    async create(data: CreateTripDto, userId: string) {
        const seatLayout = await this.prisma.seatLayout.findUnique({
            where: { id: data.seatLayoutId },
            include: {
                seats: {
                    where: { isActive: true },
                    orderBy: [
                        { level: 'asc' },
                        { row: 'asc' },
                        { column: 'asc' },
                    ],
                    select: {
                        id: true,
                        code: true,
                        type: true,
                        level: true,
                        row: true,
                        column: true,
                    },
                },
            },
        });

        if (
            !seatLayout ||
            !seatLayout.isTemplate ||
            seatLayout.status !== 'ACTIVE' ||
            seatLayout.seats.length === 0
        ) {
            throw new BadRequestException(
                'Sơ đồ ghế mẫu không tồn tại, chưa hoạt động hoặc không có ghế hợp lệ!',
            );
        }

        // Kiểm tra xe nếu người dùng đã chọn xe khi tạo chuyến.
        const vehicle = data.vehicleId
            ? await this.prisma.vehicle.findUnique({
                  where: { id: data.vehicleId },
                  include: {
                      seatLayout: {
                          include: {
                              seats: {
                                  where: { isActive: true },
                                  select: {
                                      code: true,
                                      type: true,
                                      level: true,
                                      row: true,
                                      column: true,
                                  },
                              },
                          },
                      },
                  },
              })
            : null;

        if (data.vehicleId && !vehicle) {
            throw new BadRequestException('Không tìm thấy xe!');
        }

        if (vehicle && vehicle.status !== 'ACTIVE') {
            throw new BadRequestException(
                `Xe ${vehicle.name} - ${vehicle.licensePlate} đang ngừng hoạt động!`,
            );
        }

        // Kiểm tra sơ đồ xe có cùng cấu trúc ghế với sơ đồ mẫu.
        if (vehicle) {
            const vehicleLayout = vehicle.seatLayout;
            if (
                !vehicleLayout ||
                vehicleLayout.status !== 'ACTIVE' ||
                vehicleLayout.isTemplate ||
                vehicleLayout.seats.length !== seatLayout.seats.length
            ) {
                throw new BadRequestException(
                    'Sơ đồ ghế của xe không tương thích với sơ đồ mẫu đã chọn!',
                );
            }

            const vehicleSeatMap = new Map(
                vehicleLayout.seats.map((seat) => [
                    seat.code,
                    `${seat.type}|${seat.level}|${seat.row}|${seat.column}`,
                ]),
            );

            const compatible = seatLayout.seats.every(
                (seat) =>
                    vehicleSeatMap.get(seat.code) ===
                    `${seat.type}|${seat.level}|${seat.row}|${seat.column}`,
            );

            if (!compatible) {
                throw new BadRequestException(
                    'Cấu trúc ghế của xe không khớp với sơ đồ mẫu đã chọn!',
                );
            }
        }

        // Kiểm tra tài xế nếu đã được phân công.
        if (
            data.driver1Id &&
            data.driver2Id &&
            data.driver1Id === data.driver2Id
        ) {
            throw new BadRequestException(
                'Hai lái xe không được trùng nhau!',
            );
        }

        const driverIds = [
            ...new Set(
                [data.driver1Id, data.driver2Id].filter(
                    (id): id is string => Boolean(id),
                ),
            ),
        ];

        const drivers = driverIds.length
            ? await this.prisma.driver.findMany({
                  where: { id: { in: driverIds } },
                  select: {
                      id: true,
                      name: true,
                      status: true,
                      licenseExpiry: true,
                  },
              })
            : [];

        if (drivers.length !== driverIds.length) {
            throw new BadRequestException(
                'Không tìm thấy thông tin tài xế được phân công!',
            );
        }

        const inactiveDriver = drivers.find(
            (driver) => driver.status !== 'ACTIVE',
        );

        if (inactiveDriver) {
            throw new BadRequestException(
                `Lái xe ${inactiveDriver.name} đang ngừng hoạt động!`,
            );
        }

        // Kiểm tra phụ xe nếu đã được phân công.
        if (
            data.assistant1Id &&
            data.assistant2Id &&
            data.assistant1Id === data.assistant2Id
        ) {
            throw new BadRequestException(
                'Hai phụ xe không được trùng nhau!',
            );
        }

        const assistantIds = [
            ...new Set(
                [data.assistant1Id, data.assistant2Id].filter(
                    (id): id is string => Boolean(id),
                ),
            ),
        ];

        const assistants = assistantIds.length
            ? await this.prisma.assistant.findMany({
                  where: { id: { in: assistantIds } },
                  select: {
                      id: true,
                      name: true,
                      status: true,
                  },
              })
            : [];

        if (assistants.length !== assistantIds.length) {
            throw new BadRequestException(
                'Không tìm thấy thông tin phụ xe được phân công!',
            );
        }

        const inactiveAssistant = assistants.find(
            (assistant) => assistant.status !== 'ACTIVE',
        );

        if (inactiveAssistant) {
            throw new BadRequestException(
                `Phụ xe ${inactiveAssistant.name} đang ngừng hoạt động!`,
            );
        }

        const route = await this.prisma.route.findUnique({
            where: { id: data.routeId },
            include: {
                routePoints: {
                    orderBy: { sequence: 'asc' },
                },
            },
        });

        if (!route) {
            throw new BadRequestException('Không tìm thấy tuyến xe!');
        }

        if (route.routePoints.length < 2) {
            throw new BadRequestException(
                'Tuyến xe phải có ít nhất hai điểm tuyến!',
            );
        }

        const segments = await this.prisma.routeSegment.findMany({
            where: {
                routeId: data.routeId,
                scheduleType: data.scheduleType,
            },
            select: {
                fromRoutePointId: true,
                toRoutePointId: true,
                travelDurationMinutes: true,
            },
        });

        // Chiều đi theo sequence tăng dần.
        const outboundSchedulePoints = route.routePoints.map((point) => ({
            routePointId: point.id,
        }));

        // Chiều về theo sequence giảm dần.
        const returnSchedulePoints = [...route.routePoints]
            .reverse()
            .map((point) => ({
                routePointId: point.id,
            }));

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
            segments,
        );

        const journeyEnd = returnTimes[returnTimes.length - 1];

        // Chỉ kiểm tra hạn GPLX của tài xế đã được phân công.
        const expiredDriver = drivers.find(
            (driver) =>
                !driver.licenseExpiry ||
                new Date(driver.licenseExpiry) < journeyEnd,
        );

        if (expiredDriver) {
            throw new BadRequestException(
                `GPLX của tài xế ${expiredDriver.name} đã hết hạn trước khi kết thúc chuyến!`,
            );
        }

        const outboundLastTime = outboundTimes[outboundTimes.length - 1];
        const returnDeparture = new Date(data.returnPlannedDeparture);

        if (returnDeparture <= outboundLastTime) {
            throw new BadRequestException(
                'Giờ xuất phát chiều về phải sau khi xe đến điểm cuối của chiều đi!',
            );
        }

        const newDeparture = new Date(data.plannedDeparture);
        const newArrival = journeyEnd;

        // Chỉ kiểm tra trùng lịch xe khi chuyến đã được gán xe.
        if (data.vehicleId) {
            const conflictingTrip = await this.prisma.trip.findFirst({
                where: {
                    vehicleId: data.vehicleId,
                    status: { not: 'CANCELLED' },
                    plannedDeparture: { lt: newArrival },
                    OR: [
                        { plannedArrival: null },
                        { plannedArrival: { gt: newDeparture } },
                    ],
                },
                select: { id: true },
            });

            if (conflictingTrip) {
                throw new BadRequestException(
                    `Xe đã được phân công chuyến khác trong khoảng thời gian này! Mã chuyến: ${conflictingTrip.id}`,
                );
            }
        }

        // Chỉ kiểm tra trùng lịch những tài xế đã được phân công.
        if (driverIds.length > 0) {
            const conflictingDriverTrip =
                await this.prisma.trip.findFirst({
                    where: {
                        status: { not: 'CANCELLED' },
                        AND: [
                            {
                                OR: [
                                    { driver1Id: { in: driverIds } },
                                    { driver2Id: { in: driverIds } },
                                ],
                            },
                            { plannedDeparture: { lt: newArrival } },
                            {
                                OR: [
                                    { plannedArrival: null },
                                    { plannedArrival: { gt: newDeparture } },
                                ],
                            },
                        ],
                    },
                    select: { id: true },
                });

            if (conflictingDriverTrip) {
                throw new BadRequestException(
                    `Tài xế đã được phân công chuyến khác! Mã chuyến: ${conflictingDriverTrip.id}`,
                );
            }
        }

        // Chỉ kiểm tra trùng lịch những phụ xe đã được phân công.
        if (assistantIds.length > 0) {
            const conflictingAssistantTrip =
                await this.prisma.trip.findFirst({
                    where: {
                        status: { not: 'CANCELLED' },
                        AND: [
                            {
                                OR: [
                                    { assistant1Id: { in: assistantIds } },
                                    { assistant2Id: { in: assistantIds } },
                                ],
                            },
                            { plannedDeparture: { lt: newArrival } },
                            {
                                OR: [
                                    { plannedArrival: null },
                                    { plannedArrival: { gt: newDeparture } },
                                ],
                            },
                        ],
                    },
                    select: { id: true },
                });

            if (conflictingAssistantTrip) {
                throw new BadRequestException(
                    `Phụ xe đã được phân công chuyến khác! Mã chuyến: ${conflictingAssistantTrip.id}`,
                );
            }
        }

        const outboundSchedule = outboundSchedulePoints.map(
            (point, index) => ({
                routePointId: point.routePointId,
                pointName: route.routePoints.find(
                    (routePoint) => routePoint.id === point.routePointId,
                )!.name,
                direction: 'OUTBOUND' as const,
                sequence: index + 1,
                plannedTime: outboundTimes[index],
            }),
        );

        const returnSchedule = returnSchedulePoints.map(
            (point, index) => ({
                routePointId: point.routePointId,
                pointName: route.routePoints.find(
                    (routePoint) => routePoint.id === point.routePointId,
                )!.name,
                direction: 'RETURN' as const,
                sequence: index + 1,
                plannedTime: returnTimes[index],
            }),
        );

        return this.prisma.trip.create({
            data: {
                routeId: data.routeId,
                seatLayoutId: data.seatLayoutId,
                scheduleType: data.scheduleType,
                vehicleId: data.vehicleId ?? null,
                driver1Id: data.driver1Id ?? null,
                driver2Id: data.driver2Id ?? null,
                assistant1Id: data.assistant1Id ?? null,
                assistant2Id: data.assistant2Id ?? null,
                plannedDeparture: newDeparture,
                returnPlannedDeparture: returnDeparture,
                plannedArrival: newArrival,
                tripRoutePoints: {
                    create: [...outboundSchedule, ...returnSchedule],
                },
                // Tạo danh sách ghế chuyến từ các ghế hoạt động của sơ đồ mẫu.
                tripSeats: {
                    create: seatLayout.seats.map((seat) => ({
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
        const startOfDay = new Date(`${query.date}T00:00:00+07:00`);

        if (Number.isNaN(startOfDay.getTime())) {
            throw new BadRequestException('Ngày khởi hành không hợp lệ');
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
                        seatLayout: {
                            status: 'ACTIVE',
                            isTemplate: true,
                        },
                    },
                },
                orderBy: { plannedTime: 'asc' },
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
                                        select: { title: true },
                                    },
                                },
                            },
                            vehicle: {
                                select: {
                                    name: true,
                                    vehicleType: true,
                                    seatCount: true,
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

                // Điểm trả phải nằm sau điểm đón trong thứ tự lịch trình.
                const dropoffSchedule = trip.tripRoutePoints.find(
                    (point) => point.sequence > schedule.sequence,
                );

                if (!dropoffSchedule) {
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
                    vehicle: trip.vehicle
                        ? {
                              name: trip.vehicle.name,
                              vehicleType: trip.vehicle.vehicleType,
                              seatCount: trip.vehicle.seatCount,
                          }
                        : null,
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
            where: { id: tripId },
            select: {
                id: true,
                status: true,
                route: {
                    select: {
                        websiteContent: {
                            select: { isPublished: true },
                        },
                    },
                },
                vehicle: {
                    select: {
                        status: true,
                        name: true,
                        vehicleType: true,
                        seatCount: true,
                    },
                },
                seatLayout: {
                    select: {
                        id: true,
                        name: true,
                        status: true,
                        isTemplate: true,
                        seats: {
                            where: { isActive: true },
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
                        seat: {
                            select: {
                                code: true,
                            },
                        },
                        seatAllocations: {
                            where: {
                                direction: query.direction,
                                OR: [
                                    { status: 'BOOKED' },
                                    {
                                        status: 'HELD',
                                        holdExpiresAt: { gt: now },
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
            throw new NotFoundException('Không tìm thấy chuyến xe');
        }

        if (trip.status !== 'SCHEDULED') {
            throw new BadRequestException(
                'Chuyến xe hiện không nhận đặt vé',
            );
        }

        if (!trip.route.websiteContent?.isPublished) {
            throw new NotFoundException(
                'Tuyến đường hiện chưa được công khai',
            );
        }

        // Sơ đồ ghế mẫu là căn cứ hiển thị ghế, không phụ thuộc việc đã phân công xe hay chưa.
        const layout = trip.seatLayout;

        if (
            layout.status !== 'ACTIVE' ||
            !layout.isTemplate ||
            layout.seats.length === 0
        ) {
            throw new NotFoundException(
                'Chuyến xe chưa có sơ đồ ghế mẫu hoạt động',
            );
        }

        const pickup = trip.tripRoutePoints.find(
            (point) => point.id === query.pickupTripRoutePointId,
        );

        const dropoff = trip.tripRoutePoints.find(
            (point) => point.id === query.dropoffTripRoutePointId,
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

        // Đối chiếu ghế bằng mã ghế vì TripSeat cũ có thể tham chiếu ID ghế của sơ đồ xe.
        const tripSeatMap = new Map(
            trip.tripSeats.map((tripSeat) => [
                tripSeat.seat.code,
                tripSeat,
            ]),
        );

        // Xác định trạng thái ghế theo phân bổ trên đoạn đường khách chọn.
        const seats = layout.seats.map((seat) => {
            const tripSeat = tripSeatMap.get(seat.code);

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
            vehicle: trip.vehicle?.status === 'ACTIVE'
                ? {
                      name: trip.vehicle.name,
                      vehicleType: trip.vehicle.vehicleType,
                      seatCount: trip.vehicle.seatCount,
                  }
                : null,
            totalSeats: seats.length,
            availableSeats: seats.filter(
                (seat) => seat.isAvailable,
            ).length,
            seats,
        };
    }



    // Cập nhật phân công xe, nhân sự, sơ đồ ghế và lịch trình của chuyến.
    async update(id: string, data: UpdateTripDto) {
        const currentTrip = await this.prisma.trip.findUnique({
            where: { id },
        });

        if (!currentTrip) {
            throw new NotFoundException('Không tìm thấy chuyến xe!');
        }

        if (
            data.scheduleType !== undefined &&
            data.scheduleType !== currentTrip.scheduleType
        ) {
            throw new BadRequestException(
                'Không hỗ trợ đổi loại lịch khi cập nhật chuyến xe!',
            );
        }

        if (data.routeId && data.routeId !== currentTrip.routeId) {
            throw new BadRequestException(
                'Chưa hỗ trợ đổi tuyến khi cập nhật chuyến xe!',
            );
        }

        const vehicleId =
            data.vehicleId !== undefined
                ? data.vehicleId
                : currentTrip.vehicleId;

        const seatLayoutId =
            data.seatLayoutId ?? currentTrip.seatLayoutId;

        const seatLayout = await this.prisma.seatLayout.findUnique({
            where: { id: seatLayoutId },
            include: {
                seats: {
                    where: { isActive: true },
                    orderBy: [
                        { level: 'asc' },
                        { row: 'asc' },
                        { column: 'asc' },
                    ],
                    select: {
                        id: true,
                        code: true,
                        type: true,
                        level: true,
                        row: true,
                        column: true,
                    },
                },
            },
        });

        if (
            !seatLayout ||
            !seatLayout.isTemplate ||
            seatLayout.status !== 'ACTIVE' ||
            seatLayout.seats.length === 0
        ) {
            throw new BadRequestException(
                'Sơ đồ ghế mẫu không tồn tại, chưa hoạt động hoặc không có ghế hợp lệ!',
            );
        }

        // Chỉ truy vấn và kiểm tra xe khi chuyến đã được gán xe.
        const vehicle = vehicleId
            ? await this.prisma.vehicle.findUnique({
                  where: { id: vehicleId },
                  include: {
                      seatLayout: {
                          include: {
                              seats: {
                                  where: { isActive: true },
                                  select: {
                                      code: true,
                                      type: true,
                                      level: true,
                                      row: true,
                                      column: true,
                                  },
                              },
                          },
                      },
                  },
              })
            : null;

        if (vehicleId && !vehicle) {
            throw new BadRequestException(
                'Không tìm thấy xe được phân công!',
            );
        }

        if (vehicle && vehicle.status !== 'ACTIVE') {
            throw new BadRequestException(
                `Xe ${vehicle.name} - ${vehicle.licensePlate} đang ngừng hoạt động!`,
            );
        }

        // Sơ đồ xe phải tương thích với sơ đồ mẫu đã gắn vào chuyến.
        if (vehicle) {
            const vehicleLayout = vehicle.seatLayout;

            if (
                !vehicleLayout ||
                vehicleLayout.status !== 'ACTIVE' ||
                vehicleLayout.isTemplate ||
                vehicleLayout.seats.length !== seatLayout.seats.length
            ) {
                throw new BadRequestException(
                    'Sơ đồ ghế của xe không tương thích với sơ đồ mẫu của chuyến!',
                );
            }

            const vehicleSeatMap = new Map(
                vehicleLayout.seats.map((seat) => [
                    seat.code,
                    `${seat.type}|${seat.level}|${seat.row}|${seat.column}`,
                ]),
            );

            const compatible = seatLayout.seats.every(
                (seat) =>
                    vehicleSeatMap.get(seat.code) ===
                    `${seat.type}|${seat.level}|${seat.row}|${seat.column}`,
            );

            if (!compatible) {
                throw new BadRequestException(
                    'Cấu trúc ghế của xe không khớp với sơ đồ mẫu của chuyến!',
                );
            }
        }

        const driver1Id =
            data.driver1Id !== undefined
                ? data.driver1Id
                : currentTrip.driver1Id;
        const driver2Id =
            data.driver2Id !== undefined
                ? data.driver2Id
                : currentTrip.driver2Id;
        const assistant1Id =
            data.assistant1Id !== undefined
                ? data.assistant1Id
                : currentTrip.assistant1Id;
        const assistant2Id =
            data.assistant2Id !== undefined
                ? data.assistant2Id
                : currentTrip.assistant2Id;

        if (
            driver1Id &&
            driver2Id &&
            driver1Id === driver2Id
        ) {
            throw new BadRequestException(
                'Hai lái xe không được trùng nhau!',
            );
        }

        if (
            assistant1Id &&
            assistant2Id &&
            assistant1Id === assistant2Id
        ) {
            throw new BadRequestException(
                'Hai phụ xe không được trùng nhau!',
            );
        }

        // Chỉ xác minh những tài xế thực sự được phân công.
        const driverIds = [
            ...new Set(
                [driver1Id, driver2Id].filter(
                    (value): value is string => Boolean(value),
                ),
            ),
        ];

        const drivers = driverIds.length
            ? await this.prisma.driver.findMany({
                  where: { id: { in: driverIds } },
                  select: {
                      id: true,
                      name: true,
                      status: true,
                      licenseExpiry: true,
                  },
              })
            : [];

        if (drivers.length !== driverIds.length) {
            throw new BadRequestException(
                'Không tìm thấy thông tin tài xế được phân công!',
            );
        }

        const inactiveDriver = drivers.find(
            (driver) => driver.status !== 'ACTIVE',
        );

        if (inactiveDriver) {
            throw new BadRequestException(
                `Lái xe ${inactiveDriver.name} đang ngừng hoạt động!`,
            );
        }

        // Chỉ xác minh những phụ xe thực sự được phân công.
        const assistantIds = [
            ...new Set(
                [assistant1Id, assistant2Id].filter(
                    (value): value is string => Boolean(value),
                ),
            ),
        ];

        const assistants = assistantIds.length
            ? await this.prisma.assistant.findMany({
                  where: { id: { in: assistantIds } },
                  select: {
                      id: true,
                      name: true,
                      status: true,
                  },
              })
            : [];

        if (assistants.length !== assistantIds.length) {
            throw new BadRequestException(
                'Không tìm thấy thông tin phụ xe được phân công!',
            );
        }

        const inactiveAssistant = assistants.find(
            (assistant) => assistant.status !== 'ACTIVE',
        );

        if (inactiveAssistant) {
            throw new BadRequestException(
                `Phụ xe ${inactiveAssistant.name} đang ngừng hoạt động!`,
            );
        }

        // Lấy lịch trình hiện tại của cả hai chiều.
        const [currentSchedule, currentReturnSchedule, routePoints, segments] =
            await Promise.all([
                this.prisma.tripRoutePoint.findMany({
                    where: { tripId: id, direction: 'OUTBOUND' },
                    orderBy: { sequence: 'asc' },
                }),
                this.prisma.tripRoutePoint.findMany({
                    where: { tripId: id, direction: 'RETURN' },
                    orderBy: { sequence: 'asc' },
                }),
                this.prisma.routePoint.findMany({
                    where: { routeId: currentTrip.routeId },
                    orderBy: { sequence: 'asc' },
                    select: {
                        id: true,
                        name: true,
                        sequence: true,
                    },
                }),
                this.prisma.routeSegment.findMany({
                    where: {
                        routeId: currentTrip.routeId,
                        scheduleType: currentTrip.scheduleType,
                    },
                    select: {
                        fromRoutePointId: true,
                        toRoutePointId: true,
                        travelDurationMinutes: true,
                    },
                }),
            ]);

        // Tạo dữ liệu lịch trình mới từ các điểm và thời gian đã tính.
        const buildScheduleData = (
            points: TripPointScheduleDto[],
            times: Date[],
            direction: 'OUTBOUND' | 'RETURN',
        ) =>
            points.map((point, index) => {
                const routePoint = routePoints.find(
                    (item) => item.id === point.routePointId,
                );

                if (!routePoint) {
                    throw new BadRequestException(
                        `Điểm ${point.routePointId} không thuộc tuyến này!`,
                    );
                }

                return {
                    tripId: id,
                    routePointId: routePoint.id,
                    pointName: routePoint.name,
                    direction,
                    sequence: index + 1,
                    plannedTime: times[index],
                };
            });

        const departureChanged =
            data.plannedDeparture !== undefined &&
            new Date(data.plannedDeparture).getTime() !==
                currentTrip.plannedDeparture.getTime();

        const returnDepartureChanged =
            data.returnPlannedDeparture !== undefined &&
            new Date(data.returnPlannedDeparture).getTime() !==
                (currentTrip.returnPlannedDeparture?.getTime() ?? null);

        const outboundPointsProvided = data.outboundPoints !== undefined;
        const returnPointsProvided = data.returnPoints !== undefined;

        const shouldUpdateOutbound =
            departureChanged || outboundPointsProvided;
        const shouldUpdateReturn =
            returnDepartureChanged || returnPointsProvided;

        const validateSchedulePoints = (
            points: TripPointScheduleDto[],
            direction: 'OUTBOUND' | 'RETURN',
        ) => {
            if (points.length < 2) {
                throw new BadRequestException(
                    `Lịch ${direction === 'OUTBOUND' ? 'chiều đi' : 'chiều về'} phải có ít nhất 2 điểm tuyến!`,
                );
            }

            const ids = points.map((point) => point.routePointId);

            if (new Set(ids).size !== ids.length) {
                throw new BadRequestException(
                    'Lịch trình không được có điểm tuyến trùng lặp!',
                );
            }

            const sequences = points.map((point) => {
                const routePoint = routePoints.find(
                    (item) => item.id === point.routePointId,
                );

                if (!routePoint) {
                    throw new BadRequestException(
                        `Điểm ${point.routePointId} không thuộc tuyến này!`,
                    );
                }

                return routePoint.sequence;
            });

            for (let index = 1; index < sequences.length; index++) {
                const invalidOrder =
                    direction === 'OUTBOUND'
                        ? sequences[index] <= sequences[index - 1]
                        : sequences[index] >= sequences[index - 1];

                if (invalidOrder) {
                    throw new BadRequestException(
                        `Thứ tự điểm ${direction === 'OUTBOUND' ? 'chiều đi' : 'chiều về'} không đúng với tuyến đường!`,
                    );
                }
            }

            const firstPoint = routePoints[0];
            const lastPoint = routePoints[routePoints.length - 1];

            const expectedFirst =
                direction === 'OUTBOUND' ? firstPoint.id : lastPoint.id;
            const expectedLast =
                direction === 'OUTBOUND' ? lastPoint.id : firstPoint.id;

            if (
                points[0].routePointId !== expectedFirst ||
                points[points.length - 1].routePointId !== expectedLast
            ) {
                throw new BadRequestException(
                    `Lịch ${direction === 'OUTBOUND' ? 'chiều đi' : 'chiều về'} phải đi từ đầu tuyến đến cuối tuyến theo đúng chiều!`,
                );
            }
        };

        if (outboundPointsProvided) {
            validateSchedulePoints(data.outboundPoints!, 'OUTBOUND');
        }

        if (returnPointsProvided) {
            validateSchedulePoints(data.returnPoints!, 'RETURN');
        }

        const newDeparture = data.plannedDeparture
            ? new Date(data.plannedDeparture)
            : currentTrip.plannedDeparture;

        const newReturnDeparture =
            data.returnPlannedDeparture !== undefined
                ? data.returnPlannedDeparture
                    ? new Date(data.returnPlannedDeparture)
                    : null
                : currentTrip.returnPlannedDeparture;

        let outboundTimes: Date[] = [];
        if (shouldUpdateOutbound) {
            if (outboundPointsProvided) {
                outboundTimes = this.calculatePointTimes(
                    data.outboundPoints!,
                    newDeparture,
                    routePoints,
                    segments,
                );
            } else {
                if (currentSchedule.length === 0) {
                    throw new BadRequestException(
                        'Không có lịch chiều đi để cập nhật!',
                    );
                }

                outboundTimes = this.shiftScheduleTimes(
                    currentSchedule.map((point) => point.plannedTime),
                    currentTrip.plannedDeparture,
                    newDeparture,
                );
            }
        }

        let returnTimes: Date[] = [];
        if (shouldUpdateReturn) {
            if (!newReturnDeparture) {
                throw new BadRequestException(
                    'Chưa có giờ khởi hành chiều về!',
                );
            }

            if (returnPointsProvided) {
                returnTimes = this.calculatePointTimes(
                    data.returnPoints!,
                    newReturnDeparture,
                    routePoints,
                    segments,
                );
            } else {
                if (currentReturnSchedule.length === 0) {
                    throw new BadRequestException(
                        'Không có lịch trình chiều về để cập nhật!',
                    );
                }

                if (!currentTrip.returnPlannedDeparture) {
                    throw new BadRequestException(
                        'Chưa có giờ khởi hành chiều về hiện tại!',
                    );
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
                : currentSchedule.map((point, index) => ({
                      tripId: id,
                      routePointId: point.routePointId,
                      pointName: point.pointName,
                      direction: 'OUTBOUND' as const,
                      sequence: point.sequence,
                      plannedTime: outboundTimes[index],
                  }))
            : [];

        const returnScheduleData = shouldUpdateReturn
            ? returnPointsProvided
                ? buildScheduleData(
                      data.returnPoints!,
                      returnTimes,
                      'RETURN',
                  )
                : currentReturnSchedule.map((point, index) => ({
                      tripId: id,
                      routePointId: point.routePointId,
                      pointName: point.pointName,
                      direction: 'RETURN' as const,
                      sequence: point.sequence,
                      plannedTime: returnTimes[index],
                  }))
            : [];

        const newOutboundArrival =
            shouldUpdateOutbound && outboundTimes.length > 0
                ? outboundTimes[outboundTimes.length - 1]
                : currentSchedule.length > 0
                  ? currentSchedule[currentSchedule.length - 1].plannedTime
                  : null;

        if (
            newOutboundArrival &&
            newReturnDeparture &&
            newReturnDeparture <= newOutboundArrival
        ) {
            throw new BadRequestException(
                'Giờ khởi hành chiều về phải sau giờ đến điểm cuối chiều đi!',
            );
        }

        const newArrival =
            shouldUpdateReturn && returnTimes.length > 0
                ? returnTimes[returnTimes.length - 1]
                : currentTrip.plannedArrival;

        const formatTime = (date: Date) =>
            `${String((date.getUTCHours() + 7) % 24).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;

        if (
            data.outboundPoints?.length &&
            data.outboundPoints[0].time !== formatTime(newDeparture)
        ) {
            throw new BadRequestException(
                'Giờ điểm đầu chiều đi phải trùng giờ khởi hành!',
            );
        }

        if (
            data.returnPoints?.length &&
            newReturnDeparture &&
            data.returnPoints[0].time !== formatTime(newReturnDeparture)
        ) {
            throw new BadRequestException(
                'Giờ điểm đầu chiều về phải trùng giờ khởi hành chiều về!',
            );
        }

        if (!newArrival) {
            throw new BadRequestException(
                'Không thể xác định giờ đến dự kiến của chuyến!',
            );
        }

        // Chỉ kiểm tra hạn GPLX với tài xế đang được phân công.
        const expiredDriver = drivers.find(
            (driver) =>
                !driver.licenseExpiry ||
                new Date(driver.licenseExpiry) < newArrival,
        );

        if (expiredDriver) {
            throw new BadRequestException(
                `GPLX của tài xế ${expiredDriver.name} đã hết hạn trước khi kết thúc chuyến!`,
            );
        }

        // Kiểm tra trùng lịch xe khi xe được gán.
        if (vehicleId) {
            const conflictingTrip = await this.prisma.trip.findFirst({
                where: {
                    id: { not: id },
                    vehicleId,
                    status: { not: 'CANCELLED' },
                    plannedDeparture: { lt: newArrival },
                    OR: [
                        { plannedArrival: null },
                        { plannedArrival: { gt: newDeparture } },
                    ],
                },
                select: { id: true },
            });

            if (conflictingTrip) {
                throw new BadRequestException(
                    'Xe đã được phân công cho chuyến khác trong khoảng thời gian này!',
                );
            }
        }

        // Kiểm tra trùng lịch tài xế khi có tài xế được phân công.
        if (driverIds.length > 0) {
            const conflictingDriverTrip =
                await this.prisma.trip.findFirst({
                    where: {
                        id: { not: id },
                        status: { not: 'CANCELLED' },
                        AND: [
                            {
                                OR: [
                                    { driver1Id: { in: driverIds } },
                                    { driver2Id: { in: driverIds } },
                                ],
                            },
                            { plannedDeparture: { lt: newArrival } },
                            {
                                OR: [
                                    { plannedArrival: null },
                                    { plannedArrival: { gt: newDeparture } },
                                ],
                            },
                        ],
                    },
                    select: { id: true },
                });

            if (conflictingDriverTrip) {
                throw new BadRequestException(
                    `Tài xế đã được phân công chuyến khác! Mã chuyến: ${conflictingDriverTrip.id}`,
                );
            }
        }

        // Kiểm tra trùng lịch phụ xe khi có phụ xe được phân công.
        if (assistantIds.length > 0) {
            const conflictingAssistantTrip =
                await this.prisma.trip.findFirst({
                    where: {
                        id: { not: id },
                        status: { not: 'CANCELLED' },
                        AND: [
                            {
                                OR: [
                                    { assistant1Id: { in: assistantIds } },
                                    { assistant2Id: { in: assistantIds } },
                                ],
                            },
                            { plannedDeparture: { lt: newArrival } },
                            {
                                OR: [
                                    { plannedArrival: null },
                                    { plannedArrival: { gt: newDeparture } },
                                ],
                            },
                        ],
                    },
                    select: { id: true },
                });

            if (conflictingAssistantTrip) {
                throw new BadRequestException(
                    `Phụ xe đã được phân công chuyến khác! Mã chuyến: ${conflictingAssistantTrip.id}`,
                );
            }
        }

        const isVehicleChanged = vehicleId !== currentTrip.vehicleId;
        const isSeatLayoutChanged =
            seatLayoutId !== currentTrip.seatLayoutId;

        return this.prisma.$transaction(async (tx) => {
            // Không cho thay xe, sơ đồ ghế hoặc lịch trình khi đã có booking/ghế được phân bổ.
            const [bookingCount, seatAllocationCount] = await Promise.all([
                tx.booking.count({ where: { tripId: id } }),
                tx.seatAllocation.count({
                    where: { tripSeat: { tripId: id } },
                }),
            ]);

            const hasBookingData =
                bookingCount > 0 || seatAllocationCount > 0;

            if (
                hasBookingData &&
                (isVehicleChanged ||
                    isSeatLayoutChanged ||
                    shouldUpdateOutbound ||
                    shouldUpdateReturn)
            ) {
                throw new BadRequestException(
                    'Không thể thay đổi xe, sơ đồ ghế hoặc lịch trình vì chuyến đã phát sinh dữ liệu đặt vé!',
                );
            }

            // Nếu đổi sơ đồ mẫu trước khi phát sinh booking, tạo lại danh sách ghế chuyến.
            if (isSeatLayoutChanged) {
                await tx.tripSeat.deleteMany({
                    where: { tripId: id },
                });

                await tx.tripSeat.createMany({
                    data: seatLayout.seats.map((seat) => ({
                        tripId: id,
                        seatId: seat.id,
                    })),
                });
            }

            const updatedTrip = await tx.trip.update({
                where: { id },
                data: {
                    vehicleId,
                    seatLayoutId,
                    driver1Id,
                    driver2Id,
                    assistant1Id,
                    assistant2Id,
                    plannedDeparture: departureChanged
                        ? newDeparture
                        : undefined,
                    returnPlannedDeparture: returnDepartureChanged
                        ? newReturnDeparture
                        : undefined,
                    plannedArrival: shouldUpdateReturn
                        ? newArrival
                        : undefined,
                },
            });

            // Cập nhật lịch trình chiều đi nếu có thay đổi.
            if (shouldUpdateOutbound) {
                await tx.tripRoutePoint.deleteMany({
                    where: { tripId: id, direction: 'OUTBOUND' },
                });

                if (outboundScheduleData.length > 0) {
                    await tx.tripRoutePoint.createMany({
                        data: outboundScheduleData,
                    });
                }
            }

            // Cập nhật lịch trình chiều về nếu có thay đổi.
            if (shouldUpdateReturn) {
                await tx.tripRoutePoint.deleteMany({
                    where: { tripId: id, direction: 'RETURN' },
                });

                if (returnScheduleData.length > 0) {
                    await tx.tripRoutePoint.createMany({
                        data: returnScheduleData,
                    });
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
