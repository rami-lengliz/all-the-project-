import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './database/prisma.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@ApiTags('health')
@Controller('api')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Health check endpoint' })
  async getHealth() {
    let dbConnected = false;
    let mlServiceReachable = false;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch (error) {
      dbConnected = false;
    }

    try {
      const mlServiceUrl = this.configService.get<string>('ml.serviceUrl');
      const response = await firstValueFrom(
        this.httpService.get(`${mlServiceUrl}/health`, { timeout: 2000 }),
      );
      mlServiceReachable = response.status === 200;
    } catch (error) {
      mlServiceReachable = false;
    }

    return {
      status: dbConnected && mlServiceReachable ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbConnected,
        mlService: mlServiceReachable,
      },
    };
  }
}
