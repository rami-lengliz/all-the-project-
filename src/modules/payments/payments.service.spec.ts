import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PaymentsService } from './payments.service';
import {
  PaymentIntent,
  PaymentIntentStatus,
} from '../../entities/payment-intent.entity';
import { Booking, BookingStatus } from '../../entities/booking.entity';
import { BookingsService } from '../bookings/bookings.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentIntentRepository: any;
  let bookingsService: any;
  let dataSource: any;

  const mockPaymentIntentRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockBookingsService = {
    findOne: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn((callback) =>
      callback({
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn(),
        })),
        save: jest.fn(),
      }),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getRepositoryToken(PaymentIntent),
          useValue: mockPaymentIntentRepository,
        },
        {
          provide: getRepositoryToken(Booking),
          useValue: {},
        },
        {
          provide: BookingsService,
          useValue: mockBookingsService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    paymentIntentRepository = module.get(getRepositoryToken(PaymentIntent));
    bookingsService = module.get(BookingsService);
    dataSource = module.get(DataSource);

    jest.clearAllMocks();
  });

  describe('authorize', () => {
    const mockPaymentIntent = {
      id: 'pi-1',
      bookingId: 'booking-1',
      renterId: 'renter-1',
      hostId: 'host-1',
      amount: 100,
      currency: 'TND',
      status: PaymentIntentStatus.CREATED,
    };

    it('should authorize a created payment intent', async () => {
      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockPaymentIntent),
        })),
        save: jest.fn().mockResolvedValue({
          ...mockPaymentIntent,
          status: PaymentIntentStatus.AUTHORIZED,
        }),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.authorize('booking-1', 'renter-1');

      expect(result.status).toBe(PaymentIntentStatus.AUTHORIZED);
      expect(transactionManager.save).toHaveBeenCalled();
    });

    it('should be idempotent - return if already authorized', async () => {
      const authorizedIntent = {
        ...mockPaymentIntent,
        status: PaymentIntentStatus.AUTHORIZED,
      };

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(authorizedIntent),
        })),
        save: jest.fn(),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.authorize('booking-1', 'renter-1');

      expect(result.status).toBe(PaymentIntentStatus.AUTHORIZED);
      expect(transactionManager.save).not.toHaveBeenCalled();
    });

    it('should reject authorization if not renter', async () => {
      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockPaymentIntent),
        })),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(
        service.authorize('booking-1', 'not-renter'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject authorization if status is not CREATED', async () => {
      const capturedIntent = {
        ...mockPaymentIntent,
        status: PaymentIntentStatus.CAPTURED,
      };

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(capturedIntent),
        })),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(service.authorize('booking-1', 'renter-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('capture', () => {
    const mockPaymentIntent = {
      id: 'pi-1',
      bookingId: 'booking-1',
      status: PaymentIntentStatus.AUTHORIZED,
    };

    it('should capture an authorized payment intent', async () => {
      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockPaymentIntent),
        })),
        save: jest.fn().mockResolvedValue({
          ...mockPaymentIntent,
          status: PaymentIntentStatus.CAPTURED,
        }),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.capture('booking-1');

      expect(result.status).toBe(PaymentIntentStatus.CAPTURED);
      expect(transactionManager.save).toHaveBeenCalled();
    });

    it('should be idempotent - return if already captured', async () => {
      const capturedIntent = {
        ...mockPaymentIntent,
        status: PaymentIntentStatus.CAPTURED,
      };

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(capturedIntent),
        })),
        save: jest.fn(),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.capture('booking-1');

      expect(result.status).toBe(PaymentIntentStatus.CAPTURED);
      expect(transactionManager.save).not.toHaveBeenCalled();
    });

    it('should reject capture if status is not AUTHORIZED', async () => {
      const createdIntent = {
        ...mockPaymentIntent,
        status: PaymentIntentStatus.CREATED,
      };

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(createdIntent),
        })),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(service.capture('booking-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('refund', () => {
    const mockPaymentIntent = {
      id: 'pi-1',
      bookingId: 'booking-1',
      status: PaymentIntentStatus.CAPTURED,
    };

    it('should refund a captured payment intent', async () => {
      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockPaymentIntent),
        })),
        save: jest.fn().mockResolvedValue({
          ...mockPaymentIntent,
          status: PaymentIntentStatus.REFUNDED,
        }),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.refund('booking-1');

      expect(result.status).toBe(PaymentIntentStatus.REFUNDED);
      expect(transactionManager.save).toHaveBeenCalled();
    });

    it('should reject refund if status is not CAPTURED', async () => {
      const authorizedIntent = {
        ...mockPaymentIntent,
        status: PaymentIntentStatus.AUTHORIZED,
      };

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(authorizedIntent),
        })),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(service.refund('booking-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancel', () => {
    const mockPaymentIntent = {
      id: 'pi-1',
      bookingId: 'booking-1',
      renterId: 'renter-1',
      hostId: 'host-1',
      status: PaymentIntentStatus.AUTHORIZED,
    };

    it('should cancel an authorized payment intent', async () => {
      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockPaymentIntent),
        })),
        save: jest.fn().mockResolvedValue({
          ...mockPaymentIntent,
          status: PaymentIntentStatus.CANCELLED,
        }),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      const result = await service.cancel('booking-1', 'renter-1');

      expect(result.status).toBe(PaymentIntentStatus.CANCELLED);
      expect(transactionManager.save).toHaveBeenCalled();
    });

    it('should reject cancel if status is not AUTHORIZED', async () => {
      const capturedIntent = {
        ...mockPaymentIntent,
        status: PaymentIntentStatus.CAPTURED,
      };

      const transactionManager = {
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(capturedIntent),
        })),
      };

      mockDataSource.transaction.mockImplementation((callback) =>
        callback(transactionManager),
      );

      await expect(service.cancel('booking-1', 'renter-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
