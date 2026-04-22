import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { FlagListingDto } from './dto/flag-listing.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreatePayoutDto } from '../payouts/dto/create-payout.dto';
import { MarkPaidDto } from '../payouts/dto/mark-paid.dto';
import { ModerateListingDto, SuspendListingDto } from './dto/moderate-listing.dto';
import { SuspendUserDto, UnsuspendUserDto } from './dto/moderate-user.dto';
import { UpdateTrustTierDto, MarkTrustReviewedDto } from './dto/trust-actions.dto';
import { ListingStatus } from '@prisma/client';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('api/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'Get all users (admin only)' })
  getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get single user details for admin review' })
  getUserDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserDetails(id);
  }

  @Get('users/:id/logs')
  @ApiOperation({ summary: 'Get audit logs for a specific user' })
  getUserLogs(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserLogs(id);
  }

  @Patch('users/:id/suspend')
  @ApiOperation({ summary: 'Suspend a user account (admin only)' })
  suspendUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendUserDto,
    @Request() req,
  ) {
    return this.adminService.suspendUser(id, req.user.sub, dto.reason);
  }

  @Patch('users/:id/unsuspend')
  @ApiOperation({ summary: 'Unsuspend a user account (admin only)' })
  unsuspendUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnsuspendUserDto,
    @Request() req,
  ) {
    return this.adminService.unsuspendUser(id, req.user.sub, dto.reason);
  }

  @Get('listings')
  @ApiOperation({ summary: 'Get all listings, filterable by status (admin only)' })
  getAllListings(@Query('status') status?: ListingStatus) {
    return this.adminService.getAllListings(status);
  }

  @Get('listings/:id')
  @ApiOperation({ summary: 'Get single listing details for admin review' })
  getListingDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getListingDetails(id);
  }

  @Get('listings/:id/logs')
  @ApiOperation({ summary: 'Get audit logs for a specific listing' })
  getListingLogs(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getListingLogs(id);
  }

  @Post('flag')
  @ApiOperation({ summary: 'Flag a listing for review (admin only)' })
  flagListing(@Body() flagDto: FlagListingDto, @Request() req) {
    return this.adminService.flagListing(
      flagDto.listingId,
      flagDto,
      req.user.sub,
    );
  }

  @Patch('listings/:id/approve')
  @ApiOperation({ summary: 'Approve a listing (set status ACTIVE)' })
  approveListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateListingDto,
    @Request() req
  ) {
    return this.adminService.approveListing(id, req.user.sub, dto.reason);
  }

  @Patch('listings/:id/suspend')
  @ApiOperation({ summary: 'Suspend a listing (set status SUSPENDED)' })
  suspendListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendListingDto,
    @Request() req
  ) {
    return this.adminService.suspendListing(id, req.user.sub, dto.reason);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get admin action logs (admin only)' })
  getLogs(@Query('limit') limit?: number) {
    return this.adminService.getLogs(limit ? parseInt(limit.toString()) : 100);
  }

  // ---- Ledger endpoints ----

  @Get('ledger/summary')
  @ApiOperation({ summary: 'Ledger summary totals (admin only)' })
  getLedgerSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.adminService.getLedgerSummary(from, to);
  }

  @Get('hosts/:id/balance')
  @ApiOperation({ summary: 'Host payout balance (admin only)' })
  getHostBalance(@Param('id') id: string) {
    return this.adminService.getHostBalance(id);
  }

  @Get('bookings/:id/ledger')
  @ApiOperation({ summary: 'Ledger entries for a booking (admin only)' })
  getBookingLedger(@Param('id') id: string) {
    return this.adminService.getBookingLedger(id);
  }

  // ---- Payout endpoints ----

  @Get('payouts')
  @ApiOperation({
    summary: 'List payouts, optionally filter by status (admin only)',
  })
  listPayouts(
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.listPayouts(
      status,
      page ? parseInt(page.toString()) : 1,
      limit ? parseInt(limit.toString()) : 50,
    );
  }

  @Get('payouts/:id')
  @ApiOperation({ summary: 'Get payout details (admin only)' })
  getPayoutDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getPayoutDetails(id);
  }

  @Post('hosts/:id/payouts')
  @ApiOperation({ summary: 'Create a payout for a host (admin only)' })
  createPayout(
    @Param('id') hostId: string,
    @Body() dto: CreatePayoutDto,
    @Request() req,
  ) {
    return this.adminService.createPayout(
      hostId,
      dto.amount,
      req.user.sub,
      dto.method,
      dto.reference,
      dto.notes,
    );
  }

  @Patch('payouts/:id/mark-paid')
  @ApiOperation({
    summary: 'Mark a payout as PAID and post ledger DEBIT (admin only)',
  })
  markPayoutPaid(
    @Param('id') payoutId: string,
    @Body() dto: MarkPaidDto,
    @Request() req,
  ) {
    return this.adminService.markPayoutPaid(
      payoutId,
      dto.method,
      dto.reference,
      req.user.sub,
    );
  }

  // ---- Dispute endpoints ----

  @Patch('bookings/:id/dispute/open')
  @ApiOperation({ summary: 'Open a dispute on a booking (admin only)' })
  openDispute(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.adminService.openDispute(id, req.user.sub);
  }

  @Patch('bookings/:id/dispute/resolve')
  @ApiOperation({ summary: 'Resolve a dispute on a booking (admin only)' })
  resolveDispute(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.adminService.resolveDispute(id, req.user.sub);
  }

  // ---- Trust & Abuse endpoints (Batch 3) ----

  @Get('trust/suspicious')
  @ApiOperation({ summary: 'Get a queue of suspicious users' })
  getSuspiciousUsers() {
    return this.adminService.getSuspiciousUsers();
  }

  @Get('users/:id/trust')
  @ApiOperation({ summary: 'Get trust profile and security events for a user' })
  getUserTrustProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserTrustProfile(id);
  }

  // ---- Trust & Abuse actions (Batch 4) ----

  @Patch('users/:id/trust/review')
  @ApiOperation({ summary: 'Mark a user trust case as reviewed/cleared' })
  markTrustReviewed(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkTrustReviewedDto,
    @Request() req,
  ) {
    return this.adminService.markTrustReviewed(id, req.user.sub, dto.reason);
  }

  @Patch('users/:id/trust/tier')
  @ApiOperation({ summary: 'Manually override a user trust tier' })
  updateTrustTier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrustTierDto,
    @Request() req,
  ) {
    return this.adminService.updateTrustTier(id, dto.tier, req.user.sub, dto.reason);
  }
}
