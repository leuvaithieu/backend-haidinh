export class CreateVehicleDto {
  licensePlate!: string;
  name!: string;
  seatCount!: number;
  vehicleType!: string;
  status?: string;
}