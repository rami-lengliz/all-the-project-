import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthorizePaymentDto } from './dto/authorize-payment.dto';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('api/payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('booking/:bookingId/authorize')
  @ApiOperation({ summary: 'Authorize payment for a booking (renter only)' })
  authorize(
    @Param('bookingId') bookingId: string,
    @Body() authorizeDto: AuthorizePaymentDto,
    @Request() req,
  ) {
    return this.paymentsService.authorize(
      bookingId,
      req.user.sub,
      authorizeDto.metadata,
    );
  }

  @Post('booking/:bookingId/capture')
  @ApiOperation({ summary: 'Capture authorized payment (system only)' })
  capture(@Param('bookingId') bookingId: string) {
    return this.paymentsService.capture(bookingId);
  }

  @Post('booking/:bookingId/refund')
  @ApiOperation({ summary: 'Refund captured payment' })
  refund(@Param('bookingId') bookingId: string) {
    return this.paymentsService.refund(bookingId);
  }

  @Patch('booking/:bookingId/cancel')
  @ApiOperation({
    summary: 'Cancel payment intent (renter or host, before capture)',
  })
  cancel(@Param('bookingId') bookingId: string, @Request() req) {
    return this.paymentsService.cancel(bookingId, req.user.sub);
  }

  @Post('booking/:bookingId')
  @ApiOperation({ summary: 'Get payment intent for a booking' })
  getByBooking(@Param('bookingId') bookingId: string) {
    return this.paymentsService.findByBooking(bookingId);
  }
}
