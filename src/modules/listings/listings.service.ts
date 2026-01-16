import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Listing, BookingType } from '../../entities/listing.entity';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { FilterListingsDto } from './dto/filter-listings.dto';
import { CategoriesService } from '../categories/categories.service';
import { MlService } from '../ml/ml.service';
import { Point } from 'geojson';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  // Allowed category slugs for travel/vacation rentals
  private readonly ALLOWED_CATEGORY_SLUGS = [
    'accommodation',
    'mobility',
    'water-beach-activities',
  ];

  constructor(
    @InjectRepository(Listing)
    private listingsRepository: Repository<Listing>,
    private categoriesService: CategoriesService,
    private mlService: MlService,
    private configService: ConfigService,
    private dataSource: DataSource,
  ) {}

  async create(
    createListingDto: CreateListingDto,
    hostId: string,
    imageFiles?: Express.Multer.File[],
  ): Promise<{ listing: Listing; mlSuggestions: any }> {
    // Validate category allows private listings and is in allowed list
    const category = await this.categoriesService.findOne(
      createListingDto.categoryId,
    );

    if (!category.allowed_for_private) {
      throw new BadRequestException(
        'This category does not allow private listings',
      );
    }

    if (!this.ALLOWED_CATEGORY_SLUGS.includes(category.slug)) {
      throw new BadRequestException(
        'Only Accommodation, Mobility, and Water & Beach Activities categories are allowed',
      );
    }

    // Create Point geometry from lat/lng
    const location: Point = {
      type: 'Point',
      coordinates: [createListingDto.longitude, createListingDto.latitude],
    };

    // Create listing first to get ID for image folder
    const listing = this.listingsRepository.create({
      ...createListingDto,
      location,
      images: [],
      hostId,
      bookingType: BookingType.DAILY,
    });

    const savedListing = await this.listingsRepository.save(listing);

    // Process image files and save to listing-specific folder
    const imageUrls: string[] = [];
    if (imageFiles && imageFiles.length > 0) {
      const baseDir =
        this.configService.get<string>('upload.dir') || './uploads';
      const listingDir = path.join(baseDir, 'listings', savedListing.id);

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
        imageUrls.push(`/uploads/listings/${savedListing.id}/${fileName}`);
      }

      // Update listing with image URLs
      savedListing.images = imageUrls;
      await this.listingsRepository.save(savedListing);
    }

    // Require at least one image
    if (imageUrls.length === 0) {
      throw new BadRequestException('At least one image is required');
    }

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

    return { listing: savedListing, mlSuggestions };
  }

  async findAll(filters: FilterListingsDto = {}): Promise<Listing[]> {
    const queryBuilder = this.listingsRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.category', 'category')
      .leftJoinAndSelect('listing.host', 'host')
      .where('listing.isActive = :isActive', { isActive: true })
      .andWhere('listing.deletedAt IS NULL')
      .select([
        'listing.id',
        'listing.title',
        'listing.description',
        'listing.pricePerDay',
        'listing.location',
        'listing.address',
        'listing.images',
        'listing.createdAt',
        'listing.bookingType',
        'category.id',
        'category.name',
        'category.icon',
        'category.slug',
        'host.id',
        'host.name',
        'host.ratingAvg',
      ]);

    // Text search
    if (filters.q) {
      queryBuilder.andWhere(
        '(listing.title ILIKE :q OR listing.description ILIKE :q)',
        { q: `%${filters.q}%` },
      );
    }

    // Filter by category
    if (filters.category) {
      queryBuilder.andWhere('listing.categoryId = :categoryId', {
        categoryId: filters.category,
      });
    }

    // Filter by price range
    if (filters.minPrice) {
      queryBuilder.andWhere('listing.pricePerDay >= :minPrice', {
        minPrice: filters.minPrice,
      });
    }
    if (filters.maxPrice) {
      queryBuilder.andWhere('listing.pricePerDay <= :maxPrice', {
        maxPrice: filters.maxPrice,
      });
    }

    const hasLatLng =
      typeof filters.lat === 'number' &&
      Number.isFinite(filters.lat) &&
      typeof filters.lng === 'number' &&
      Number.isFinite(filters.lng);

    // Geo search is optional. We only apply geo filters when lat/lng are provided.
    // NOTE: Some environments may not have full PostGIS functions installed/available.
    // We guard and fallback below so read-only search never returns 500.
    if (hasLatLng) {
      const lat = filters.lat as number;
      const lng = filters.lng as number;
      const radiusKm = Math.min(filters.radiusKm || 10, 50);
      const maxDistanceMeters = radiusKm * 1000;

      // Filter within radius (geography) - supported by PostGIS.
      queryBuilder.andWhere(
        `ST_DWithin(
          listing.location::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
          :maxDistanceMeters
        )`,
        { lat, lng, maxDistanceMeters },
      );

      // Only compute distance when we actually need it (sorting).
      if (filters.sortBy === 'distance') {
        queryBuilder.addSelect(
          `ST_Distance(
            listing.location::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
          )`,
          'distance',
        );
        queryBuilder.orderBy('distance', 'ASC');
      }
    }

    // Filter by availability
    // Only CONFIRMED and PAID bookings block availability (PENDING does not)
    if (filters.availableFrom && filters.availableTo) {
      queryBuilder
        .leftJoin('listing.bookings', 'booking')
        .andWhere(
          '(booking.id IS NULL OR NOT (booking.status IN (:...blockingStatuses) AND booking.startDate < :availableTo AND booking.endDate > :availableFrom))',
          {
            blockingStatuses: ['confirmed', 'paid'],
            availableFrom: filters.availableFrom,
            availableTo: filters.availableTo,
          },
        );
    }

    // Pagination with clamp
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100); // Max 100
    queryBuilder.skip((page - 1) * limit).take(limit);

    // Default sort
    if (!filters.sortBy || filters.sortBy !== 'distance') {
      queryBuilder.orderBy('listing.createdAt', 'DESC');
    }

    try {
      return await queryBuilder.getMany();
    } catch (e: any) {
      // Defensive fallback: never 500 on read-only search.
      // If PostGIS functions are missing/unavailable, retry without geo constraints/sorting.
      const msg = String(e?.message || e);
      this.logger.warn(`Listings search failed, retrying without geo. ${msg}`);

      try {
        const fallback = this.listingsRepository
          .createQueryBuilder('listing')
          .leftJoinAndSelect('listing.category', 'category')
          .leftJoinAndSelect('listing.host', 'host')
          .where('listing.isActive = :isActive', { isActive: true })
          .andWhere('listing.deletedAt IS NULL')
          .select([
            'listing.id',
            'listing.title',
            'listing.description',
            'listing.pricePerDay',
            'listing.location',
            'listing.address',
            'listing.images',
            'listing.createdAt',
            'listing.bookingType',
            'category.id',
            'category.name',
            'category.icon',
            'category.slug',
            'host.id',
            'host.name',
            'host.ratingAvg',
          ]);

        if (filters.q) {
          fallback.andWhere(
            '(listing.title ILIKE :q OR listing.description ILIKE :q)',
            {
              q: `%${filters.q}%`,
            },
          );
        }
        if (filters.category) {
          fallback.andWhere('listing.categoryId = :categoryId', {
            categoryId: filters.category,
          });
        }
        if (filters.minPrice) {
          fallback.andWhere('listing.pricePerDay >= :minPrice', {
            minPrice: filters.minPrice,
          });
        }
        if (filters.maxPrice) {
          fallback.andWhere('listing.pricePerDay <= :maxPrice', {
            maxPrice: filters.maxPrice,
          });
        }

        if (filters.availableFrom && filters.availableTo) {
          fallback
            .leftJoin('listing.bookings', 'booking')
            .andWhere(
              '(booking.id IS NULL OR NOT (booking.status IN (:...blockingStatuses) AND booking.startDate < :availableTo AND booking.endDate > :availableFrom))',
              {
                blockingStatuses: ['confirmed', 'paid'],
                availableFrom: filters.availableFrom,
                availableTo: filters.availableTo,
              },
            );
        }

        const page = filters.page || 1;
        const limit = Math.min(filters.limit || 20, 100);
        fallback.skip((page - 1) * limit).take(limit);
        fallback.orderBy('listing.createdAt', 'DESC');

        return await fallback.getMany();
      } catch (e2: any) {
        this.logger.error(
          `Listings fallback search failed; returning empty list. ${String(e2?.message || e2)}`,
        );
        return [];
      }
    }
  }

  async findOne(id: string): Promise<Listing> {
    const listing = await this.listingsRepository.findOne({
      where: { id, isActive: true, deletedAt: null },
      relations: ['category', 'host', 'bookings', 'reviews'],
    });
    if (!listing) {
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

    // Update location if lat/lng provided
    if (updateListingDto.latitude && updateListingDto.longitude) {
      const location: Point = {
        type: 'Point',
        coordinates: [updateListingDto.longitude, updateListingDto.latitude],
      };
      listing.location = location;
    }

    // Handle image removal
    if (imagesToRemove && imagesToRemove.length > 0) {
      const baseDir =
        this.configService.get<string>('upload.dir') || './uploads';
      const currentImages = listing.images || [];
      const updatedImages = currentImages.filter((url) => {
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
      listing.images = updatedImages;
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
      listing.images = [...(listing.images || []), ...newImageUrls];
    }

    // Ensure at least one image remains
    if (listing.images && listing.images.length === 0) {
      throw new BadRequestException('Listing must have at least one image');
    }

    Object.assign(listing, updateListingDto);
    return this.listingsRepository.save(listing);
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
      await this.listingsRepository.remove(listing);
    } else {
      // Soft delete for hosts
      listing.isActive = false;
      listing.deletedAt = new Date();
      await this.listingsRepository.save(listing);
    }
  }
}
