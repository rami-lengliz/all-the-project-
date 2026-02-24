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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { FlagListingDto } from './dto/flag-listing.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreatePayoutDto } from '../payouts/dto/create-payout.dto';
import { MarkPaidDto } from '../payouts/dto/mark-paid.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('api/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) { }

  @Get('users')
  @ApiOperation({ summary: 'Get all users (admin only)' })
  getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('listings')
  @ApiOperation({ summary: 'Get all listings (admin only)' })
  getAllListings() {
    return this.adminService.getAllListings();
  }

  @Post('flag')
  @ApiOperation({ summary: 'Flag a listing for review (admin only)' })
  flagListing(@Body() flagDto: FlagListingDto, @Request() req) {
    return this.adminService.flagListing(flagDto.listingId, flagDto, req.user.sub);
  }

  @Patch('listings/:id/approve')
  @ApiOperation({ summary: 'Approve a listing (set status ACTIVE)' })
  approveListing(@Param('id') id: string, @Request() req) {
    return this.adminService.approveListing(id, req.user.sub);
  }

  @Patch('listings/:id/suspend')
  @ApiOperation({ summary: 'Suspend a listing (set status SUSPENDED)' })
  suspendListing(@Param('id') id: string, @Request() req) {
    return this.adminService.suspendListing(id, req.user.sub);
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
  @ApiOperation({ summary: 'List payouts, optionally filter by status (admin only)' })
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
  @ApiOperation({ summary: 'Mark a payout as PAID and post ledger DEBIT (admin only)' })
  markPayoutPaid(
    @Param('id') payoutId: string,
    @Body() dto: MarkPaidDto,
    @Request() req,
  ) {
    return this.adminService.markPayoutPaid(payoutId, dto.method, dto.reference, req.user.sub);
  }

  // ---- Dispute endpoints ----

  @Patch('bookings/:id/dispute/open')
  @ApiOperation({ summary: 'Open a dispute on a booking (admin only)' })
  openDispute(@Param('id') id: string) {
    return this.adminService.openDispute(id);
  }

  @Patch('bookings/:id/dispute/resolve')
  @ApiOperation({ summary: 'Resolve a dispute on a booking (admin only)' })
  resolveDispute(@Param('id') id: string) {
    return this.adminService.resolveDispute(id);
  }
}
