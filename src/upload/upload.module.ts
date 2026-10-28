
import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  controllers: [UploadController],
  providers: [UploadService, RolesGuard],
})
export class UploadModule {}
