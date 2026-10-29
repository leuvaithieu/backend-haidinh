import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

const articleUploadDirectory = join(process.cwd(), 'uploads', 'articles');
const routeUploadDirectory = join(process.cwd(), 'uploads', 'routes');

const allowedMimeTypes: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function imageStorage(destinationDirectory: string) {
  return diskStorage({
    destination: (_req, _file, callback) => {
      try {
        mkdirSync(destinationDirectory, { recursive: true });
        callback(null, destinationDirectory);
      } catch {
        callback(new Error('Không thể tạo thư mục lưu ảnh'), destinationDirectory);
      }
    },
    filename: (_req, file, callback) => {
      const extension = allowedMimeTypes[file.mimetype];
      if (!extension) {
        callback(new BadRequestException('Định dạng ảnh không được hỗ trợ'), '');
        return;
      }
      callback(null, `${randomUUID()}${extname(`image${extension}`)}`);
    },
  });
}

function imageUploadOptions(destinationDirectory: string) {
  return {
    storage: imageStorage(destinationDirectory),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) => {
      if (!allowedMimeTypes[file.mimetype]) {
        callback(new BadRequestException('Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc GIF'), false);
        return;
      }
      callback(null, true);
    },
  };
}

@Controller('upload')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
export class UploadController {
  @Post('article-image')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions(articleUploadDirectory)))
  uploadArticleImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Vui lòng chọn ảnh để tải lên');
    return {
      message: 'Tải ảnh lên thành công',
      filename: file.filename,
      url: `/uploads/articles/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  @Post('route-image')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions(routeUploadDirectory)))
  uploadRouteImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Vui lòng chọn ảnh để tải lên');
    return {
      message: 'Tải ảnh lên thành công',
      filename: file.filename,
      url: `/uploads/routes/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
