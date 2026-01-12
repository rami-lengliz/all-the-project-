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

@Injectable()
export class ListingsService {
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

    // Process image files
    const imageUrls: string[] = [];
    if (imageFiles && imageFiles.length > 0) {
      const uploadDir = this.configService.get<string>('upload.dir');
      for (const file of imageFiles) {
        // In production, upload to S3; for now, save locally
        const fileName = `${Date.now()}-${file.originalname}`;
        const fs = require('fs');
        const path = require('path');
        const uploadPath = path.join(uploadDir, fileName);

        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        fs.writeFileSync(uploadPath, file.buffer);
        imageUrls.push(`/uploads/${fileName}`);
      }
    }

    // Create Point geometry from lat/lng
    const location: Point = {
      type: 'Point',
      coordinates: [createListingDto.longitude, createListingDto.latitude],
    };

    const listing = this.listingsRepository.create({
      ...createListingDto,
      location,
      images: imageUrls,
      hostId,
      bookingType: BookingType.DAILY,
    });

    const savedListing = await this.listingsRepository.save(listing);

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

    // PostGIS distance search
    if (filters.lat && filters.lng) {
      const lat = filters.lat;
      const lng = filters.lng;
      // Clamp radius to max 50km, default 10km
      const radiusKm = Math.min(filters.radiusKm || 10, 50);
      const maxDistance = radiusKm * 1000; // Convert km to meters

      queryBuilder.andWhere(
        `ST_Distance_Sphere(
          listing.location,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
        ) <= :maxDistance`,
        {
          lat,
          lng,
          maxDistance,
        },
      );

      // Add distance calculation for sorting
      queryBuilder.addSelect(
        `ST_Distance_Sphere(
          listing.location,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
        ) as distance`,
      );

      // Sort by distance if location provided
      if (filters.sortBy === 'distance') {
        queryBuilder.orderBy('distance', 'ASC');
      }
    }

    // Filter by availability
    if (filters.availableFrom && filters.availableTo) {
      queryBuilder
        .leftJoin('listing.bookings', 'booking')
        .andWhere(
          '(booking.id IS NULL OR NOT (booking.status = :confirmedStatus AND booking.startDate <= :availableTo AND booking.endDate >= :availableFrom))',
          {
            confirmedStatus: 'confirmed',
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

    return queryBuilder.getMany();
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
  ): Promise<Listing> {
    const listing = await this.findOne(id);
    if (!isAdmin && listing.hostId !== userId) {
      throw new ForbiddenException('You can only update your own listings');
    }

    // Update location if lat/lng provided
    if (updateListingDto.latitude && updateListingDto.longitude) {
      const location: Point = {
        type: 'Point',
        coordinates: [
          updateListingDto.longitude,
          updateListingDto.latitude,
        ],
      };
      listing.location = location;
    }

    Object.assign(listing, updateListingDto);
    return this.listingsRepository.save(listing);
  }

  async remove(id: string, userId: string, isAdmin: boolean = false): Promise<void> {
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
