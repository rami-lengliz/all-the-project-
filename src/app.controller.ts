import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
} from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './database/prisma.service';
import { ConfigService } from '@nestjs/config';

// Loaded once at module init — process.uptime() is more accurate anyway
const APP_VERSION = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../package.json').version as string;
  } catch {
    return 'unknown';
  }
})();

@ApiTags('health')
@Controller('api')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) { }

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * GET /api/health
   *
   * Returns the current health of the API, database connection, and PostGIS
   * extension availability. No authentication required.
   *
   * Response shape:
   * {
   *   status:   'ok' | 'degraded',
   *   db:        boolean,   // basic SELECT 1 succeeded
   *   postgis:   boolean,   // PostGIS ST_GeomFromText works
   *   uptime:    number,    // process uptime in seconds
   *   version:   string,    // package.json version
   *   env:       string,    // NODE_ENV
   *   timestamp: string,    // ISO-8601
   * }
   */
  @Get('health')
  @Public()
  @ApiOperation({
    summary: 'Health check',
    description:
      'Returns database connectivity, PostGIS availability, uptime, and version. Public — no auth required.',
  })
  @ApiOkResponse({
    description: 'Health status',
    schema: {
      example: {
        status: 'ok',
        db: true,
        postgis: true,
        uptime: 42.7,
        version: '1.0.0',
        env: 'production',
        timestamp: '2026-02-26T17:00:00.000Z',
      },
    },
  })
  async getHealth() {
    let db = false;
    let postgis = false;

    // 1. Basic DB connectivity
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }

    // 2. PostGIS extension availability — catches misconfigured managed DBs
    if (db) {
      try {
        await this.prisma
          .$queryRaw`SELECT ST_GeomFromText('POINT(0 0)', 4326)`;
        postgis = true;
      } catch {
        postgis = false;
      }
    }

    const status = db ? 'ok' : 'degraded';

    return {
      status,
      db,
      postgis,
      uptime: Math.round(process.uptime()),
      version: APP_VERSION,
      env: this.configService.get<string>('nodeEnv') ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }
}
