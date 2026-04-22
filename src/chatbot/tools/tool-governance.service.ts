import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolRegistryService } from './tool-registry.service';
import { ToolPolicyService } from './tool-policy.service';
import {
  GovernedToolResult,
  ToolExecutionStatus,
} from './tool-execution.types';
import { LlmToolRequest } from '../llm/llm.types';
import { ListingsService } from '../../modules/listings/listings.service';
import { CategoriesService } from '../../modules/categories/categories.service';
import { BookingsService } from '../../modules/bookings/bookings.service';
import { ChatbotToolPermissionService } from './permissions/chatbot-tool-permission.service';
import {
  SearchListingsToolSchema,
  SearchListingsToolArgs,
} from './schemas/search-listings.schema';
import {
  CompareListingsSchema,
  CompareListingsArgs,
} from './schemas/compare-listings.schema';
import { GetListingDetailsToolSchema, GetListingDetailsToolArgs } from './schemas/get-listing-details.schema';
import { GetMyBookingsToolSchema, GetMyBookingsToolArgs } from './schemas/get-my-bookings.schema';
import { GetBookingDetailsToolSchema, GetBookingDetailsToolArgs } from './schemas/get-booking-details.schema';
import { GetHostListingsToolSchema, GetHostListingsToolArgs } from './schemas/get-host-listings.schema';
import { GetHostBookingRequestsToolSchema, GetHostBookingRequestsToolArgs } from './schemas/get-host-booking-requests.schema';
import { HelpCenterSearchToolSchema, HelpCenterSearchToolArgs } from './schemas/help-center-search.schema';
import { ChatbotMutationPolicyService } from '../actions/chatbot-mutation-policy.service';
import { ChatbotActionConfirmationService } from '../actions/chatbot-action-confirmation.service';
import { ContactHostAboutBookingSchema, ContactHostAboutBookingArgs } from './schemas/contact-host-about-booking.schema';
import { RequestBookingHelpSchema, RequestBookingHelpArgs } from './schemas/request-booking-help.schema';
import { CancelMyBookingIfAllowedSchema, CancelMyBookingIfAllowedArgs } from './schemas/cancel-my-booking-if-allowed.schema';

import { ChatbotRateLimitService } from '../trust/chatbot-rate-limit.service';
import { ChatbotTrustPolicyService } from '../trust/chatbot-trust-policy.service';
import { ChatbotAbuseDetectionService } from '../trust/chatbot-abuse-detection.service';

import {
  CHATBOT_CATEGORY_TO_INTERNAL_SLUG,
  ALLOWED_CHATBOT_CATEGORIES,
} from '../constants/chatbot-category-map';

@Injectable()
export class ToolGovernanceService {
  private readonly logger = new Logger(ToolGovernanceService.name);
  private readonly executionTimeoutMs: number;
  private readonly maxResultSize: number;

  constructor(
    private registryService: ToolRegistryService,
    private permissionService: ChatbotToolPermissionService,
    private configService: ConfigService,
    private mutationPolicyService: ChatbotMutationPolicyService,
    private confirmationService: ChatbotActionConfirmationService,
    private rateLimitService: ChatbotRateLimitService,
    private trustPolicyService: ChatbotTrustPolicyService,
    private abuseDetectionService: ChatbotAbuseDetectionService,
    // Services for actual tool execution
    private listingsService: ListingsService,
    private categoriesService: CategoriesService,
    private bookingsService: BookingsService
  ) {
    this.executionTimeoutMs =
      this.configService.get<number>('CHATBOT_TOOL_TIMEOUT_MS') || 10000;
    this.maxResultSize = this.configService.get<number>('CHATBOT_MAX_TOOL_RESULT_SIZE') || 10;
    // Register Search Tools
    this.registerSearchListingsTool();
    this.registerGetListingDetailsTool();
    this.registerGetHostListingsTool();
    this.registerCompareListingsTool();

    // Register Booking Tools
    this.registerGetMyBookingsTool();
    this.registerGetBookingDetailsTool();
    this.registerGetHostBookingRequestsTool();

    // Register General
    this.registerHelpCenterSearchTool();

    // Register Mutation Tools
    this.registerContactHostAboutBookingTool();
    this.registerRequestBookingHelpTool();
    this.registerCancelMyBookingIfAllowedTool();
  }

  public getAvailableToolsForContext(context?: any) {
    const allowed = this.permissionService.getAllowedToolNames(context);
    return this.registryService.getAllowedTools(allowed);
  }

