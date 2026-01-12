import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminLog } from '../../entities/admin-log.entity';
import { UsersService } from '../users/users.service';
import { ListingsService } from '../listings/listings.service';
import { FlagListingDto } from './dto/flag-listing.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AdminLog)
    private adminLogRepository: Repository<AdminLog>,
    private usersService: UsersService,
    private listingsService: ListingsService,
  ) {}

  async logAction(
    actorId: string,
    action: string,
    details?: Record<string, any>,
  ): Promise<AdminLog> {
    const log = this.adminLogRepository.create({
      actorId,
      action,
      details,
    });
    return this.adminLogRepository.save(log);
  }

  async getAllUsers() {
    return this.usersService.findAll();
  }

  async getAllListings() {
    // In a real implementation, you'd want pagination and filters
    // For now, return all active listings
    return this.listingsService.findAll({});
  }

  async flagListing(
    listingId: string,
    flagDto: FlagListingDto,
    actorId: string,
  ) {
    const listing = await this.listingsService.findOne(listingId);
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    // Log the flag action
    await this.logAction(actorId, 'flag_listing', {
      listingId,
      reason: flagDto.reason,
    });

    // TODO: In production, you might want to:
    // - Deactivate the listing
    // - Notify the host
    // - Create a moderation ticket

    return {
      message: 'Listing flagged successfully',
      listingId,
    };
  }

  async getLogs(limit: number = 100) {
    return this.adminLogRepository.find({
      relations: ['actor'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}

