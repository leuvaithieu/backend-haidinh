
import {
    IsNotEmpty,
    IsString,
    Length,
    Matches,
} from 'class-validator';

export class CheckInTicketDto {
    @IsString()
    @IsNotEmpty()
    @Length(64, 64)
    @Matches(/^[a-f0-9]{64}$/i, {
        message: 'Mã QR không hợp lệ.',
    })
    qrToken!: string;
}
