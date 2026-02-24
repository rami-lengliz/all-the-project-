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
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
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
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { FilterListingsDto } from './dto/filter-listings.dto';
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
  constructor(private readonly listingsService: ListingsService) {}

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
    return this.listingsService.remove(id, req.user.id, req.user.role);
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
    return this.listingsService.createSlotConfiguration(id, dto, req.user.id);
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
}
