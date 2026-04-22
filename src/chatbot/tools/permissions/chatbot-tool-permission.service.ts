import { Injectable, Logger } from '@nestjs/common';
import { ChatbotToolResourceResolverService } from './chatbot-tool-resource-resolver.service';
import { ChatbotToolContext, ChatbotToolPermissionResult } from './chatbot-tool-permission.types';

@Injectable()
export class ChatbotToolPermissionService {
  private readonly logger = new Logger(ChatbotToolPermissionService.name);

  // List of all currently active/registered tools in Chatbot Tool Governance
  private readonly ALL_TOOLS = [
    'search_listings',
    'get_listing_details',
    'get_my_bookings',
    'get_booking_details',
    'get_host_listings',
    'get_host_booking_requests',
    'help_center_search',
    'contact_host_about_booking',
    'request_booking_help',
    'cancel_my_booking_if_allowed',
    'compare_listings'
  ];

  constructor(private resolver: ChatbotToolResourceResolverService) {}

  /**
   * Returns tools that user can *potentially* invoke without explicit argument checking.
   * Useful for informing the LLM of its capabilities proactively mapping.
   */
  public getAllowedToolNames(context?: ChatbotToolContext): string[] {
     if (!context || !context.userId) return ['help_center_search']; // Unauthenticated fallback

     // For now, authenticated users get the full slate presented to the LLM.
     // Actual authorization enforces parameters when executed natively.
     return this.ALL_TOOLS;
  }

  /**
   * Enforces rigorous execution checks dynamically.
   */
  public async checkPermission(
    toolName: string, 
    args: any, 
    context?: ChatbotToolContext
  ): Promise<ChatbotToolPermissionResult> {
    if (!context || !context.userId) {
       return { allowed: false, reasonCode: 'UNAUTHENTICATED' };
    }

    const { userId, role } = context;
    const isAdmin = role === 'ADMIN';

    switch (toolName) {
      case 'search_listings':
      case 'help_center_search':
      case 'compare_listings':
        // Safe global reads natively bounded
        return { allowed: true };

      case 'get_my_bookings':
        // Booking resolution handled gracefully internally, inherently scoping queries strictly down to `userId`
        return { allowed: true };

      case 'get_host_listings':
      case 'get_host_booking_requests':
        // Both only fetch resources matching hostId = userId inherently safely.
        // We will validate their input explicitly inside their handlers or here generically mapping.
        if (args.listingId) {
            const { exists, isOwner } = await this.resolver.isListingOwner(args.listingId, userId, isAdmin);
            if (!exists) return { allowed: false, reasonCode: 'LISTING_NOT_FOUND' };
            if (!isOwner) return { allowed: false, reasonCode: 'LISTING_NOT_OWNED' };
        }
        return { allowed: true };

      case 'get_listing_details':
        if (!args.listingId) return { allowed: false, reasonCode: 'MISSING_ARGS' };
        
        const listingResolve = await this.resolver.isListingPublicOrOwner(args.listingId, userId, isAdmin);
        
        if (!listingResolve.exists) return { allowed: false, reasonCode: 'LISTING_NOT_FOUND' };
        if (!listingResolve.isPublic && !listingResolve.isOwner && !isAdmin) {
           return { allowed: false, reasonCode: 'LISTING_NOT_PUBLIC' };
        }
        return { allowed: true };

      case 'get_booking_details':
        if (!args.bookingId) return { allowed: false, reasonCode: 'MISSING_ARGS' };
        
        const bookingResolve = await this.resolver.isBookingParticipant(args.bookingId, userId, isAdmin);
        
        if (!bookingResolve.exists) return { allowed: false, reasonCode: 'BOOKING_NOT_FOUND' };
        if (!bookingResolve.isParticipant) {
           return { allowed: false, reasonCode: 'NOT_BOOKING_PARTICIPANT' };
        }
        return { allowed: true };

      case 'contact_host_about_booking':
      case 'request_booking_help':
      case 'cancel_my_booking_if_allowed':
        if (!args.bookingId) return { allowed: false, reasonCode: 'MISSING_ARGS' };
        const mutResolve = await this.resolver.isBookingParticipant(args.bookingId, userId, isAdmin);
        if (!mutResolve.exists) return { allowed: false, reasonCode: 'BOOKING_NOT_FOUND' };
        
        if (toolName === 'cancel_my_booking_if_allowed') {
          // Typically renter only, but maybe admin. Our resolver allows participant check.
          if (!mutResolve.isParticipant) return { allowed: false, reasonCode: 'NOT_BOOKING_PARTICIPANT' };
        } else {
          if (!mutResolve.isParticipant) return { allowed: false, reasonCode: 'NOT_BOOKING_PARTICIPANT' };
        }
        return { allowed: true };

      default:
        // Any unregistered tool or mutation inherently gets rejected
        this.logger.warn(`Permission block on unregistered or missing tool loop mapping: ${toolName}`);
        return { allowed: false, reasonCode: 'UNKNOWN_TOOL_POLICY_BLOCKED' };
    }
  }
}
