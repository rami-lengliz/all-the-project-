import { Test, TestingModule } from '@nestjs/testing';
import { CancellationPolicyService } from './cancellation-policy.service';
import { BookingStatus } from '../../entities/booking.entity';
import { PaymentIntentStatus } from '../../entities/payment-intent.entity';

describe('CancellationPolicyService', () => {
  let service: CancellationPolicyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CancellationPolicyService],
    }).compile();

    service = module.get<CancellationPolicyService>(CancellationPolicyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Renter cancellation before start date', () => {
    it('should allow cancellation with FULL refund if payment is CAPTURED', () => {
      const startDate = new Date('2024-02-01');
      const now = new Date('2024-01-15'); // Before start date
      const decision = service.evaluateCancellation({
        actor: 'RENTER',
        bookingStatus: BookingStatus.PAID,
        paymentStatus: PaymentIntentStatus.CAPTURED,
        startDate,
        endDate: new Date('2024-02-05'),
        totalPrice: 1000,
        now,
      });

      expect(decision.allowCancel).toBe(true);
      expect(decision.refundAmount).toBe(1000);
      expect(decision.refundType).toBe('FULL');
      expect(decision.penaltyApplied).toBe(false);
      expect(decision.reason).toContain('Full refund');
    });

    it('should allow cancellation with NO refund if payment is not CAPTURED', () => {
      const startDate = new Date('2024-02-01');
      const now = new Date('2024-01-15');
      const decision = service.evaluateCancellation({
        actor: 'RENTER',
        bookingStatus: BookingStatus.CONFIRMED,
        paymentStatus: PaymentIntentStatus.AUTHORIZED,
        startDate,
        endDate: new Date('2024-02-05'),
        totalPrice: 1000,
        now,
      });

      expect(decision.allowCancel).toBe(true);
      expect(decision.refundAmount).toBe(0);
      expect(decision.refundType).toBe('NONE');
      expect(decision.penaltyApplied).toBe(false);
      expect(decision.reason).toContain('No payment captured');
    });

    it('should be idempotent if payment already REFUNDED', () => {
      const startDate = new Date('2024-02-01');
      const now = new Date('2024-01-15');
      const decision = service.evaluateCancellation({
        actor: 'RENTER',
        bookingStatus: BookingStatus.CANCELLED,
        paymentStatus: PaymentIntentStatus.REFUNDED,
        startDate,
        endDate: new Date('2024-02-05'),
        totalPrice: 1000,
        now,
      });

      expect(decision.allowCancel).toBe(true);
      expect(decision.refundAmount).toBe(0);
      expect(decision.refundType).toBe('NONE');
      expect(decision.reason).toContain('already refunded');
    });
  });

  describe('Renter cancellation after start date', () => {
    it('should deny cancellation with NO refund', () => {
      const startDate = new Date('2024-01-01');
      const now = new Date('2024-01-15'); // After start date
      const decision = service.evaluateCancellation({
        actor: 'RENTER',
        bookingStatus: BookingStatus.PAID,
        paymentStatus: PaymentIntentStatus.CAPTURED,
        startDate,
        endDate: new Date('2024-01-20'),
        totalPrice: 1000,
        now,
      });

      expect(decision.allowCancel).toBe(false);
      expect(decision.refundAmount).toBe(0);
      expect(decision.refundType).toBe('NONE');
      expect(decision.penaltyApplied).toBe(true);
      expect(decision.reason).toContain('after start date');
      expect(decision.reason).toContain('No refund allowed');
    });

    it('should deny cancellation even if payment is CAPTURED', () => {
      const startDate = new Date('2024-01-01');
      const now = new Date('2024-01-02');
      const decision = service.evaluateCancellation({
        actor: 'RENTER',
        bookingStatus: BookingStatus.PAID,
        paymentStatus: PaymentIntentStatus.CAPTURED,
        startDate,
        endDate: new Date('2024-01-10'),
        totalPrice: 2000,
        now,
      });

      expect(decision.allowCancel).toBe(false);
      expect(decision.refundAmount).toBe(0);
      expect(decision.penaltyApplied).toBe(true);
    });
  });

  describe('Host cancellation', () => {
    it('should allow cancellation with FULL refund at any time if payment is CAPTURED', () => {
      const startDate = new Date('2024-01-01');
      const now = new Date('2024-01-15'); // After start date
      const decision = service.evaluateCancellation({
        actor: 'HOST',
        bookingStatus: BookingStatus.PAID,
        paymentStatus: PaymentIntentStatus.CAPTURED,
        startDate,
        endDate: new Date('2024-01-20'),
        totalPrice: 1000,
        now,
      });

      expect(decision.allowCancel).toBe(true);
      expect(decision.refundAmount).toBe(1000);
      expect(decision.refundType).toBe('FULL');
      expect(decision.penaltyApplied).toBe(false);
      expect(decision.reason).toContain('Host cancellation');
      expect(decision.reason).toContain('Full refund required');
    });

    it('should allow cancellation before start date with FULL refund', () => {
      const startDate = new Date('2024-02-01');
      const now = new Date('2024-01-15');
      const decision = service.evaluateCancellation({
        actor: 'HOST',
        bookingStatus: BookingStatus.CONFIRMED,
        paymentStatus: PaymentIntentStatus.CAPTURED,
        startDate,
        endDate: new Date('2024-02-05'),
        totalPrice: 1500,
        now,
      });

      expect(decision.allowCancel).toBe(true);
      expect(decision.refundAmount).toBe(1500);
      expect(decision.refundType).toBe('FULL');
    });

    it('should allow cancellation with NO refund if payment not CAPTURED', () => {
      const startDate = new Date('2024-02-01');
      const now = new Date('2024-01-15');
      const decision = service.evaluateCancellation({
        actor: 'HOST',
        bookingStatus: BookingStatus.CONFIRMED,
        paymentStatus: PaymentIntentStatus.AUTHORIZED,
        startDate,
        endDate: new Date('2024-02-05'),
        totalPrice: 1000,
        now,
      });

      expect(decision.allowCancel).toBe(true);
      expect(decision.refundAmount).toBe(0);
      expect(decision.refundType).toBe('NONE');
      expect(decision.reason).toContain('No payment captured');
    });

    it('should be idempotent if payment already REFUNDED', () => {
      const startDate = new Date('2024-02-01');
      const now = new Date('2024-01-15');
      const decision = service.evaluateCancellation({
        actor: 'HOST',
        bookingStatus: BookingStatus.CANCELLED,
        paymentStatus: PaymentIntentStatus.REFUNDED,
        startDate,
        endDate: new Date('2024-02-05'),
        totalPrice: 1000,
        now,
      });

      expect(decision.allowCancel).toBe(true);
      expect(decision.refundAmount).toBe(0);
      expect(decision.reason).toContain('already refunded');
    });
  });

  describe('COMPLETED bookings', () => {
    it('should deny cancellation for COMPLETED bookings', () => {
      const decision = service.evaluateCancellation({
        actor: 'RENTER',
        bookingStatus: BookingStatus.COMPLETED,
        paymentStatus: PaymentIntentStatus.CAPTURED,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-10'),
        totalPrice: 1000,
        now: new Date('2024-01-15'),
      });

      expect(decision.allowCancel).toBe(false);
      expect(decision.refundAmount).toBe(0);
      expect(decision.reason).toContain('Cannot cancel a completed booking');
    });

    it('should deny cancellation even for HOST on COMPLETED bookings', () => {
      const decision = service.evaluateCancellation({
        actor: 'HOST',
        bookingStatus: BookingStatus.COMPLETED,
        paymentStatus: PaymentIntentStatus.CAPTURED,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-10'),
        totalPrice: 1000,
        now: new Date('2024-01-15'),
      });

      expect(decision.allowCancel).toBe(false);
      expect(decision.reason).toContain('Cannot cancel a completed booking');
    });
  });

  describe('Edge cases', () => {
    it('should handle same day cancellation (now === startDate)', () => {
      const startDate = new Date('2024-01-15T00:00:00Z');
      const now = new Date('2024-01-15T12:00:00Z'); // Same day, but after start
      const decision = service.evaluateCancellation({
        actor: 'RENTER',
        bookingStatus: BookingStatus.PAID,
        paymentStatus: PaymentIntentStatus.CAPTURED,
        startDate,
        endDate: new Date('2024-01-20'),
        totalPrice: 1000,
        now,
      });

      // Same day should be considered "after start"
      expect(decision.allowCancel).toBe(false);
      expect(decision.penaltyApplied).toBe(true);
    });

    it('should handle PENDING bookings for renter before start', () => {
      const startDate = new Date('2024-02-01');
      const now = new Date('2024-01-15');
      const decision = service.evaluateCancellation({
        actor: 'RENTER',
        bookingStatus: BookingStatus.PENDING,
        paymentStatus: PaymentIntentStatus.CREATED,
        startDate,
        endDate: new Date('2024-02-05'),
        totalPrice: 1000,
        now,
      });

      expect(decision.allowCancel).toBe(true);
      expect(decision.refundAmount).toBe(0);
      expect(decision.refundType).toBe('NONE');
    });

    it('should handle CONFIRMED bookings for renter before start', () => {
      const startDate = new Date('2024-02-01');
      const now = new Date('2024-01-15');
      const decision = service.evaluateCancellation({
        actor: 'RENTER',
        bookingStatus: BookingStatus.CONFIRMED,
        paymentStatus: PaymentIntentStatus.CAPTURED,
        startDate,
        endDate: new Date('2024-02-05'),
        totalPrice: 1000,
        now,
      });

      expect(decision.allowCancel).toBe(true);
      expect(decision.refundAmount).toBe(1000);
      expect(decision.refundType).toBe('FULL');
    });
  });

  describe('canRefund', () => {
    it('should return true only for CAPTURED payments', () => {
      expect(service.canRefund(PaymentIntentStatus.CAPTURED)).toBe(true);
      expect(service.canRefund(PaymentIntentStatus.CREATED)).toBe(false);
      expect(service.canRefund(PaymentIntentStatus.AUTHORIZED)).toBe(false);
      expect(service.canRefund(PaymentIntentStatus.REFUNDED)).toBe(false);
      expect(service.canRefund(PaymentIntentStatus.CANCELLED)).toBe(false);
    });
  });

  describe('canCancel', () => {
    it('should return true for cancellable booking statuses', () => {
      expect(service.canCancel(BookingStatus.PENDING)).toBe(true);
      expect(service.canCancel(BookingStatus.CONFIRMED)).toBe(true);
      expect(service.canCancel(BookingStatus.PAID)).toBe(true);
      expect(service.canCancel(BookingStatus.COMPLETED)).toBe(false);
      expect(service.canCancel(BookingStatus.CANCELLED)).toBe(false);
    });
  });
});
