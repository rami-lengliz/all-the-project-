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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Create a new booking' })
  create(@Body() createBookingDto: CreateBookingDto, @Request() req) {
    return this.bookingsService.create(createBookingDto, req.user.id);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get user bookings' })
  findAll(@Request() req) {
    return this.bookingsService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking details' })
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

  @Patch(':id/confirm')
  @UseGuards(HostGuard)
  @ApiOperation({ summary: 'Confirm booking (host only)' })
  confirm(@Param('id') id: string, @Request() req) {
    return this.bookingsService.confirm(id, req.user.id);
  }

  @Post(':id/pay')
  @ApiOperation({ summary: 'Simulate payment for booking' })
  pay(
    @Param('id') id: string,
    @Body() payBookingDto: PayBookingDto,
    @Request() req,
  ) {
    return this.bookingsService.pay(id, payBookingDto, req.user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel booking' })
  cancel(@Param('id') id: string, @Request() req) {
    return this.bookingsService.cancel(id, req.user.id);
  }
}
