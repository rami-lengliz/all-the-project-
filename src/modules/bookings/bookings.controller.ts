import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PayBookingDto } from './dto/pay-booking.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HostGuard } from '../../common/guards/host.guard';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('api/bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @ApiOperation({ summary: 'Create a new booking request (status → pending)' })
  @ApiResponse({
    status: 201,
    description: 'Booking created. displayStatus = "pending".',
  })
  create(@Body() createBookingDto: CreateBookingDto, @Request() req) {
    return this.bookingsService.create(createBookingDto, req.user.sub);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get all bookings for the current user' })
  @ApiResponse({
    status: 200,
    description:
      'Each booking includes a `displayStatus` field: pending | accepted | completed | canceled | rejected.',
  })
  findAll(@Request() req) {
    return this.bookingsService.findAll(req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking details' })
  @ApiResponse({
    status: 200,
    description: 'Booking object with `displayStatus` field.',
  })
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

  @Patch(':id/confirm')
  @UseGuards(HostGuard)
  @ApiOperation({
    summary:
      'Host accepts a pending booking (internal: confirmed → displayStatus: accepted)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Booking internal status set to `confirmed`. displayStatus = "accepted".',
  })
  confirm(@Param('id') id: string, @Request() req) {
    return this.bookingsService.confirm(id, req.user.sub);
  }

  @Patch(':id/reject')
  @UseGuards(HostGuard)
  @ApiOperation({
    summary:
      'Host rejects a pending booking (internal: rejected → displayStatus: rejected)',
    description:
      'Only the host of the listing can reject a booking. ' +
      'Only `pending` bookings can be rejected. ' +
      'Once rejected, the slot is freed for other renters.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Booking internal status set to `rejected`. displayStatus = "rejected".',
  })
  @ApiResponse({ status: 400, description: 'Booking is not in pending state.' })
  @ApiResponse({
    status: 403,
    description: 'Only the host can reject bookings.',
  })
  reject(@Param('id') id: string, @Request() req) {
    return this.bookingsService.reject(id, req.user.sub);
  }

  @Post(':id/pay')
  @ApiOperation({
    summary:
      'Simulate payment for a confirmed booking (internal: paid → displayStatus: accepted)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Payment processed. displayStatus stays "accepted" (paid is an internal milestone).',
  })
  pay(
    @Param('id') id: string,
    @Body() payBookingDto: PayBookingDto,
    @Request() req,
  ) {
    return this.bookingsService.pay(id, payBookingDto, req.user.sub);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary:
      'Renter or host cancels a booking (internal: cancelled → displayStatus: canceled)',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking cancelled. displayStatus = "canceled".',
  })
  cancel(@Param('id') id: string, @Request() req) {
    return this.bookingsService.cancel(id, req.user.sub);
  }
}
