import {
  Injectable,
  Inject,
  forwardRef,
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
import { BLOCKING_BOOKING_STATUSES } from '../../common/constants/booking-status.constants';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { EmbeddingService } from '../ai/embedding.service';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  // Allowed category slugs for MVP scope (all categories)
  private readonly ALLOWED_CATEGORY_SLUGS = [
    'stays',
    'sports-facilities',
    'mobility',
    'beach-gear',
  ];

  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
    private mlService: MlService,
    private configService: ConfigService,
    private cloudinaryService: CloudinaryService,
    @Inject(forwardRef(() => EmbeddingService))
    private embeddingService: EmbeddingService,
  ) {}

  async create(
    createListingDto: CreateListingDto,
    hostId: string,
    imageFiles?: Express.Multer.File[],
  ): Promise<{ listing: Listing; mlSuggestions: any }> {
    try {
      if (!imageFiles || imageFiles.length === 0) {
        throw new BadRequestException('At least one image is required');
      }
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

      const cancellationPolicy = (createListingDto as any).cancellationPolicy ?? 'MODERATE';
      await this.prisma.$executeRaw`
        INSERT INTO listings (
          id, "hostId", title, description, "categoryId", images, "pricePerDay",
          location, address, rules, availability, "isActive", status, "bookingType",
          "cancellation_policy", "createdAt", "updatedAt"
        ) VALUES (
          ${listingId}::uuid, ${hostId}, ${createListingDto.title}, ${createListingDto.description},
          ${createListingDto.categoryId}, ARRAY[]::text[], ${createListingDto.pricePerDay},
          ST_SetSRID(ST_GeomFromText(${locationWKT}), 4326), ${createListingDto.address},
          ${createListingDto.rules || null}, ${createListingDto.availability ? JSON.stringify(createListingDto.availability) : null}::jsonb,
          true, 'ACTIVE'::"ListingStatus", ${bookingType}::"BookingType",
          ${cancellationPolicy}::"CancellationPolicy", NOW(), NOW()
        )
        RETURNING *
      `;

      // Get the created listing
      const listing = await this.prisma.listing.findUnique({
        where: { id: listingId },
      });

      if (!listing) {
        throw new Error('Failed to create listing');
      }

      // Process image files — upload to Cloudinary (production) or local disk (dev fallback)
      const imageUrls: string[] = [];
      if (imageFiles && imageFiles.length > 0) {
        // Attempt Cloudinary upload first
        const cloudinaryResults = await this.cloudinaryService.uploadFiles(
          imageFiles,
          `rentai/listings/${listing.id}`,
        );

        const useCloudinary = cloudinaryResults.some((url) => url !== null);

        if (useCloudinary) {
          // All uploaded to Cloudinary — use returned HTTPS URLs
          for (const url of cloudinaryResults) {
            if (url) imageUrls.push(url);
          }
        } else {
          // Cloudinary not configured — fallback to local disk (dev only)
          const baseDir =
            this.configService.get<string>('upload.dir') || './uploads';
          const listingDir = path.join(baseDir, 'listings', listing.id);
          if (!fs.existsSync(listingDir)) {
            fs.mkdirSync(listingDir, { recursive: true });
          }
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
            if (tempPath && fs.existsSync(tempPath)) {
              fs.renameSync(tempPath, filePath);
            } else {
              fs.writeFileSync(filePath, file.buffer);
            }
            imageUrls.push(`/uploads/listings/${listing.id}/${fileName}`);
          }
        }

        // Update listing with image URLs
        await this.prisma.listing.update({
          where: { id: listing.id },
          data: { images: imageUrls },
        });
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

      // Fire-and-forget: embed the new listing so it appears in semantic search
      // immediately without blocking the HTTP response.
      void this.embeddingService.upsertListingEmbedding(listing.id);

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
      // Build conditions
      const conditions: string[] = [
        'l."isActive" = true',
        'l."deletedAt" IS NULL',
        'l."status" = \'ACTIVE\'',
      ];
      const params: any[] = [];
      let paramIndex = 1;

      // ── Text search: FTS (ts_rank) + ILIKE fallback ──────────────────────────
      // $N  = raw query string for websearch_to_tsquery
      // $N+1 = %q% pattern for ILIKE fallback (in case tsv column is NULL)
      let tsvRankSelect = '0.0 as tsv_rank';
      let ftsParamIdx: number | null = null;

      if (filters.q) {
        const ftsP  = paramIndex;
        const ilikeP = paramIndex + 1;
        conditions.push(
          `(l.tsv @@ websearch_to_tsquery('french', $${ftsP}) OR l.title ILIKE $${ilikeP} OR l.description ILIKE $${ilikeP})`,
        );
        params.push(filters.q, `%${filters.q}%`);
        ftsParamIdx   = ftsP;
        tsvRankSelect = `ts_rank(coalesce(l.tsv, ''::tsvector), websearch_to_tsquery('french', $${ftsP})) as tsv_rank`;
        paramIndex   += 2;
      }

      // ── Multi-amenity AND filtering (improvement #3) ──────────────────────
      if (filters.amenities && filters.amenities.length > 0) {
        for (const amenity of filters.amenities) {
          conditions.push(
            `(l.title ILIKE $${paramIndex} OR l.description ILIKE $${paramIndex})`,
          );
          params.push(`%${amenity}%`);
          paramIndex++;
        }
      }

      // Filter by category (by ID or by slug)
      if (filters.category) {
        conditions.push(`l."categoryId" = $${paramIndex}`);
        params.push(filters.category);
        paramIndex++;
      } else if (filters.categorySlug) {
        // Categories table is already LEFT JOINed below as `c`
        conditions.push(`c.slug = $${paramIndex}`);
        params.push(filters.categorySlug);
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
      // Default: rank by FTS relevance when there's a keyword, else by recency
      let orderByClause = ftsParamIdx !== null
        ? 'tsv_rank DESC, l."createdAt" DESC'
        : 'l."createdAt" DESC';

      if (hasLatLng) {
        const lat = filters.lat as number;
        const lng = filters.lng as number;

        // Only apply radius filter when radiusKm is explicitly provided (> 0).
        // When omitted (map "show all" mode), skip ST_DWithin but still sort by distance.
        if (filters.radiusKm !== undefined && filters.radiusKm > 0) {
          const radiusKm = Math.min(filters.radiusKm, 60);
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
        }

        if (filters.sortBy === 'distance') {
          distanceSelect = `, ST_Distance(
            l.location::geography,
            ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography
          ) as distance`;
          params.push(lng, lat);
          paramIndex += 2;
          orderByClause = 'distance ASC';
        } else if (ftsParamIdx !== null) {
          // Blended: FTS relevance first, then distance as tiebreaker
          distanceSelect = `, ST_Distance(
            l.location::geography,
            ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography
          ) as distance`;
          params.push(lng, lat);
          paramIndex += 2;
          orderByClause = 'tsv_rank DESC, distance ASC';
        }
      }

      // Explicit sort overrides
      if (filters.sortBy === 'price_asc')  orderByClause = 'l."pricePerDay" ASC';
      if (filters.sortBy === 'price_desc') orderByClause = 'l."pricePerDay" DESC';

      // Pagination
      const page = filters.page || 1;
      const limit = Math.min(filters.limit || 20, 200);
      const offset = (page - 1) * limit;

      // Build query
      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const query = `
        SELECT
          l.id, l.title, l.description, l."pricePerDay",
          ST_AsGeoJSON(l.location)::text as location, l.address, l.images, l."createdAt", l."bookingType",
          l.rating_avg as "listing_ratingAvg", l.booking_count_30d as "listing_bookingCount30d",
          c.id as "category_id", c.name as "category_name", c.icon as "category_icon", c.slug as "category_slug",
          h.id as "host_id", h.name as "host_name", h."ratingAvg" as "host_ratingAvg"
          ${distanceSelect}
          , ${tsvRankSelect}
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
        ratingAvg: Number(row.listing_ratingAvg ?? 0),
        bookingCount30d: Number(row.listing_bookingCount30d ?? 0),
        tsvRank: Number(row.tsv_rank ?? 0),
        distance: row.distance != null ? Number(row.distance) : undefined,
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
        // Only show ACTIVE listings in public fallback
        (where as any).status = 'ACTIVE';
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
        const limit = Math.min(filters.limit || 20, 200);

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
        // Bound both relations — a popular listing can accumulate thousands of
        // each, and we never render more than ~20 on the detail page anyway.
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!listing || !listing.isActive || listing.deletedAt) {
      throw new NotFoundException(`Listing with ID ${id} not found`);
    }

    return listing;
  }

  async findManyByIds(ids: string[]): Promise<Listing[]> {
    if (!ids || ids.length === 0) return [];
    const listings = await this.prisma.listing.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        deletedAt: null,
      },
      include: {
        category: true,
        host: {
          select: {
            id: true,
            name: true,
            ratingAvg: true,
            ratingCount: true,
            verifiedEmail: true,
            verifiedPhone: true,
          },
        },
      },
    });

    // Stable ordering: match the input ids array
    return ids
      .map((id) => listings.find((l) => l.id === id))
      .filter((l): l is any => !!l);
  }

  async compareListings(ids: string[]) {
    const listings = await this.findManyByIds(ids);
    if (!listings.length) return { listings: [], insights: null };

    let bestValueId = listings[0].id;
    let lowestPrice = Number(listings[0].pricePerDay);
    
    let bestRatedId = listings[0].id;
    let highestRating = Number((listings[0] as any).host?.ratingAvg || 0);

    let mostExperiencedHostId = listings[0].id;
    let highestCount = Number((listings[0] as any).host?.ratingCount || 0);

    for (const l of listings) {
      const price = Number(l.pricePerDay);
      if (price < lowestPrice) {
        lowestPrice = price;
        bestValueId = l.id;
      }

      const rating = Number((l as any).host?.ratingAvg || 0);
      if (rating > highestRating) {
        highestRating = rating;
        bestRatedId = l.id;
      }

      const count = Number((l as any).host?.ratingCount || 0);
      if (count > highestCount) {
        highestCount = count;
        mostExperiencedHostId = l.id;
      }
    }

    const summaries: Record<string, string> = {};
    for (const l of listings) {
      const isBestValue = l.id === bestValueId;
      const isBestRated = l.id === bestRatedId;
      const isExperienced = l.id === mostExperiencedHostId;
      const isVerified = (l as any).host?.verifiedEmail && (l as any).host?.verifiedPhone;
      const isSlot = l.bookingType === 'SLOT';

      const tags = [];
      if (isBestValue) tags.push("most affordable");
      if (isBestRated) tags.push("highest rated");
      if (isExperienced) tags.push("most reviewed host");
      if (isVerified) tags.push("fully verified host");
      if (isSlot) tags.push("flexible hourly booking");

      if (tags.length === 0) {
        summaries[l.id] = "Standard alternative. Consider evaluating specific rules or location.";
      } else if (tags.length === 1) {
        summaries[l.id] = `Standout feature: ${tags[0]}.`;
      } else {
        const lastTag = tags.pop();
        summaries[l.id] = `Excellent choice: ${tags.join(", ")} and ${lastTag}.`;
      }
    }

    return {
      listings,
      insights: {
        bestValueId,
        bestRatedId,
        mostExperiencedHostId,
        summaries,
      },
    };
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
          if (url.includes('cloudinary.com')) {
            // Delete from Cloudinary
            this.cloudinaryService.deleteFile(url).catch((e) => {
              this.logger.warn(`Failed to delete image file from Cloudinary: ${url}`, e);
            });
          } else {
            // Delete file from filesystem
            try {
              const filePath = url.replace('/uploads/', path.join(baseDir, ''));
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            } catch (e) {
              this.logger.warn(`Failed to delete local image file: ${url}`, e);
            }
          }
        }
        return !shouldRemove;
      });
    }

    // Handle new image uploads — use Cloudinary (production) or local disk (dev fallback)
    if (imageFiles && imageFiles.length > 0) {
      // Attempt Cloudinary upload first
      const cloudinaryResults = await this.cloudinaryService.uploadFiles(
        imageFiles,
        `rentai/listings/${listing.id}`,
      );

      const useCloudinary = cloudinaryResults.some((url) => url !== null);

      if (useCloudinary) {
        // Cloudinary succeeded — use returned HTTPS URLs
        for (const url of cloudinaryResults) {
          if (url) currentImages.push(url);
        }
      } else {
        // Cloudinary not configured — fallback to local disk (dev only)
        const baseDir =
          this.configService.get<string>('upload.dir') || './uploads';
        const listingDir = path.join(baseDir, 'listings', listing.id);

        if (!fs.existsSync(listingDir)) {
          fs.mkdirSync(listingDir, { recursive: true });
        }

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
          if (tempPath && fs.existsSync(tempPath)) {
            fs.renameSync(tempPath, filePath);
          } else {
            fs.writeFileSync(filePath, file.buffer);
          }

          currentImages.push(`/uploads/listings/${listing.id}/${fileName}`);
        }
      }
    }

    // Ensure at least one image remains
    if (currentImages.length === 0) {
      throw new BadRequestException('Listing must have at least one image');
    }

    updateData.images = currentImages;

    const updated = await this.prisma.listing.update({
      where: { id },
      data: updateData,
    });

    // Re-embed when title or description changed so similarity stays accurate.
    if (updateListingDto.title || updateListingDto.description) {
      void this.embeddingService.upsertListingEmbedding(id);
    }

    return updated;
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

      // Clean up files safely
      if (listing.images && listing.images.length > 0) {
        const cloudinaryUrls = listing.images.filter((u) => u.includes('cloudinary.com'));
        if (cloudinaryUrls.length > 0) {
          this.cloudinaryService.deleteFiles(cloudinaryUrls).catch((e) => {
            this.logger.warn(`Failed to delete Cloudinary images for listing ${id}`, e);
          });
        }
        
        // local disk cleanup fallback
        const baseDir = this.configService.get<string>('upload.dir') || './uploads';
        const listingDir = path.join(baseDir, 'listings', id);
        if (fs.existsSync(listingDir)) {
          try {
             fs.rmSync(listingDir, { recursive: true, force: true });
          } catch (e) {
             this.logger.warn(`Failed to delete local image directory for listing ${id}`, e);
          }
        }
      }
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

  async updateSlotConfiguration(
    listingId: string,
    dto: {
      pricePerSlot?: number;
      slotDurationMinutes?: number;
      operatingHours?: unknown;
      minBookingSlots?: number;
      maxBookingSlots?: number | null;
      bufferMinutes?: number;
    },
    userId: string,
  ): Promise<any> {
    const listing = await this.findOne(listingId);
    if (listing.hostId !== userId) {
      throw new ForbiddenException('You can only configure your own listings');
    }
    const existing = await this.prisma.slotConfiguration.findUnique({
      where: { listingId },
    });
    if (!existing) {
      throw new NotFoundException('Slot configuration not found for this listing');
    }

    const data: Record<string, unknown> = {};
    if (dto.pricePerSlot != null) data.pricePerSlot = dto.pricePerSlot;
    if (dto.slotDurationMinutes != null) data.slotDurationMinutes = dto.slotDurationMinutes;
    if (dto.operatingHours != null) data.operatingHours = dto.operatingHours;
    if (dto.minBookingSlots != null) data.minBookingSlots = dto.minBookingSlots;
    if ('maxBookingSlots' in dto) data.maxBookingSlots = dto.maxBookingSlots;
    if (dto.bufferMinutes != null) data.bufferMinutes = dto.bufferMinutes;

    return this.prisma.slotConfiguration.update({
      where: { listingId },
      data,
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
        status: { in: [...BLOCKING_BOOKING_STATUSES] },
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

  /**
   * Return all listings for a given host, regardless of status.
   * Used by the host dashboard (GET /api/listings/mine).
   */
  async findAllForHost(hostId: string): Promise<any[]> {
    return this.prisma.listing.findMany({
      where: {
        hostId,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        description: true,
        pricePerDay: true,
        address: true,
        images: true,
        createdAt: true,
        bookingType: true,
        isActive: true,
        status: true,
        category: {
          select: { id: true, name: true, icon: true, slug: true },
        },
        host: {
          select: { id: true, name: true, ratingAvg: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
