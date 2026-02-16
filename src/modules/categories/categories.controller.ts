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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { NearbyCategoriesDto } from './dto/nearby-categories.dto';
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
  @ApiOperation({ summary: 'List all categories' })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get('nearby')
  @Public()
  @ApiOperation({
    summary:
      'Get categories with listing counts within radius (location-aware)',
    description:
      'Returns categories that have active listings within the specified radius. Ordered by count (desc) then name (asc).',
  })
  @ApiQuery({
    name: 'lat',
    required: true,
    type: Number,
    example: 36.8578,
    description: 'Latitude',
  })
  @ApiQuery({
    name: 'lng',
    required: true,
    type: Number,
    example: 11.092,
    description: 'Longitude',
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
}
