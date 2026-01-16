import { diskStorage } from 'multer';
import { extname } from 'path';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';

export const multerConfig = (configService: ConfigService) => {
  const baseDir = configService.get<string>('upload.dir') || './uploads';
  const tempDir = `${baseDir}/temp`;

  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  return {
    storage: diskStorage({
      destination: (req, file, cb) => {
        // Use temp directory, will move to listing folder after save
        cb(null, tempDir);
      },
      filename: (req, file, cb) => {
        const randomName = Array(32)
          .fill(null)
          .map(() => Math.round(Math.random() * 16).toString(16))
          .join('');
        const ext = extname(file.originalname);
        cb(null, `${randomName}${ext}`);
      },
    }),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB per file
      files: 5, // Max 5 images
    },
    fileFilter: (req, file, cb) => {
      // Only JPEG and PNG allowed
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(
            'Only JPEG and PNG image files are allowed (max 5MB each)',
          ),
          false,
        );
      }
    },
  };
};
