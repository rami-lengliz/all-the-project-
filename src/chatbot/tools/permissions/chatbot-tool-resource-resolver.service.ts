import { Injectable, Logger } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ChatbotToolResourceResolverService {
  private readonly logger = new Logger(ChatbotToolResourceResolverService.name);

  constructor(private prisma: PrismaService) {}

  public async isListingPublicOrOwner(listingId: string, userId: string, isAdmin: boolean): Promise<{ isPublic: boolean; isOwner: boolean; exists: boolean }> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { 
        id: true, 
        hostId: true, 
        status: true,
        isActive: true
       }
    });

    if (!listing) return { isPublic: false, isOwner: false, exists: false };

    const isOwner = listing.hostId === userId;
    const isPublic = listing.isActive && listing.status === ListingStatus.ACTIVE;

    return { isPublic, isOwner, exists: true };
  }

  public async isBookingParticipant(bookingId: string, userId: string, isAdmin: boolean): Promise<{ isParticipant: boolean; exists: boolean }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        renterId: true,
        hostId: true
      }
    });

    if (!booking) return { isParticipant: false, exists: false };

    const isParticipant = isAdmin || booking.renterId === userId || booking.hostId === userId;
    return { isParticipant, exists: true };
  }

  public async isListingOwner(listingId: string, userId: string, isAdmin: boolean): Promise<{ isOwner: boolean; exists: boolean }> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { hostId: true }
    });

    if (!listing) return { isOwner: false, exists: false };

    const isOwner = isAdmin || listing.hostId === userId;
    return { isOwner, exists: true };
  }
}
