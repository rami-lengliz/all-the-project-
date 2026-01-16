import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from '../../entities/booking.entity';
import { ListingsService } from '../listings/listings.service';
import { ConfigService } from '@nestjs/config';
import { AvailabilityUtil } from '../../common/utils/availability.util';
import { AvailabilityService } from '../../common/utils/availability.service';
import { PaymentsService } from '../payments/payments.service';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';
import { PaymentIntentStatus } from '../../entities/payment-intent.entity';

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingRepository: Repository<Booking>;
  let listingsService: ListingsService;
  let dataSource: DataSource;

  const mockBookingRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockListingsService = {
    findOne: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn((callback) =>
      callback({
        create: jest.fn(),
        save: jest.fn(),
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orWhere: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn(),
          getMany: jest.fn(),
        })),
      }),
    ),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'commission.percentage') return 0.1;
      return null;
    }),
  };

  const mockAvailabilityUtil = {
    isDateRangeAvailable: jest.fn(),
  };

  const mockAvailabilityService = {
    isListingAvailableWithLock: jest.fn().mockResolvedValue(true),
  };

  const mockPaymentsService = {
    createForBooking: jest.fn(),
    findByBooking: jest.fn(),
    authorize: jest.fn(),
    capture: jest.fn(),
    refund: jest.fn(),
  };

  const mockCancellationPolicyService = {
    evaluateCancellation: jest.fn(),
    canRefund: jest.fn(),
    canCancel: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: mockBookingRepository,
        },
        {
          provide: ListingsService,
          useValue: mockListingsService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AvailabilityUtil,
          useValue: mockAvailabilityUtil,
        },
        {
          provide: AvailabilityService,
          useValue: mockAvailabilityService,
        },
        {
          provide: PaymentsService,
          useValue: mockPaymentsService,
        },
        {
          provide: CancellationPolicyService,
          useValue: mockCancellationPolicyService,
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    bookingRepository = module.get<Repository<Booking>>(
      getRepositoryToken(Booking),
    );
    listingsService = module.get<ListingsService>(ListingsService);
    dataSource = module.get<DataSource>(DataSource);

    jest.clearAllMocks();
  });

  describe('confirm', () => {
    const mockBooking = {
      id: 'booking-1',
      listingId: 'listing-1',
      hostId: 'host-1',
      renterId: 'renter-1',
      status: BookingStatus.PENDING,
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-02-05'),
      listing: { id: 'listing-1' },
    };

    it('should confirm a pending booking', async () => {
      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          getOne: jest
            .fn()
            .mockResolvedValueOnce(mockBooking) // First call: get booking
            .mockResolvedValueOnce(null), // Second call: check overlaps
        })),
        save: jest.fn().mockResolvedValue({
          ...mockBooking,
          status: BookingStatus.CONFIRMED,
        }),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.confirm('booking-1', 'host-1');

      expect(result.status).toBe(BookingStatus.CONFIRMED);
      expect(transactionManager.save).toHaveBeenCalled();
    });

    it('should be idempotent - return booking if already confirmed', async () => {
      const confirmedBooking = {
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      };

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(confirmedBooking),
        })),
        save: jest.fn(),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.confirm('booking-1', 'host-1');

      expect(result.status).toBe(BookingStatus.CONFIRMED);
      expect(transactionManager.save).not.toHaveBeenCalled();
    });

    it('should reject confirmation if not host', async () => {
      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockBooking),
        })),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(service.confirm('booking-1', 'not-host')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject confirmation if status is not PENDING', async () => {
      const paidBooking = {
        ...mockBooking,
        status: BookingStatus.PAID,
      };

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(paidBooking),
        })),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(service.confirm('booking-1', 'host-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject confirmation if overlapping booking exists', async () => {
      mockAvailabilityService.isListingAvailableWithLock.mockResolvedValue(false);

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockBooking),
        })),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(service.confirm('booking-1', 'host-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('pay', () => {
    const mockBooking = {
      id: 'booking-1',
      renterId: 'renter-1',
      status: BookingStatus.CONFIRMED,
      paid: false,
      paymentInfo: null,
    };

    it('should pay a confirmed booking', async () => {
      mockPaymentsService.findByBooking
        .mockResolvedValueOnce({
          id: 'payment-1',
          status: PaymentIntentStatus.AUTHORIZED,
        })
        .mockResolvedValueOnce({
          id: 'payment-1',
          status: PaymentIntentStatus.CAPTURED,
        });

      mockPaymentsService.capture.mockResolvedValue({
        id: 'payment-1',
        status: PaymentIntentStatus.CAPTURED,
      });

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockBooking),
        })),
        save: jest.fn().mockResolvedValue({
          ...mockBooking,
          status: BookingStatus.PAID,
          paid: true,
        }),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.pay(
        'booking-1',
        { paymentToken: 'token-123', receipt: 'receipt-456' },
        'renter-1',
      );

      expect(result.status).toBe(BookingStatus.PAID);
      expect(result.paid).toBe(true);
      expect(transactionManager.save).toHaveBeenCalled();
      expect(mockPaymentsService.capture).toHaveBeenCalledWith('booking-1');
    });

    it('should be idempotent - return booking if already paid', async () => {
      const paidBooking = {
        ...mockBooking,
        status: BookingStatus.PAID,
        paid: true,
      };

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(paidBooking),
        })),
        save: jest.fn(),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.pay(
        'booking-1',
        { paymentToken: 'token-123', receipt: 'receipt-456' },
        'renter-1',
      );

      expect(result.status).toBe(BookingStatus.PAID);
      expect(transactionManager.save).not.toHaveBeenCalled();
    });

    it('should reject payment if not renter', async () => {
      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockBooking),
        })),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(
        service.pay(
          'booking-1',
          { paymentToken: 'token', receipt: 'receipt' },
          'not-renter',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject payment if status is not CONFIRMED', async () => {
      const pendingBooking = {
        ...mockBooking,
        status: BookingStatus.PENDING,
      };

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(pendingBooking),
        })),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(
        service.pay(
          'booking-1',
          { paymentToken: 'token', receipt: 'receipt' },
          'renter-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    const mockBooking = {
      id: 'booking-1',
      renterId: 'renter-1',
      hostId: 'host-1',
      status: BookingStatus.PENDING,
    };

    it('should cancel a pending booking', async () => {
      const bookingWithDates = {
        ...mockBooking,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-05'),
        totalPrice: 1000,
      };

      mockCancellationPolicyService.evaluateCancellation.mockReturnValue({
        allowCancel: true,
        refundAmount: 0,
        refundType: 'NONE',
        penaltyApplied: false,
        reason: 'Renter cancellation before start: No payment captured to refund',
      });

      mockPaymentsService.findByBooking.mockResolvedValue(null);

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(bookingWithDates),
        })),
        save: jest.fn().mockResolvedValue({
          ...bookingWithDates,
          status: BookingStatus.CANCELLED,
        }),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.cancel('booking-1', 'renter-1');

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(transactionManager.save).toHaveBeenCalled();
      expect(mockCancellationPolicyService.evaluateCancellation).toHaveBeenCalled();
    });

    it('should be idempotent - return booking if already cancelled', async () => {
      const cancelledBooking = {
        ...mockBooking,
        status: BookingStatus.CANCELLED,
      };

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(cancelledBooking),
        })),
        save: jest.fn(),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.cancel('booking-1', 'renter-1');

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(transactionManager.save).not.toHaveBeenCalled();
    });

    it('should reject cancellation if not renter or host', async () => {
      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockBooking),
        })),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(
        service.cancel('booking-1', 'unauthorized-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject cancellation if policy denies it (renter after start)', async () => {
      const paidBooking = {
        ...mockBooking,
        status: BookingStatus.PAID,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-10'),
        totalPrice: 1000,
      };

      mockCancellationPolicyService.evaluateCancellation.mockReturnValue({
        allowCancel: false,
        refundAmount: 0,
        refundType: 'NONE',
        penaltyApplied: true,
        reason: 'Renter cancellation after start date: No refund allowed',
      });

      mockPaymentsService.findByBooking.mockResolvedValue({
        id: 'payment-1',
        status: PaymentIntentStatus.CAPTURED,
      });

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(paidBooking),
        })),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(service.cancel('booking-1', 'renter-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockCancellationPolicyService.evaluateCancellation).toHaveBeenCalled();
    });

    it('should allow cancellation with refund for renter before start date', async () => {
      const paidBooking = {
        ...mockBooking,
        status: BookingStatus.PAID,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-05'),
        totalPrice: 1000,
      };

      mockCancellationPolicyService.evaluateCancellation.mockReturnValue({
        allowCancel: true,
        refundAmount: 1000,
        refundType: 'FULL',
        penaltyApplied: false,
        reason: 'Renter cancellation before start date: Full refund',
      });

      mockPaymentsService.findByBooking.mockResolvedValue({
        id: 'payment-1',
        status: PaymentIntentStatus.CAPTURED,
      });

      mockPaymentsService.refund.mockResolvedValue({
        id: 'payment-1',
        status: PaymentIntentStatus.REFUNDED,
      });

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(paidBooking),
        })),
        save: jest.fn().mockResolvedValue({
          ...paidBooking,
          status: BookingStatus.CANCELLED,
        }),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.cancel('booking-1', 'renter-1');

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(mockPaymentsService.refund).toHaveBeenCalledWith('booking-1');
    });
  });

  describe('create', () => {
    const mockListing = {
      id: 'listing-1',
      hostId: 'host-1',
      isActive: true,
      pricePerDay: 100,
    };

    const createBookingDto = {
      listingId: 'listing-1',
      startDate: '2024-02-01',
      endDate: '2024-02-05',
    };

    it('should reject booking if overlapping booking exists', async () => {
      mockListingsService.findOne.mockResolvedValue(mockListing);

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({ id: 'overlapping-booking' }),
        })),
        create: jest.fn(),
        save: jest.fn(),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(
        service.create(createBookingDto, 'renter-1'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
