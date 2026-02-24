import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Category, Prisma } from '@prisma/client';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    // Generate slug from name if not provided
    const slug =
      createCategoryDto.slug ||
      createCategoryDto.name.toLowerCase().replace(/\s+/g, '-');

    return this.prisma.category.create({
      data: {
        ...createCategoryDto,
        slug,
      },
    });
  }

  async findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { listings: true },
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { slug } });
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    await this.findOne(id); // Ensure category exists
    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id); // Ensure category exists
    await this.prisma.category.delete({ where: { id } });
  }

  /**
   * Get categories with listing counts within a radius from a location
   * Uses PostGIS ST_DWithin for geospatial queries
   */
  async findNearbyWithCounts(
    lat: number,
    lng: number,
    radiusKm: number = 10,
    includeEmpty: boolean = false,
  ): Promise<
    Array<{
      id: string;
      name: string;
      slug: string;
      icon: string | null;
      count: number;
    }>
  > {
    const radiusMeters = radiusKm * 1000;

    // Build the SQL query using Prisma.sql for safe parameterization
    const baseQuery = Prisma.sql`
      SELECT 
        c.id,
        c.name,
        c.slug,
        c.icon,
        CAST(COUNT(l.id) AS INTEGER) as count
      FROM categories c
      LEFT JOIN listings l ON l."categoryId" = c.id
        AND l."isActive" = true
        AND l."deletedAt" IS NULL
        AND l.location IS NOT NULL
        AND ST_DWithin(
          l.location::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
      GROUP BY c.id, c.name, c.slug, c.icon
    `;

    // Add HAVING clause and ORDER BY
    const finalQuery = includeEmpty
      ? Prisma.sql`${baseQuery} ORDER BY COUNT(l.id) DESC, c.name ASC`
      : Prisma.sql`${baseQuery} HAVING COUNT(l.id) > 0 ORDER BY COUNT(l.id) DESC, c.name ASC`;

    const result = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        slug: string;
        icon: string | null;
        count: number;
      }>
    >(finalQuery);

    // Return results (count is already a number due to CAST)
    return result;
  }
}
