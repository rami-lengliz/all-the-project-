import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { NearbyCategoriesDto } from './dto/nearby-categories.dto';
import { CreateCategoryRequestDto } from './dto/create-category-request.dto';
import { ReviewCategoryRequestDto } from './dto/review-category-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('categories')
@Controller('api/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create category (admin only)' })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List active categories' })
  findAll() {
    return this.categoriesService.findAll(false);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all categories including inactive (admin only)' })
  findAllAdmin() {
    return this.categoriesService.findAll(true);
  }

  @Get('nearby')
  @Public()
  @ApiOperation({
    summary: 'Get nearby categories with listing counts',
    description:
      'Returns categories that have active listings within the specified radius from a geographic location. ' +
      'Uses PostGIS for accurate geospatial queries. Results are ordered by listing count (descending) then category name (ascending). ' +
      'Only includes active, non-deleted listings with valid location data.',
  })
  @ApiQuery({
    name: 'lat',
    required: true,
    type: Number,
    example: 36.8578,
    description: 'Latitude coordinate (-90 to 90)',
  })
  @ApiQuery({
    name: 'lng',
    required: true,
    type: Number,
    example: 11.092,
    description: 'Longitude coordinate (-180 to 180)',
  })
  @ApiQuery({
    name: 'radiusKm',
    required: false,
    type: Number,
    example: 10,
    description: 'Search radius in kilometers (0-50, default: 10)',
  })
  @ApiQuery({
    name: 'includeEmpty',
    required: false,
    type: Boolean,
    example: false,
    description: 'Include categories with zero listings (default: false)',
  })
  @ApiOkResponse({
    description: 'Categories with listing counts successfully retrieved',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                example: '123e4567-e89b-12d3-a456-426614174000',
                description: 'Category UUID',
              },
              name: {
                type: 'string',
                example: 'Electronics',
                description: 'Category name',
              },
              slug: {
                type: 'string',
                example: 'electronics',
                description: 'URL-friendly category identifier',
              },
              icon: {
                type: 'string',
                nullable: true,
                example: 'fa-laptop',
                description: 'Icon identifier (FontAwesome class)',
              },
              count: {
                type: 'number',
                example: 15,
                description: 'Number of active listings within radius',
              },
            },
          },
          example: [
            {
              id: '123e4567-e89b-12d3-a456-426614174000',
              name: 'Electronics',
              slug: 'electronics',
              icon: 'fa-laptop',
              count: 15,
            },
            {
              id: '223e4567-e89b-12d3-a456-426614174001',
              name: 'Beach Gear',
              slug: 'beach-gear',
              icon: 'fa-football',
              count: 8,
            },
            {
              id: '323e4567-e89b-12d3-a456-426614174002',
              name: 'Vehicles',
              slug: 'vehicles',
              icon: 'fa-car',
              count: 5,
            },
          ],
        },
        timestamp: {
          type: 'string',
          format: 'date-time',
          example: '2026-02-16T20:27:06.496Z',
        },
      },
    },
  })
  async findNearby(@Query() dto: NearbyCategoriesDto) {
    return this.categoriesService.findNearbyWithCounts(
      dto.lat,
      dto.lng,
      dto.radiusKm,
      dto.includeEmpty,
    );
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get category by ID' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update category (admin only)' })
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete category (admin only)' })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }

  // ===========================
  // Category Requests
  // ===========================

  @Post('requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a request for a new category (Hosts)' })
  createRequest(@Request() req, @Body() createCategoryRequestDto: CreateCategoryRequestDto) {
    return this.categoriesService.createRequest(req.user.sub, createCategoryRequestDto);
  }

  @Get('admin/requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all category requests (Admin only)' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED', 'MERGED'] })
  findAllRequests(@Query('status') status?: string) {
    return this.categoriesService.findAllRequests(status);
  }

  @Get('admin/requests/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get details of a category request (Admin only)' })
  getRequestById(@Param('id') id: string) {
    return this.categoriesService.getRequestById(id);
  }

  @Patch('admin/requests/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Review and action a category request (Admin only)' })
  reviewRequest(@Param('id') id: string, @Request() req, @Body() reviewCategoryRequestDto: ReviewCategoryRequestDto) {
    return this.categoriesService.reviewRequest(id, req.user.sub, reviewCategoryRequestDto);
  }
}
