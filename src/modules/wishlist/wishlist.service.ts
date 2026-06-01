import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PersonalizationService } from '../personalization/personalization.service';

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly personalization: PersonalizationService,
  ) {}

  /** All wishlisted listings for the current user, newest first. */
  async list(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            images: true,
            address: true,
            pricePerDay: true,
            ratingAvg: true,
            qualityScore: true,
            isActive: true,
            deletedAt: true,
          },
        },
      },
    });
    // Filter out soft-deleted / inactive listings so users don't see broken links
    return items
      .filter((i) => i.listing.isActive && !i.listing.deletedAt)
      .map((i) => i.listing);
  }

  /** Add a listing to the wishlist. Idempotent. Returns true if added (vs already present). */
  async add(userId: string, listingId: string): Promise<{ added: boolean }> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, isActive: true, deletedAt: true },
    });
    if (!listing || listing.deletedAt || !listing.isActive) {
      throw new NotFoundException('Listing not found');
    }

    try {
      await this.prisma.wishlistItem.create({
        data: { userId, listingId },
      });
      void this.personalization.recordInteraction(userId, listingId, 'WISHLIST_ADD');
      return { added: true };
    } catch (err: any) {
      // Unique constraint = already in wishlist; treat as no-op success.
      if (err?.code === 'P2002') return { added: false };
      throw err;
    }
  }

  /** Remove a listing. Idempotent. */
  async remove(userId: string, listingId: string): Promise<{ removed: number }> {
    const result = await this.prisma.wishlistItem.deleteMany({
      where: { userId, listingId },
    });
    if (result.count > 0) {
      void this.personalization.recordInteraction(userId, listingId, 'WISHLIST_REMOVE');
    }
    return { removed: result.count };
  }

  /** Cheap check: is this listing in the user's wishlist? */
  async has(userId: string, listingId: string): Promise<boolean> {
    const row = await this.prisma.wishlistItem.findUnique({
      where: { userId_listingId: { userId, listingId } },
      select: { id: true },
    });
    return !!row;
  }
}
