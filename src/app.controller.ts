import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dataSource: DataSource,
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
    const dbConnected = this.dataSource.isInitialized;
    let mlServiceReachable = false;

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
