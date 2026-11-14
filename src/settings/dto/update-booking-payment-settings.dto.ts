import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
    MinLength,
} from 'class-validator';

export class UpdateBookingSettingsDto {
    @IsOptional()
    @IsBoolean()
    onlineBookingEnabled?: boolean;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(1440)
    bookingHoldMinutes?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    minDepositAmount?: number;
}

export class UpdatePaymentSettingsDto {
    @IsOptional()
    @IsBoolean()
    transferEnabled?: boolean;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    bankName?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    bankCode?: string;

    @IsOptional()
    @IsString()
    @MinLength(5)
    bankAccountNumber?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    bankAccountName?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    transferContent?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10080)
    paymentReviewTimeoutMinutes?: number;
}