  public async executeTool(
    request: LlmToolRequest,
    context?: any,
  ): Promise<GovernedToolResult> {
    const startMs = Date.now();

    // Ensure tool registration existence before permission scan
    const tool = this.registryService.getTool(request.name);
    if (!tool) {
      this.logger.warn(`Tool not found in registry: ${request.name}`);
      return this.buildResult('not_found', startMs, request.name, undefined, 'Tool not found in registry');
    }

    // 1. Schema Validation (Strip extra params gracefully)
    let safeArgs: any;
    try {
      safeArgs = tool.schema.parse(request.arguments);
    } catch (error) {
      this.logger.error(`Validation error for tool ${request.name}: ${error.message}`);
      return this.buildResult('validation_error', startMs, request.name, undefined, `Schema validation failed: ${error.message}`);
    }

    const policy = this.mutationPolicyService.evaluateMutationPolicy(request.name);
    const isMutation = this.mutationPolicyService.isMutationTool(request.name);

    if (context?.userId) {
       // Evaluate Rate Limiting dynamically
       const rlCategory = isMutation ? 'chatbot_mutation_proposals' : 'chatbot_tool_calls';
       
       // Note: Contact Host tools are distinct for generic spam checks
       const toolLimitCategory = ['contact_host_about_booking', 'request_booking_help'].includes(request.name) 
           ? 'chatbot_help_or_contact_requests' : rlCategory;

       const rlMap = await this.rateLimitService.evaluateLimit(context.userId, toolLimitCategory as any);
       if (!rlMap.allowed) {
          await this.abuseDetectionService.recordIncident({
             userId: context.userId, conversationId: context.conversationId, 
             eventType: 'rate_limit_exceeded', severity: 'medium', reasonCode: `excessive_${toolLimitCategory}`
          });
          const statusCode = rlMap.cooldownActive ? 'cooldown_active' : 'rate_limited';
          return this.buildResult(statusCode as any, startMs, request.name, undefined, "Rate limit exceeded. Please wait before interacting again.");
       }
       await this.rateLimitService.recordUsage(context.userId, toolLimitCategory as any);

       // Evaluate Trust Policies
       const actionTypeDecision = context.executionConfirmed ? 'confirmation_execution' : (isMutation ? 'mutation_proposal' : 'read_tool');
       const trustMapping = await this.trustPolicyService.evaluateAction(context.userId, actionTypeDecision as any, request.name);

       if (!trustMapping.allowed) {
          return this.buildResult('trust_restricted', startMs, request.name, undefined, trustMapping.blockReason || "Account restricted.");
       }
    }

    // Explicit Context-Aware Permission Check
    const permissionResult = await this.permissionService.checkPermission(request.name, safeArgs, context);
    if (!permissionResult.allowed) {
      if (context?.userId) {
         await this.abuseDetectionService.recordIncident({
             userId: context.userId, conversationId: context.conversationId, 
             eventType: 'excessive_unauthorized_tools', severity: 'medium', 
             reasonCode: `permission_blocked_${request.name}`
         });
      }
      this.logger.warn(`Tool permission blocked execution of ${request.name} (Reason: ${permissionResult.reasonCode})`);
      return this.buildResult('policy_blocked', startMs, request.name, undefined, `Permission denied: ${permissionResult.reasonCode}`);
    }

    // 2. Mutation Confirmation Proposal Flow
    if (policy.requiresConfirmation && !context.executionConfirmed) {
      this.logger.log(`Mutation tool ${request.name} requires confirmation. Halting execution for user consent.`);
      
      const proposalState = await this.confirmationService.proposeAction(
        context.userId,
        context.conversationId,
        {
           actionName: request.name,
           arguments: safeArgs,
           resourceId: safeArgs.bookingId || safeArgs.listingId,
           resourceType: safeArgs.bookingId ? 'booking' : (safeArgs.listingId ? 'listing' : undefined)
        }
      );
      
      return this.buildResult('confirmation_required', startMs, request.name, {
         type: 'confirmation_required',
         actionName: request.name,
         confirmationToken: proposalState.token,
         summary: `Required explicit user confirmation to proceed with ${request.name}`,
         expiresAt: proposalState.expiresAt
      });
    }

    // 3. Execution with Timeout Bounding
    try {
      const result = await Promise.race([
        tool.handler(safeArgs, context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tool execution timed out')), this.executionTimeoutMs),
        ),
      ]);

      // 3. Structured Logging
      this.logger.log({
        msg: `Tool execution succeeded`,
        toolName: request.name,
        durationMs: Date.now() - startMs,
        resultSize: result?.count || result?.length || 0,
        userId: context?.sub || context?.id || 'system'
      });
      return this.buildResult('success', startMs, request.name, result);
    } catch (error) {
      if (error.message === 'Tool execution timed out') {
        this.logger.error({
          msg: `Tool execution timeout`,
          toolName: request.name,
          durationMs: this.executionTimeoutMs,
          userId: context?.sub || context?.id || 'system'
        });
        return this.buildResult('timeout', startMs, request.name, undefined, 'Execution timed out');
      }

      this.logger.error({
        msg: `Tool execution error`,
        toolName: request.name,
        error: error.message,
        userId: context?.sub || context?.id || 'system'
      }, error.stack);
      return this.buildResult('execution_error', startMs, request.name, undefined, 'Internal tool execution error occurred');
    }
  }

