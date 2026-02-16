import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Listing, Prisma } from '@prisma/client';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { FilterListingsDto } from './dto/filter-listings.dto';
import { CategoriesService } from '../categories/categories.service';
import { MlService } from '../ml/ml.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  // Allowed category slugs for MVP scope (all categories)
  private readonly ALLOWED_CATEGORY_SLUGS = [
    'accommodation',
    'mobility',
    'water-beach-activities',
    'sports-facilities',
    'sports-equipment',
    'tools',
    'other',
  ];

  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
    private mlService: MlService,
    private configService: ConfigService,
  ) { }

  async create(
    createListingDto: CreateListingDto,
    hostId: string,
    imageFiles?: Express.Multer.File[],
  ): Promise<{ listing: Listing; mlSuggestions: any }> {
    try {
      // Validate category allows private listings and is in allowed list
      const category = await this.categoriesService.findOne(
        createListingDto.categoryId,
      );

      if (!category.allowedForPrivate) {
        throw new BadRequestException(
          'This category does not allow private listings',
        );
      }

      // Note: Category restriction removed to support full MVP scope
      // All categories with allowedForPrivate=true are now permitted

      // Create listing first to get ID for image folder
      // Note: PostGIS geometry is stored as WKT (Well-Known Text) in Prisma
      const locationWKT = `POINT(${createListingDto.longitude} ${createListingDto.latitude})`;

      // Determine booking type (default to DAILY if not specified)
      const bookingType = createListingDto.bookingType || 'DAILY';

      // Generate UUID in Node.js for portability (no pgcrypto extension needed)
      const listingId = crypto.randomUUID();

      const savedListing = (await this.prisma.$executeRaw`
        INSERT INTO listings (
          id, "hostId", title, description, "categoryId", images, "pricePerDay",
          location, address, rules, availability, "isActive", "bookingType", "createdAt", "updatedAt"
        ) VALUES (
          ${listingId}::uuid, ${hostId}, ${createListingDto.title}, ${createListingDto.description},
          ${createListingDto.categoryId}, ARRAY[]::text[], ${createListingDto.pricePerDay},
          ST_SetSRID(ST_GeomFromText(${locationWKT}), 4326), ${createListingDto.address},
          ${createListingDto.rules || null}, ${createListingDto.availability ? JSON.stringify(createListingDto.availability) : null}::jsonb,
          true, ${bookingType}::"BookingType", NOW(), NOW()
        )
        RETURNING *
      `) as any;

      // Get the created listing
      const listing = await this.prisma.listing.findUnique({
        where: { id: listingId },
      });

      if (!listing) {
        throw new Error('Failed to create listing');
      }

      // Process image files and save to listing-specific folder
      const imageUrls: string[] = [];
      if (imageFiles && imageFiles.length > 0) {
        const baseDir =
          this.configService.get<string>('upload.dir') || './uploads';
        const listingDir = path.join(baseDir, 'listings', listing.id);

        // Ensure listing directory exists
        if (!fs.existsSync(listingDir)) {
          fs.mkdirSync(listingDir, { recursive: true });
        }

        for (const file of imageFiles) {
          // Generate unique filename
          const timestamp = Date.now();
          const randomStr = Array(8)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          const ext = path.extname(file.originalname);
          const fileName = `${timestamp}-${randomStr}${ext}`;
          const filePath = path.join(listingDir, fileName);

          // Move file from temp to listing folder
          const tempPath = file.path;
          if (fs.existsSync(tempPath)) {
            fs.renameSync(tempPath, filePath);
          } else {
            // If file wasn't saved to temp (shouldn't happen), write buffer
            fs.writeFileSync(filePath, file.buffer);
          }

          // Store relative URL for public access
          imageUrls.push(`/uploads/listings/${listing.id}/${fileName}`);
        }

        // Update listing with image URLs
        await this.prisma.listing.update({
          where: { id: listing.id },
          data: { images: imageUrls },
        });
      }

      // Require at least one image
      if (imageUrls.length === 0) {
        throw new BadRequestException('At least one image is required');
      }

      // Get updated listing with images
      const finalListing = await this.prisma.listing.findUnique({
        where: { id: listing.id },
      });

      // Call ML service for suggestions
      const mlSuggestions = {
        category: await this.mlService.suggestCategory({
          title: createListingDto.title,
          images: imageUrls,
        }),
        price: await this.mlService.suggestPrice({
          categorySlug: category.slug,
          location: {
            latitude: createListingDto.latitude,
            longitude: createListingDto.longitude,
          },
          images: imageUrls,
        }),
      };

      return { listing: finalListing!, mlSuggestions };
    } catch (error) {
      this.logger.error('Failed to create listing', error.stack);
      throw error;
    }
  }

  async findAll(filters: FilterListingsDto = {}): Promise<any[]> {
    const hasLatLng =
      typeof filters.lat === 'number' &&
      Number.isFinite(filters.lat) &&
      typeof filters.lng === 'number' &&
      Number.isFinite(filters.lng);

    try {
      fs.appendFileSync(
        'debug_findAll.log',
        `findAll called with filters: ${JSON.stringify(filters)}\n`,
      );
      // Build conditions
      const conditions: string[] = [
        'l."isActive" = true',
        'l."deletedAt" IS NULL',
      ];
      const params: any[] = [];
      let paramIndex = 1;

      // Text search
      if (filters.q) {
        conditions.push(
          `(l.title ILIKE $${paramIndex} OR l.description ILIKE $${paramIndex})`,
        );
        params.push(`%${filters.q}%`);
        paramIndex++;
      }

      // Filter by category
      if (filters.category) {
        conditions.push(`l."categoryId" = $${paramIndex}`);
        params.push(filters.category);
        paramIndex++;
      }

      // Filter by price range
      if (filters.minPrice) {
        conditions.push(`l."pricePerDay" >= $${paramIndex}`);
        params.push(filters.minPrice);
        paramIndex++;
      }
      if (filters.maxPrice) {
        conditions.push(`l."pricePerDay" <= $${paramIndex}`);
        params.push(filters.maxPrice);
        paramIndex++;
      }

      // Geo search
      let distanceSelect = '';
      let orderByClause = 'l."createdAt" DESC';

      if (hasLatLng) {
        const lat = filters.lat as number;
        const lng = filters.lng as number;
        const radiusKm = Math.min(filters.radiusKm || 10, 50);
        const maxDistanceMeters = radiusKm * 1000;

        conditions.push(`
          ST_DWithin(
            l.location::geography,
            ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography,
            $${paramIndex + 2}
          )
        `);
        params.push(lng, lat, maxDistanceMeters);
        paramIndex += 3;

        if (filters.sortBy === 'distance') {
          distanceSelect = `, ST_Distance(
            l.location::geography,
            ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography
          ) as distance`;
          params.push(lng, lat);
          paramIndex += 2;
          orderByClause = 'distance ASC';
        }
      }

      // Pagination
      const page = filters.page || 1;
      const limit = Math.min(filters.limit || 20, 100);
      const offset = (page - 1) * limit;

      // Build query
      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const query = `
        SELECT 
          l.id, l.title, l.description, l."pricePerDay",
          ST_AsGeoJSON(l.location)::text as location, l.address, l.images, l."createdAt", l."bookingType",
          c.id as "category_id", c.name as "category_name", c.icon as "category_icon", c.slug as "category_slug",
          h.id as "host_id", h.name as "host_name", h."ratingAvg" as "host_ratingAvg"
          ${distanceSelect}
        FROM listings l
        LEFT JOIN categories c ON l."categoryId" = c.id
        LEFT JOIN users h ON l."hostId" = h.id
        ${whereClause}
        ORDER BY ${orderByClause}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const results = await this.prisma.$queryRawUnsafe(query, ...params);

      // Transform results to match expected format
      return (results as any[]).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        pricePerDay: row.pricePerDay,
        location: row.location ? JSON.parse(row.location) : null,
        address: row.address,
        images: row.images,
        createdAt: row.createdAt,
        bookingType: row.bookingType,
        category: {
          id: row.category_id,
          name: row.category_name,
          icon: row.category_icon,
          slug: row.category_slug,
        },
        host: {
          id: row.host_id,
          name: row.host_name,
          ratingAvg: row.host_ratingAvg,
        },
      }));
    } catch (e: any) {
      // Defensive fallback
      const msg = String(e?.message || e);
      this.logger.warn(`Listings search failed, retrying without geo. ${msg}`);

      try {
        // Fallback to simple query without geo
        const where: Prisma.ListingWhereInput = {
          isActive: true,
          deletedAt: null,
        };

        if (filters.q) {
          where.OR = [
            { title: { contains: filters.q, mode: 'insensitive' } },
            { description: { contains: filters.q, mode: 'insensitive' } },
          ];
        }
        if (filters.category) {
          where.categoryId = filters.category;
        }
        if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
          where.pricePerDay = {};
          if (filters.minPrice) {
            where.pricePerDay.gte = filters.minPrice;
          }
          if (filters.maxPrice) {
            where.pricePerDay.lte = filters.maxPrice;
          }
        }

        const page = filters.page || 1;
        const limit = Math.min(filters.limit || 20, 100);

        return await this.prisma.listing.findMany({
          where,
          select: {
            id: true,
            title: true,
            description: true,
            pricePerDay: true,
            address: true,
            images: true,
            createdAt: true,
            bookingType: true,
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
                slug: true,
              },
            },
            host: {
              select: {
                id: true,
                name: true,
                ratingAvg: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        });
      } catch (e2: any) {
        this.logger.error(
          `Listings fallback search failed; returning empty list. ${String(e2?.message || e2)}`,
        );
        return [];
      }
    }
  }

  async findOne(
    id: string,
  ): Promise<
    Listing & { category?: any; host?: any; bookings?: any[]; reviews?: any[] }
  > {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        category: true,
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            isHost: true,
            ratingAvg: true,
            ratingCount: true,
          },
        },
        bookings: true,
        reviews: true,
      },
    });

    if (!listing || !listing.isActive || listing.deletedAt) {
      throw new NotFoundException(`Listing with ID ${id} not found`);
    }

    return listing;
  }

  async update(
    id: string,
    updateListingDto: UpdateListingDto,
    userId: string,
    isAdmin: boolean = false,
    imageFiles?: Express.Multer.File[],
    imagesToRemove?: string[],
  ): Promise<Listing> {
    const listing = await this.findOne(id);
    if (!isAdmin && listing.hostId !== userId) {
      throw new ForbiddenException('You can only update your own listings');
    }

    const updateData: any = { ...updateListingDto };

    // Update location if lat/lng provided
    if (updateListingDto.latitude && updateListingDto.longitude) {
      const locationWKT = `POINT(${updateListingDto.longitude} ${updateListingDto.latitude})`;
      await this.prisma.$executeRaw`
        UPDATE listings
        SET location = ST_SetSRID(ST_GeomFromText(${locationWKT}), 4326)
        WHERE id = ${id}
      `;
      delete updateData.latitude;
      delete updateData.longitude;
    }

    // Handle image removal
    let currentImages = listing.images || [];
    if (imagesToRemove && imagesToRemove.length > 0) {
      const baseDir =
        this.configService.get<string>('upload.dir') || './uploads';
      currentImages = currentImages.filter((url) => {
        const shouldRemove = imagesToRemove.includes(url);
        if (shouldRemove) {
          // Delete file from filesystem
          try {
            const filePath = url.replace('/uploads/', path.join(baseDir, ''));
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (e) {
            this.logger.warn(`Failed to delete image file: ${url}`, e);
          }
        }
        return !shouldRemove;
      });
    }

    // Handle new image uploads
    if (imageFiles && imageFiles.length > 0) {
      const baseDir =
        this.configService.get<string>('upload.dir') || './uploads';
      const listingDir = path.join(baseDir, 'listings', listing.id);

      if (!fs.existsSync(listingDir)) {
        fs.mkdirSync(listingDir, { recursive: true });
      }

      const newImageUrls: string[] = [];
      for (const file of imageFiles) {
        const timestamp = Date.now();
        const randomStr = Array(8)
          .fill(null)
          .map(() => Math.round(Math.random() * 16).toString(16))
          .join('');
        const ext = path.extname(file.originalname);
        const fileName = `${timestamp}-${randomStr}${ext}`;
        const filePath = path.join(listingDir, fileName);

        const tempPath = file.path;
        if (fs.existsSync(tempPath)) {
          fs.renameSync(tempPath, filePath);
        } else {
          fs.writeFileSync(filePath, file.buffer);
        }

        newImageUrls.push(`/uploads/listings/${listing.id}/${fileName}`);
      }

      // Append new images to existing ones
      currentImages = [...currentImages, ...newImageUrls];
    }

    // Ensure at least one image remains
    if (currentImages.length === 0) {
      throw new BadRequestException('Listing must have at least one image');
    }

    updateData.images = currentImages;

    return this.prisma.listing.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(
    id: string,
    userId: string,
    isAdmin: boolean = false,
  ): Promise<void> {
    const listing = await this.findOne(id);
    if (!isAdmin && listing.hostId !== userId) {
      throw new ForbiddenException('You can only delete your own listings');
    }

    if (isAdmin) {
      // Hard delete for admin
      await this.prisma.listing.delete({ where: { id } });
    } else {
      // Soft delete for hosts
      await this.prisma.listing.update({
        where: { id },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
      });
    }
  }

  async createSlotConfiguration(
    listingId: string,
    dto: any,
    userId: string,
  ): Promise<any> {
    const listing = await this.findOne(listingId);

    if (listing.hostId !== userId) {
      throw new ForbiddenException('You can only configure your own listings');
    }

    if (listing.bookingType !== 'SLOT') {
      throw new BadRequestException(
        'Listing must be SLOT type to configure slots',
      );
    }

    const existing = await this.prisma.slotConfiguration.findUnique({
      where: { listingId },
    });

    if (existing) {
      throw new BadRequestException(
        'Slot configuration already exists for this listing',
      );
    }

    return this.prisma.slotConfiguration.create({
      data: {
        listingId,
        slotDurationMinutes: dto.slotDurationMinutes,
        operatingHours: dto.operatingHours,
        minBookingSlots: dto.minBookingSlots,
        maxBookingSlots: dto.maxBookingSlots,
        bufferMinutes: dto.bufferMinutes,
        pricePerSlot: dto.pricePerSlot,
      },
    });
  }

  async getAvailableSlots(listingId: string, date: Date): Promise<any[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { slotConfiguration: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.bookingType !== 'SLOT') {
      throw new BadRequestException(
        'This endpoint is only for slot-based listings',
      );
    }

    if (!listing.slotConfiguration) {
      throw new NotFoundException(
        'Slot configuration not found for this listing',
      );
    }

    // Only fetch bookings that actually block availability
    // PENDING bookings do NOT block (they can be cancelled)
    const bookings = await this.prisma.booking.findMany({
      where: {
        listingId,
        startDate: date,
        status: { in: ['confirmed', 'paid', 'completed'] },
      },
    });

    const { AvailabilityService } =
      await import('../../common/utils/availability.service');
    const availabilityService = new AvailabilityService(this.prisma);

    return availabilityService.generateAvailableSlots(
      listing.slotConfiguration,
      date,
      bookings,
    );
  }
}
