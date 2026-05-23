import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthorizePaymentDto } from './dto/authorize-payment.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { Public } from '../../common/decorators/public.decorator';
import type { ProviderKey } from './providers/payment-provider.interface';

@ApiTags('payments')
@Controller('api/payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Real-money checkout via external provider ─────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('providers')
  @ApiOperation({ summary: 'List payment providers usable in this deployment' })
  listProviders() {
    return { providers: this.paymentsService.availableProviders() };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('booking/:bookingId/checkout')
  @ApiOperation({
    summary: 'Start a real-money checkout via a Tunisian payment provider',
    description:
      'Returns the URL the renter should be redirected to. After the user ' +
      'pays on the provider, they are sent back to /api/payments/<provider>/callback, ' +
      'which verifies the payment server-to-server and finalises the booking.',
  })
  async createCheckout(
    @Param('bookingId') bookingId: string,
    @Body() dto: CreateCheckoutDto,
    @Request() req: any,
  ) {
    return this.paymentsService.createCheckout(bookingId, req.user.sub, dto.provider);
  }

  /**
   * Public callback URL the provider redirects the user to after payment.
   * We verify server-to-server and then bounce the user to the frontend
   * with the final outcome.
   */
  @Public()
  @Get(':provider/callback')
  @ApiOperation({ summary: 'Provider redirect callback — verifies payment and forwards user' })
  async providerCallback(
    @Param('provider') provider: ProviderKey,
    @Query('booking') bookingId: string,
    @Res() res: Response,
  ) {
    const frontendBase =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    if (!bookingId) {
      return res.redirect(`${frontendBase}/?payment=missing`);
    }

    try {
      const { status } = await this.paymentsService.handleProviderCallback(
        provider,
        bookingId,
      );
      return res.redirect(
        `${frontendBase}/booking/${bookingId}/pay?outcome=${status}`,
      );
    } catch {
      return res.redirect(
        `${frontendBase}/booking/${bookingId}/pay?outcome=failed`,
      );
    }
  }

  // ─── Konnect server-side webhook ──────────────────────────────────────
  // Konnect calls GET /api/payments/konnect/webhook?payment_ref=... after a
  // payment attempt. Fully idempotent — safe for Konnect to call multiple times.

  @Public()
  @Get('konnect/webhook')
  @ApiOperation({
    summary: 'Konnect payment webhook — verifies and captures confirmed payments',
  })
  async konnectWebhook(@Query('payment_ref') paymentRef: string) {
    return this.paymentsService.handleKonnectWebhook(paymentRef);
  }

  // ─── Existing simulated / state-machine endpoints ──────────────────────
  // (Kept for the demo flow and for tests; real renters go through /checkout.)

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('booking/:bookingId/capture')
  @ApiOperation({ summary: 'Capture authorized payment (system only)' })
  capture(@Param('bookingId') bookingId: string) {
    return this.paymentsService.capture(bookingId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('booking/:bookingId/refund')
  @ApiOperation({ summary: 'Refund captured payment' })
  refund(@Param('bookingId') bookingId: string) {
    return this.paymentsService.refund(bookingId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('booking/:bookingId/cancel')
  @ApiOperation({
    summary: 'Cancel payment intent (renter or host, before capture)',
  })
  cancel(@Param('bookingId') bookingId: string, @Request() req) {
    return this.paymentsService.cancel(bookingId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('booking/:bookingId')
  @ApiOperation({ summary: 'Get payment intent for a booking' })
  getByBooking(@Param('bookingId') bookingId: string) {
    return this.paymentsService.findByBooking(bookingId);
  }
}