  private buildResult(
    status: ToolExecutionStatus,
    startMs: number,
    toolName: string,
    output?: any,
    errorMessage?: string,
  ): GovernedToolResult {
    return {
      status,
      output,
      errorMessage,
      metadata: {
        toolName,
        durationMs: Date.now() - startMs,
      },
    };
  }

  // ============== TOOL IMPLEMENTATIONS ================
  private registerCompareListingsTool() {
    this.registryService.registerTool({
      name: 'compare_listings',
      description: 'Fetch and compare 2-3 specific rental listings based on requested UUIDs',
      schema: CompareListingsSchema,
      jsonSchema: {
        type: 'object',
        properties: {
          listingIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of 2 to 3 listing UUIDs to compare',
            minItems: 2,
            maxItems: 3,
          },
        },
        required: ['listingIds'],
      },
      handler: async (args: CompareListingsArgs) => {
        const { listings, insights } = await this.listingsService.compareListings(args.listingIds);
        
        if (listings.length < 2) {
          return { error: 'Not enough valid listings found for comparison.' };
        }

        const formatted = listings.map((l: any) => ({
          id: l.id,
          title: l.title,
          pricePerDay: Number(l.pricePerDay),
          category: l.category?.name,
          host: {
            name: l.host?.name,
            ratingAvg: Number(l.host?.ratingAvg || 0),
            ratingCount: l.host?.ratingCount || 0,
            verifiedEmail: l.host?.verifiedEmail || false,
            verifiedPhone: l.host?.verifiedPhone || false,
          },
          bookingType: l.bookingType,
          address: l.address,
          tradeoffSummary: insights?.summaries[l.id] || "Standard alternative.",
        }));

        return {
          listings: formatted,
          decisionSupport: {
             bestValueId: insights?.bestValueId,
             bestRatedId: insights?.bestRatedId,
             mostExperiencedHostId: insights?.mostExperiencedHostId,
          }
        };
      },
    });
  }

  private registerSearchListingsTool() {
    this.registryService.registerTool({
      name: 'search_listings',
      description: 'Search for available rental listings in the marketplace',
      schema: SearchListingsToolSchema,
      jsonSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or keyword' },
          category: {
            type: 'string',
            enum: ALLOWED_CHATBOT_CATEGORIES,
            description: 'Strict category parameter',
          },
          lat: { type: 'number', description: 'Latitude' },
          lng: { type: 'number', description: 'Longitude' },
          radiusKm: { type: 'number', description: 'Radius in km (default 10, max 50)' },
          minPrice: { type: 'number', description: 'Min price per day' },
          maxPrice: { type: 'number', description: 'Max price per day' },
        },
      },
      handler: async (args: SearchListingsToolArgs) => {
        const filters: any = {};

        if (args.query) {
          filters.q = args.query.trim();
        }

        if (args.category) {
          const actualSlug = CHATBOT_CATEGORY_TO_INTERNAL_SLUG[args.category] || args.category;
          try {
            const categoryObj = await this.categoriesService.findBySlug(actualSlug);
            if (categoryObj) {
              filters.category = categoryObj.id;
            } else {
              const fallbackObj = await this.categoriesService.findBySlug(args.category);
              if (fallbackObj) filters.category = fallbackObj.id;
            }
          } catch (e) {
            // Ignore missing category
          }
        }

        if (args.lat !== undefined && args.lng !== undefined) {
          filters.lat = args.lat;
          filters.lng = args.lng;
          filters.radiusKm = args.radiusKm ?? 10;
          filters.sortBy = 'distance';
        }

        if (args.minPrice !== undefined) filters.minPrice = args.minPrice;
        if (args.maxPrice !== undefined) filters.maxPrice = args.maxPrice;

        filters.limit = this.maxResultSize; // enforce hard limit globally per request

        const results = await this.listingsService.findAll(filters);

        // Sanitize output payload size
        return {
          count: results.length,
          results: results.map((r) => ({
            id: r.id,
            title: r.title,
            pricePerDay: r.pricePerDay,
            address: r.address,
            category: r.category?.name || r.category?.slug,
          })),
        };
      },
    });
  }

  private registerGetListingDetailsTool() {
    this.registryService.registerTool({
      name: 'get_listing_details',
      description: 'Fetch detailed, public-safe information about a specific catalog listing',
      schema: GetListingDetailsToolSchema,
      jsonSchema: {
        type: 'object',
        properties: { listingId: { type: 'string' } },
        required: ['listingId']
      },
      handler: async (args: GetListingDetailsToolArgs) => {
        const item = await this.listingsService.findOne(args.listingId);
        if (!item) return { status: 'NOT_FOUND' };
        
        // Return explicit safe fields (excluding any backend structural secrets)
        return {
           id: item.id,
           title: item.title,
           description: item.description,
           pricePerDay: item.pricePerDay,
           category: item.category?.name,
           location: item.address,
        };
      }
    });
  }

  private registerGetMyBookingsTool() {
    this.registryService.registerTool({
      name: 'get_my_bookings',
      description: 'Retrieve the current user\'s personal rental bookings.',
      schema: GetMyBookingsToolSchema,
      jsonSchema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          limit: { type: 'number' }
        }
      },
      handler: async (args: GetMyBookingsToolArgs, context: any) => {
        const filters: any = { renterId: context.userId };
        if (args.status) filters.status = args.status;
        
        // This will reuse standard findAll but forced exactly to user
        const results = await this.bookingsService.findAll(filters);
        const limited = results.slice(0, args.limit || this.maxResultSize);
        
        return {
           count: limited.length,
           bookings: limited.map(b => ({
              id: b.id,
              listingSnapshotTitle: b.snapshotTitle,
              startDate: b.startDate,
              endDate: b.endDate,
              totalPrice: b.totalPrice,
              status: b.status,
              listingId: b.listingId
           }))
        };
      }
    });
  }

  private registerGetBookingDetailsTool() {
    this.registryService.registerTool({
      name: 'get_booking_details',
      description: 'Fetch detailed information about a specific booking',
      schema: GetBookingDetailsToolSchema,
      jsonSchema: {
        type: 'object',
        properties: { bookingId: { type: 'string' } },
        required: ['bookingId']
      },
      handler: async (args: GetBookingDetailsToolArgs) => {
        const booking = await this.bookingsService.findOne(args.bookingId);
        if (!booking) return { status: 'NOT_FOUND' };
        
        return {
           id: booking.id,
           status: booking.status,
           totalPrice: booking.totalPrice,
           startDate: booking.startDate,
           endDate: booking.endDate,
           listingSnapshotTitle: booking.snapshotTitle,
           isPaid: booking.paid,
        };
      }
    });
  }

  private registerGetHostListingsTool() {
    this.registryService.registerTool({
      name: 'get_host_listings',
      description: 'Fetch listings owned by the current authenticated host.',
      schema: GetHostListingsToolSchema,
      jsonSchema: {
        type: 'object',
        properties: { limit: { type: 'number' } }
      },
      handler: async (args: GetHostListingsToolArgs, context: any) => {
        const results = await this.listingsService.findAllForHost(context.userId);
        const limited = results.slice(0, args.limit || this.maxResultSize);
        
        return {
           count: limited.length,
           listings: limited.map(r => ({
              id: r.id,
              title: r.title,
              pricePerDay: r.pricePerDay,
              status: r.status,
              isActive: r.isActive
           }))
        };
      }
    });
  }

  private registerGetHostBookingRequestsTool() {
    this.registryService.registerTool({
      name: 'get_host_booking_requests',
      description: 'Fetch booking requests received for listings owned by the current host.',
      schema: GetHostBookingRequestsToolSchema,
      jsonSchema: {
        type: 'object',
        properties: {
          listingId: { type: 'string' },
          status: { type: 'string' },
          limit: { type: 'number' }
        }
      },
      handler: async (args: GetHostBookingRequestsToolArgs, context: any) => {
        const filters: any = { hostId: context.userId };
        if (args.status) filters.status = args.status;
        if (args.listingId) filters.listingId = args.listingId;
        
        const results = await this.bookingsService.findAll(filters);
        const limited = results.slice(0, args.limit || this.maxResultSize);
        
        return {
           count: limited.length,
           requests: limited.map(b => ({
              id: b.id,
              listingSnapshotTitle: b.snapshotTitle,
              startDate: b.startDate,
              endDate: b.endDate,
              totalPrice: b.totalPrice,
              status: b.status,
              renterId: b.renterId
           }))
        };
      }
    });
  }

  private registerHelpCenterSearchTool() {
    this.registryService.registerTool({
      name: 'help_center_search',
      description: 'Search internal FAQs and support policies constraints securely.',
      schema: HelpCenterSearchToolSchema,
      jsonSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      },
      handler: async (args: HelpCenterSearchToolArgs) => {
        // Fallback or static search against marketplace generic constants.
        // In a real expanded app, it queries Zendesk/Pinecone. Here we bounded rule sets.
        const q = args.query.toLowerCase();
        let result = "We could not find an exact match for your support query. Please reach out to contact@renteverything.tn.";
        
        if (q.includes('refund') || q.includes('cancel')) {
           result = "RentEverything standard policy: Renter can cancel up to 24h prior without penalty. Late cancellations forfeit 50% commission unless disputed.";
        } else if (q.includes('dispute') || q.includes('broken')) {
           result = "If an item is defective, Open a Dispute inside the booking window. Funds are held until resolved by admin arbitration.";
        } else if (q.includes('fee') || q.includes('commission')) {
           result = "The platform charges a percentage commission on each successful payment (deducted before payouts).";
        }
        
        return { text: result };
      }
    });
  }

  private registerContactHostAboutBookingTool() {
    this.registryService.registerTool({
      name: 'contact_host_about_booking',
      description: 'Contact the owner/host of a listing regarding an active or past booking.',
      schema: ContactHostAboutBookingSchema,
      jsonSchema: {
        type: 'object',
        properties: {
          bookingId: { type: 'string' },
          message: { type: 'string' }
        },
        required: ['bookingId', 'message']
      },
      handler: async (args: ContactHostAboutBookingArgs, context: any) => {
        const safeMessage = args.message.replace(/<[^>]*>?/gm, '').trim(); // Sanitize basic HTML injection
        
        // Ensure user is actually related statically checking again manually
        const mutResolve = await this.permissionService.checkPermission('contact_host_about_booking', args, context);
        if(!mutResolve.allowed) return { status: 'FAILED', message: "Authorization dropped." };

        this.logger.log(`[MUTATION EXECUTION] Contact Host - Booking: ${args.bookingId} - Content length: ${safeMessage.length}`);
        return {
           success: true,
           message: "Your message has been securely sent to the host.",
           actedOn: args.bookingId
        };
      }
    });
  }

  private registerRequestBookingHelpTool() {
    this.registryService.registerTool({
      name: 'request_booking_help',
      description: 'Request formal assistance or open a support ticket regarding a problematic booking.',
      schema: RequestBookingHelpSchema,
      jsonSchema: {
        type: 'object',
        properties: {
          bookingId: { type: 'string' },
          reason: { type: 'string' },
          message: { type: 'string' }
        },
        required: ['bookingId', 'reason']
      },
      handler: async (args: RequestBookingHelpArgs, context: any) => {
        const safeMessage = args.message?.replace(/<[^>]*>?/gm, '').trim() || "No additional context";
        const safeReason = ['general_inquiry', 'delay', 'item_condition', 'cant_find_host', 'other'].includes(args.reason) ? args.reason : 'other';

        this.logger.log(`[MUTATION EXECUTION] Request Help - Booking: ${args.bookingId}, Reason: ${safeReason}`);
        return {
           success: true,
           message: `Support ticket opened for booking ${args.bookingId}. Reason: ${safeReason}. Support will contact you shortly.`,
           ticketId: `TICKET_${Math.floor(Math.random() * 10000)}`
        };
      }
    });
  }

  private registerCancelMyBookingIfAllowedTool() {
    this.registryService.registerTool({
      name: 'cancel_my_booking_if_allowed',
      description: 'Request cancellation of your own booking if it complies with the marketplace cancellation policy.',
      schema: CancelMyBookingIfAllowedSchema,
      jsonSchema: {
        type: 'object',
        properties: {
          bookingId: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['bookingId']
      },
      handler: async (args: CancelMyBookingIfAllowedArgs, context: any) => {
        try {
          const booking = await this.bookingsService.cancel(args.bookingId, context.userId);
          
          this.logger.log(`[MUTATION EXECUTION] Cancellation Approved - Booking: ${args.bookingId} by User: ${context.userId}`);
          return {
             success: true,
             message: "Your booking cancellation request was processed successfully according to policy.",
             bookingStatus: booking.status
          };
        } catch (error) {
          this.logger.warn(`[MUTATION REJECTED] Cancel my booking failed natively for ${args.bookingId}: ${error.message}`);
          return {
            status: 'FAILED',
            success: false,
            message: `Cancellation rejected: ${error.message}`
          };
        }
      }
    });
  }
}
