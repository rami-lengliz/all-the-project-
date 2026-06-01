import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { GeoService } from './geo.service';

@ApiTags('geo')
@Controller('api/geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Forward-geocode query → place candidates (Nominatim proxy + cache)' })
  async search(
    @Query('q') q: string,
    @Query('countrycodes') countrycodes?: string,
    @Query('limit') limit?: string,
  ) {
    if (!q || q.trim().length < 2) {
      throw new BadRequestException('Query must be at least 2 characters');
    }
    const n = limit ? Math.min(Math.max(parseInt(limit, 10) || 5, 1), 10) : 5;
    return this.geo.search(q.trim(), countrycodes ?? 'tn', n);
  }

  @Public()
  @Get('reverse')
  @ApiOperation({ summary: 'Reverse-geocode lat/lng → address (Nominatim proxy + cache)' })
  async reverse(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('zoom') zoom?: string,
  ) {
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      throw new BadRequestException('lat and lng must be numeric');
    }
    const z = zoom ? Math.min(Math.max(parseInt(zoom, 10) || 10, 0), 18) : 10;
    return this.geo.reverse(latN, lngN, z);
  }
}
