import {
  Controller,
  Get,
  Post,
  Body,
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
    return this.adminService.flagListing(
      flagDto.listingId,
      flagDto,
      req.user.sub,
    );
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get admin action logs (admin only)' })
  getLogs(@Query('limit') limit?: number) {
    return this.adminService.getLogs(limit ? parseInt(limit.toString()) : 100);
  }
}
