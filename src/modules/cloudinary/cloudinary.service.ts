import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly isConfigured: boolean;

  constructor(private configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    this.isConfigured = Boolean(cloudName && apiKey && apiSecret);

    if (this.isConfigured) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
      this.logger.log('Cloudinary configured ✅');
    } else {
      this.logger.warn('Cloudinary not configured — images will use local storage fallback');
    }
  }

  /**
   * Upload a single file buffer to Cloudinary.
   * Returns the secure HTTPS URL on success, or null if not configured.
   */
  async uploadFile(
    file: Express.Multer.File,
    folder = 'rentai/listings',
  ): Promise<string | null> {
    if (!this.isConfigured) return null;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error, result) => {
          if (error) {
            this.logger.error('Cloudinary upload failed', error);
            return reject(error);
          }
          resolve(result!.secure_url);
        },
      );

      // Support both buffer and stream-based files
      if (file.buffer) {
        const readable = new Readable();
        readable.push(file.buffer);
        readable.push(null);
        readable.pipe(uploadStream);
      } else {
        // File saved to disk by multer — read from path
        const fs = require('fs') as typeof import('fs');
        fs.createReadStream(file.path).pipe(uploadStream);
      }
    });
  }

  /**
   * Upload multiple files and return their Cloudinary URLs.
   * Falls back to null entries if Cloudinary is unavailable.
   */
  async uploadFiles(
    files: Express.Multer.File[],
    folder = 'rentai/listings',
  ): Promise<(string | null)[]> {
    return Promise.all(files.map((f) => this.uploadFile(f, folder)));
  }
}
