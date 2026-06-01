import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';
import { initSentry, captureException, flushSentry } from './common/monitoring/sentry';

// ── Startup Environment Audit ────────────────────────────────────────────────
const INSECURE_DEFAULTS: Record<string, string> = {
  JWT_SECRET: 'your-super-secret-jwt-key-change-in-production',
  REFRESH_TOKEN_SECRET: 'your-super-secret-refresh-token-key-change-in-production',
};

function auditEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET'];
  const missing = required.filter((k) => !process.env[k]);

  // A secret that's missing OR still set to the published placeholder is forgeable.
  const insecure = Object.entries(INSECURE_DEFAULTS)
    .filter(([k, def]) => !process.env[k] || process.env[k] === def)
    .map(([k]) => k);

  const isProd = process.env.NODE_ENV === 'production';

  if (insecure.length > 0) {
    const msg =
      `Insecure secret(s): ${insecure.join(', ')} are missing or set to the ` +
      `default placeholder. Generate strong values, e.g.:\n` +
      `  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`;
    if (isProd) {
      console.error(`🛑  REFUSING TO START — ${msg}`);
      process.exit(1);
    }
    console.warn(`⚠️  ${msg}`);
  }

  if (missing.length > 0) {
    console.warn(`⚠️  Missing env vars: ${missing.join(', ')}`);
  } else if (insecure.length === 0) {
    console.log('✅  All required env vars present and secrets look strong');
  }
}

async function bootstrap() {
  try {
    // Earliest possible — so even AppModule construction errors are captured.
    // No-op unless SENTRY_DSN is set.
    initSentry();

    auditEnv(); // fail fast before building the app if secrets are insecure

    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // Security headers. CSP is disabled because this process also serves the
    // Swagger UI (which needs inline scripts); the Next.js frontend sets its own
    // CSP. crossOriginResourcePolicy is relaxed so the frontend on :3000 can load
    // images served from /uploads on :3001.
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
      }),
    );
    app.use(compression());

    const configService = app.get(ConfigService);

    // Static uploads directory
    const uploadsDir = join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

    // CORS
    const allowedOrigins = configService.get<string[]>('allowedOrigins') || ['http://localhost:3001'];

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

    // Global validation pipe.
    //   whitelist           — strip any property not in the DTO (blocks
    //                          mass-assignment, e.g. a client trying to send
    //                          isHost:true / roles:['ADMIN']).
    //   forbidNonWhitelisted — left OFF deliberately: whitelist already removes
    //                          unknown fields before they reach a service, so the
    //                          security benefit of rejecting (vs stripping) is
    //                          marginal, while flipping it to ON would turn any
    //                          client that sends an extra field into a hard 400.
    //                          Stripping is the safer production default here.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
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
    await app.listen(port, '0.0.0.0');
    console.log(`Application running → ${appUrl}`);
    console.log(`Swagger UI          → ${appUrl}/api/docs`);
    console.log(`Allowed CORS origins→ ${allowedOrigins.join(', ')}`);
  } catch (error) {
    console.error('Bootstrap error:', error);
    fs.writeFileSync('crash.log', error.toString() + '\n' + error.stack);
    captureException(error, { phase: 'bootstrap' });
    await flushSentry(); // drain before the process dies
    process.exit(1);
  }
}

bootstrap();
