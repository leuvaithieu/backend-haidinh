import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTripDto, TripPointScheduleDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';


@Injectable()
export class TripService {
    constructor(private prisma:PrismaService){}

    private calculatePointTimes(
        points: TripPointScheduleDto[],
        departure: Date,
    ): Date[] {
        const result: Date[] = [new Date(departure)];

        for (let i = 1; i < points.length; i++) {
            const [previousHour, previousMinute] =
                points[i - 1].time.split(':').map(Number);

            const [currentHour, currentMinute] =
                points[i].time.split(':').map(Number);

            const previousMinutes =
                previousHour * 60 + previousMinute;

            let currentMinutes =
                currentHour * 60 + currentMinute;

            if (currentMinutes <= previousMinutes) {
                currentMinutes += 24 * 60;
            }

            const difference =
                currentMinutes - previousMinutes;

            const nextTime = new Date(
                result[i - 1].getTime() +
                    difference * 60 * 1000,
            );

            result.push(nextTime);
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
            where:{
                id: data.vehicleId,
            },
            select:{
                id:true,
                name:true,
                licensePlate:true,
                status:true,
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

        if(route.routePoints.length < 2){
            throw new BadRequestException('Tuyến xe phải có ít nhất hai điểm tuyến !');
        };

        const routePointIds = route.routePoints.map((point) =>point.id);

        const allSchedulePoints = [
            ...data.outboundPoints,
            ...data.returnPoints,
        ]

        for(const point of allSchedulePoints){
            if(!routePointIds.includes(point.routePointId)){
                throw new BadRequestException(`Điểm tuyến ${point.routePointId} không thuộc tuyến đã chọn !`);
            };
        };

        const outboundIds = data.outboundPoints.map(
            (point) =>point.routePointId,
        );

        const returnIds = data.returnPoints.map(
            (point) =>point.routePointId,
        )

        if(new Set(outboundIds).size !==outboundIds.length){
            throw new BadRequestException('Lịch chiều đi có điểm tuyến bị trùng !');
        }

        if(new Set(returnIds).size !== returnIds.length){
            throw new BadRequestException('Lịch chiều về có điểm tuyến bị trùng !')
        }

        const expectedOutbound = [...route.routePoints].sort(
            (a,b) => a.sequence - b.sequence,
        );

        const expectedReturn = [...route.routePoints].sort(
            (a,b) => b.sequence - a.sequence,
        );

        const isSubsequence = (actualIds: string[], expectedIds: string[]) => {
            let expectedIndex = 0;

            for (const id of actualIds) {
                while (
                    expectedIndex < expectedIds.length &&
                    expectedIds[expectedIndex] !== id
                ) {
                    expectedIndex++;
                }

                if (expectedIndex >= expectedIds.length) {
                    return false;
                }

                expectedIndex++;
            }

            return actualIds.length >= 2;
        };

        if (!isSubsequence(outboundIds, expectedOutbound.map(point => point.id))) {
            throw new BadRequestException('Thứ tự điểm tuyến chiều đi không hợp lệ!');
        }

        if (!isSubsequence(returnIds, expectedReturn.map(point => point.id))) {
            throw new BadRequestException('Thứ tự điểm tuyến chiều về không hợp lệ!');
        }
        
        const outboundTimes = this.calculatePointTimes(
            data.outboundPoints,
            new Date(data.plannedDeparture),
        );

        const returnTimes = this.calculatePointTimes(
            data.returnPoints,
            new Date(data.returnPlannedDeparture),
        )

        const outboundFirstTime = data.outboundPoints[0].time;
        const returnFirstTime = data.returnPoints[0].time;

        const formatTime = (date :Date)=>
            `${String((date.getUTCHours() + 7) % 24).padStart(2,'0')}:${String(
                date.getUTCMinutes(),
            ).padStart(2,'0')}`;

        if(outboundFirstTime !== formatTime(new Date(data.plannedDeparture))){
            throw new BadRequestException(
                'Giờ điểm đầu chiều đi phải trùng giờ xuất phát !'
            );
        }
        if(returnFirstTime !== formatTime(new Date(data.returnPlannedDeparture))){
            throw new BadRequestException('Giờ điểm đầu chiều về phải trùng giờ xuất phát')
        }

        const outboundLastTime = outboundTimes[outboundTimes.length - 1];

        const returnDeparture = new Date(data.returnPlannedDeparture);

        if (returnDeparture <= outboundLastTime){
            throw new BadRequestException('Giờ xuất phát chiều về phải sau khi xe đến điểm cuối của chiều đi !')
        }

        if(
            data.outboundPoints.length < 2 || data.returnPoints.length < 2
        ){
            throw new BadRequestException('Lịch trình mỗi chiều phải có ít nhất 2 điểm !')
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
                plannedArrival:{
                    gt:newDeparture,
                },
            },
        });

        if(conflictingTrip){
            throw new BadRequestException(
                `Xe đã được phân công chuyến khác trong khoảng thời gian này! Mã chuyến : ${conflictingTrip.id},`
            );
        }

        const outboundSchedule = data.outboundPoints.map((point,index)=>({
            routePointId : point.routePointId,
            pointName : route.routePoints.find(
                (routePoint)=> routePoint.id === point.routePointId,
            )!.name,
            direction: 'OUTBOUND' as const,
            sequence : index + 1,
            plannedTime : outboundTimes[index],
        }));

        const returnSchedule = data.returnPoints.map((point,index)=>({
            routePointId : point.routePointId,
            pointName: route.routePoints.find(
                (routePoint) => routePoint.id === point.routePointId,
            )!.name,
            direction : 'RETURN' as const,
            sequence: index + 1 ,
            plannedTime : returnTimes[index],
        }))

        return await this.prisma.trip.create({
            data: {
            routeId: data.routeId,
            vehicleId: data.vehicleId,
            driver1Id: data.driver1Id,
            driver2Id: data.driver2Id,
            assistant1Id: data.assistant1Id,
            assistant2Id: data.assistant2Id ?? null,
            plannedDeparture: new Date(data.plannedDeparture),
            //plannedArrival: new Date(data.plannedArrival),
            returnPlannedDeparture : new Date(data.returnPlannedDeparture),
            plannedArrival : returnTimes[returnTimes.length - 1],
            tripRoutePoints:{create:[...outboundSchedule, ...returnSchedule]},
            createdById: userId,
            },
        });
    }

    
    async update(id: string, data: UpdateTripDto) {
        const currentTrip = await this.prisma.trip.findUnique({
            where: { id },
        });
        
        if(!currentTrip){
            throw new BadRequestException('Không tìm thấy chuyến xe !');
        }

        const vehicleId = data.vehicleId ?? currentTrip.vehicleId;

        const vehicle = await this.prisma.vehicle.findUnique({
            where: {
                id: vehicleId,
            },
            select: {
                id: true,
                name: true,
                licensePlate: true,
                status: true,
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
        const assistant2Id = data.assistant2Id ?? currentTrip.assistant2Id;

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
            }
        });

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

                outboundTimes = this.calculatePointTimes(data.outboundPoints!, newDeparture);
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

                returnTimes = this.calculatePointTimes(data.returnPoints!, newReturnDeparture);
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
                : currentSchedule.map((point, index)=>({
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
                    : null;
            

        if(newOutboundArrival && newReturnDeparture && newReturnDeparture <= newOutboundArrival){
            throw new BadRequestException('Giờ khởi hành chiều về phải sau giờ đến điểm cuối chiều đi !')
        }

        const newArrival = shouldUpdateReturn && returnTimes.length > 0 ? returnTimes[returnTimes.length - 1] : currentTrip.plannedArrival;

        const formatTime = (date:Date)=>`${String((date.getUTCHours() + 7) % 24).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;

        if(data.outboundPoints?.length && data.outboundPoints[0].time !== formatTime(newDeparture)){
            throw new BadRequestException('Giờ điểm đầu chiều đi phải trùng giờ khởi hành !')
        }

        if(data.returnPoints?.length && newReturnDeparture && data.returnPoints[0].time !== formatTime(newReturnDeparture)){
            throw new BadRequestException('Giờ điểm đầu chiều về phải trùng giờ khởi hành chiều về !');
        }

        


        if(!newArrival){
            throw new BadRequestException('Không thể xác định giờ đến dự kiến của chuyến');
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
        
        // Giờ đến cuối chuyến được lấy từ điểm cuối chiều về.
        const plannedArrival =  shouldUpdateReturn ? returnTimes[returnTimes.length - 1] : undefined;
        if(shouldUpdateReturn && !plannedArrival){
            throw new BadRequestException('Không xác định được thời gian đến cuối hành trình!');
        }

        // Cập nhật chuyến xe và lịch trình trong cùng transaction.
        return this.prisma.$transaction(async (tx) => {
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


    async remove(id:string){
        return this.prisma.trip.delete({
            where:{
                id,
            }
        })
    }
}
