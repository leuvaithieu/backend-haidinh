
import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  ParseEnumPipe,
  UseGuards
} from '@nestjs/common';

import {
  NotificationChannel,
  NotificationStatus,
} from '@prisma/client';

import { NotificationService } from './notification.service';

// Điều chỉnh các guard/decorator theo đúng cấu trúc phân quyền hiện tại của dự án.
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
  ) {}

  // Lấy danh sách thông báo và hỗ trợ lọc theo trạng thái, kênh gửi, booking.
  @Get()
  findAll(
    @Query(
      'status',
      new ParseEnumPipe(NotificationStatus, { optional: true }),
    )
    status?: NotificationStatus,

    @Query(
      'channel',
      new ParseEnumPipe(NotificationChannel, { optional: true }),
    )
    channel?: NotificationChannel,

    @Query('bookingId') bookingId?: string,
  ) {
    return this.notificationService.findAll({
      status,
      channel,
      bookingId,
    });
  }

  // Lấy thông tin chi tiết một thông báo.
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.notificationService.findOne(id);
  }

  // Đưa thông báo gửi thất bại trở lại hàng chờ xử lý.
  @Patch(':id/retry')
  retry(@Param('id') id: string) {
    return this.notificationService.retry(id);
  }
}
