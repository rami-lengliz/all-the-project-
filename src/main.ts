import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';

// ── Startup Environment Audit ────────────────────────────────────────────────
function auditEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`⚠️  Missing env vars: ${missing.join(', ')}`);
  } else {
    console.log('✅  All required env vars present');
  }
}

async function bootstrap() {
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    const configService = app.get(ConfigService);

    // Static uploads directory
    const uploadsDir = join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

    // CORS
    const allowedOrigins = (
      configService.get<string>('CORS_ORIGINS') ?? 'http://localhost:3001'
    )
      .split(',')
      .map((o) => o.trim());

    app.enableCors({
      origin: allowedOrigins,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      credentials: true,
    });

    // Global exception filter
    app.useGlobalFilters(new HttpExceptionFilter());

    // Global interceptors
    app.useGlobalInterceptors(
      new TransformInterceptor(),
      new LoggingInterceptor(),
    );

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Swagger / OpenAPI documentation
    const appUrl =
      configService.get<string>('APP_URL') ??
      `http://localhost:${configService.get<number>('port') || 3000}`;

    const config = new DocumentBuilder()
      .setTitle('RentAI API')
      .setDescription(
        'Production-grade backend API for RentAI — location-aware AI-powered rental marketplace. ' +
          'Features: PostGIS proximity search, AI natural-language search with chips, booking conflict prevention.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addServer(appUrl, 'Active server')
      .addServer('http://localhost:3000', 'Local development')
      .addTag('health', 'Health check')
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management')
      .addTag('categories', 'Category management')
      .addTag('listings', 'Listing management and search')
      .addTag('bookings', 'Booking management')
      .addTag('reviews', 'Review system')
      .addTag('admin', 'Admin operations')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: '/api/docs-json',
      yamlDocumentUrl: '/api/docs-yaml',
    });

    const port = configService.get<number>('port') || 3000;
    auditEnv();
    await app.listen(port);
    console.log(`Application running → ${appUrl}`);
    console.log(`Swagger UI          → ${appUrl}/api/docs`);
    console.log(`Allowed CORS origins→ ${allowedOrigins.join(', ')}`);
  } catch (error) {
    console.error('Bootstrap error:', error);
    fs.writeFileSync('crash.log', error.toString() + '\n' + error.stack);
    process.exit(1);
  }
}

bootstrap();
