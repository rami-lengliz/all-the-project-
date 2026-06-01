import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  Res,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ListingsService } from './listings.service';
import { LastMinuteService } from './last-minute.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { FilterListingsDto } from './dto/filter-listings.dto';
import { CompareListingsDto } from './dto/compare-listings.dto';
import {
  CreateAvailabilityBlockDto,
  SetDatePricesDto,
  SetMinNightsDto,
  ImportIcalDto,
} from './dto/availability-block.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HostGuard } from '../../common/guards/host.guard';
import { Public } from '../../common/decorators/public.decorator';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { BadRequestException } from '@nestjs/common';

// Multer configuration directly in controller
const multerOptions = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = './uploads/temp';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
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

@ApiTags('listings')
@Controller('api/listings')
export class ListingsController {
  constructor(
    private readonly listingsService: ListingsService,
    private readonly lastMinuteService: LastMinuteService,
  ) {}

  /**
   * Last-minute deals: high-quality listings with empty calendars in the
   * next 7 days. Public — designed to be the homepage's "spontaneous booking"
   * surface. Optionally filtered by lat/lng + radius for "near me".
   */
  @Get('last-minute')
  @Public()
  @ApiOperation({
    summary: 'High-quality listings with empty calendars in the next 7 days',
  })
  lastMinute(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    return this.lastMinuteService.findDeals({
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      radiusKm: radiusKm ? Number(radiusKm) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard, HostGuard)
  @UseInterceptors(FilesInterceptor('images', 5, multerOptions))
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new listing (host only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateListingDto })
  create(
    @Body() createListingDto: CreateListingDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req,
  ) {
    return this.listingsService.create(createListingDto, req.user.sub, files);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, HostGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all listings for the current host (any status)',
  })
  findMine(@Request() req) {
    return this.listingsService.findAllForHost(req.user.sub);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Search listings with filters' })
  findAll(@Query() filters: FilterListingsDto) {
    return this.listingsService.findAll(filters);
  }

  @Get('compare')
  @Public()
  @ApiOperation({ summary: 'Compare multiple listings' })
  compare(@Query() query: CompareListingsDto) {
    return this.listingsService.compareListings(query.ids);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get listing details' })
  findOne(@Param('id') id: string) {
    return this.listingsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('images', 5, multerOptions))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update listing (host or admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateListingDto })
  update(
    @Param('id') id: string,
    @Body() updateListingDto: UpdateListingDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req,
  ) {
    const isAdmin = req.user.role === 'ADMIN';
    // Extract imagesToRemove from body if present
    const imagesToRemove =
      typeof updateListingDto.imagesToRemove === 'string'
        ? [updateListingDto.imagesToRemove]
        : updateListingDto.imagesToRemove || [];
    return this.listingsService.update(
      id,
      updateListingDto,
      req.user.sub,
      isAdmin,
      files,
      imagesToRemove,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, HostGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a listing (soft delete for hosts, hard delete for admins)',
  })
  async remove(@Param('id') id: string, @Request() req) {
    return this.listingsService.remove(id, req.user.sub, req.user.role);
  }

  @Post(':id/slot-configuration')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create slot configuration for a listing' })
  async createSlotConfiguration(
    @Param('id') id: string,
    @Body() dto: any, // CreateSlotConfigurationDto
    @Request() req,
  ) {
    return this.listingsService.createSlotConfiguration(id, dto, req.user.sub);
  }

  @Patch(':id/slot-configuration')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update slot configuration for a listing' })
  async updateSlotConfiguration(
    @Param('id') id: string,
    @Body() dto: any,
    @Request() req,
  ) {
    return this.listingsService.updateSlotConfiguration(id, dto, req.user.sub);
  }

  @Get(':id/available-slots')
  @Public()
  @ApiOperation({ summary: 'Get available time slots for a specific date' })
  async getAvailableSlots(
    @Param('id') id: string,
    @Query('date') dateStr: string,
  ) {
    const date = new Date(dateStr);
    return this.listingsService.getAvailableSlots(id, date);
  }

  // ── Availability calendar (Airbnb-style date blocking) ──────────────────────

  @Get(':id/availability')
  @Public()
  @ApiOperation({
    summary: 'Booked + host-blocked date ranges for a listing (calendar view)',
  })
  async getAvailability(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.listingsService.getAvailabilityCalendar(id, from, to);
  }

  @Post(':id/blocks')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Block a date range on the calendar (host only)' })
  async createBlock(
    @Param('id') id: string,
    @Body() dto: CreateAvailabilityBlockDto,
    @Request() req,
  ) {
    return this.listingsService.createAvailabilityBlock(id, req.user.sub, dto);
  }

  @Delete(':id/blocks/:blockId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a calendar block (host only)' })
  async deleteBlock(
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Request() req,
  ) {
    return this.listingsService.deleteAvailabilityBlock(
      id,
      blockId,
      req.user.sub,
    );
  }

  // ── Per-date pricing ────────────────────────────────────────────────────────

  @Post(':id/prices')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set a custom nightly price for a date range (host)' })
  async setPrices(
    @Param('id') id: string,
    @Body() dto: SetDatePricesDto,
    @Request() req,
  ) {
    return this.listingsService.setDatePrices(id, req.user.sub, dto);
  }

  @Delete(':id/prices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear custom prices in a date range (host)' })
  async clearPrices(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Request() req,
  ) {
    return this.listingsService.clearDatePrices(id, req.user.sub, {
      startDate: from,
      endDate: to,
    });
  }

  @Patch(':id/min-nights')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set the minimum-nights rule for a listing (host)' })
  async setMinNights(
    @Param('id') id: string,
    @Body() dto: SetMinNightsDto,
    @Request() req,
  ) {
    return this.listingsService.setMinNights(id, req.user.sub, dto.minNights);
  }

  // ── iCal sync ─────────────────────────────────────────────────────────────

  @Get(':id/calendar.ics')
  @Public()
  @ApiOperation({ summary: 'Export this listing’s availability as an iCal feed' })
  async exportIcal(@Param('id') id: string, @Res() res: Response) {
    const ics = await this.listingsService.exportListingIcal(id);
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="listing-${id}.ics"`,
      'Cache-Control': 'public, max-age=300',
    });
    res.send(ics);
  }

  @Post(':id/ical/import')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import/sync an external iCal feed (host)' })
  async importIcal(
    @Param('id') id: string,
    @Body() dto: ImportIcalDto,
    @Request() req,
  ) {
    return this.listingsService.importListingIcal(id, req.user.sub, dto.url);
  }

  @Delete(':id/ical/import')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stop syncing the external iCal feed (host)' })
  async removeIcal(@Param('id') id: string, @Request() req) {
    return this.listingsService.removeIcalImport(id, req.user.sub);
  }
}
