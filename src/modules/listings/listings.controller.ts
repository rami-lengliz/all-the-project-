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
import { ConfigService } from '@nestjs/config';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { FilterListingsDto } from './dto/filter-listings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HostGuard } from '../../common/guards/host.guard';
import { Public } from '../../common/decorators/public.decorator';
import { multerConfig } from '../../common/utils/multer.config';

@ApiTags('listings')
@Controller('api/listings')
export class ListingsController {
  constructor(
    private readonly listingsService: ListingsService,
    private readonly configService: ConfigService,
  ) {}

  private getMulterConfig(): ReturnType<typeof multerConfig> {
    return multerConfig(this.configService!);
  }

  @Post()
  @UseGuards(JwtAuthGuard, HostGuard)
  @UseInterceptors(
    FilesInterceptor('images', 5, (this as any).getMulterConfig()),
  )
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
  @UseInterceptors(
    FilesInterceptor('images', 5, (this as any).getMulterConfig()),
  )
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete listing (host or admin)' })
  remove(@Param('id') id: string, @Request() req) {
    const isAdmin = req.user.role === 'ADMIN';
    return this.listingsService.remove(id, req.user.sub, isAdmin);
  }
}
