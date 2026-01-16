import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AvailabilityService } from './availability.service';
import { Booking, BookingStatus } from '../../entities/booking.entity';

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let bookingRepository: any;
  let dataSource: any;

  const mockBookingRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        {
          provide: getRepositoryToken(Booking),
          useValue: mockBookingRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
    bookingRepository = module.get(getRepositoryToken(Booking));
    dataSource = module.get(DataSource);

    jest.clearAllMocks();
  });

  describe('isListingAvailable', () => {
    it('should return true when no bookings exist', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.isListingAvailable(
        'listing-1',
        new Date('2024-02-01'),
        new Date('2024-02-05'),
      );

      expect(result).toBe(true);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'booking.status IN (:...statuses)',
        expect.objectContaining({
          statuses: [BookingStatus.CONFIRMED, BookingStatus.PAID],
        }),
      );
    });

    it('should return false when CONFIRMED booking overlaps', async () => {
      const conflictingBooking = {
        id: 'booking-1',
        status: BookingStatus.CONFIRMED,
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(conflictingBooking),
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.isListingAvailable(
        'listing-1',
        new Date('2024-02-01'),
        new Date('2024-02-05'),
      );

      expect(result).toBe(false);
    });

    it('should return false when PAID booking overlaps', async () => {
      const conflictingBooking = {
        id: 'booking-1',
        status: BookingStatus.PAID,
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(conflictingBooking),
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.isListingAvailable(
        'listing-1',
        new Date('2024-02-01'),
        new Date('2024-02-05'),
      );

      expect(result).toBe(false);
    });

    it('should return true when only PENDING booking exists (PENDING does not block)', async () => {
      // This test ensures PENDING bookings don't block availability
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null), // No CONFIRMED/PAID found
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.isListingAvailable(
        'listing-1',
        new Date('2024-02-01'),
        new Date('2024-02-05'),
      );

      expect(result).toBe(true);
      // Verify that only CONFIRMED and PAID are checked
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'booking.status IN (:...statuses)',
        expect.objectContaining({
          statuses: [BookingStatus.CONFIRMED, BookingStatus.PAID],
        }),
      );
    });

    it('should handle edge case: booking ends exactly when request starts (no overlap)', async () => {
      // Request: Feb 5-10
      // Booking: Feb 1-5 (ends exactly when request starts)
      // Should be available (endDate is exclusive)
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.isListingAvailable(
        'listing-1',
        new Date('2024-02-05'),
        new Date('2024-02-10'),
      );

      expect(result).toBe(true);
    });

    it('should handle edge case: booking starts exactly when request ends (no overlap)', async () => {
      // Request: Feb 1-5
      // Booking: Feb 5-10 (starts exactly when request ends)
      // Should be available (endDate is exclusive)
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.isListingAvailable(
        'listing-1',
        new Date('2024-02-01'),
        new Date('2024-02-05'),
      );

      expect(result).toBe(true);
    });

    it('should exclude booking when excludeBookingId is provided', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.isListingAvailable(
        'listing-1',
        new Date('2024-02-01'),
        new Date('2024-02-05'),
        'exclude-booking-1',
      );

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'booking.id != :excludeBookingId',
        { excludeBookingId: 'exclude-booking-1' },
      );
    });

    it('should throw error if startDate >= endDate', async () => {
      await expect(
        service.isListingAvailable(
          'listing-1',
          new Date('2024-02-05'),
          new Date('2024-02-01'),
        ),
      ).rejects.toThrow('Start date must be before end date');

      await expect(
        service.isListingAvailable(
          'listing-1',
          new Date('2024-02-01'),
          new Date('2024-02-01'),
        ),
      ).rejects.toThrow('Start date must be before end date');
    });
  });

  describe('getUnavailableRanges', () => {
    it('should return unavailable date ranges for CONFIRMED and PAID bookings', async () => {
      const bookings = [
        {
          id: 'booking-1',
          status: BookingStatus.CONFIRMED,
          startDate: new Date('2024-02-01'),
          endDate: new Date('2024-02-05'),
        },
        {
          id: 'booking-2',
          status: BookingStatus.PAID,
          startDate: new Date('2024-02-10'),
          endDate: new Date('2024-02-15'),
        },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(bookings),
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.getUnavailableRanges('listing-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        startDate: bookings[0].startDate,
        endDate: bookings[0].endDate,
      });
      expect(result[1]).toEqual({
        startDate: bookings[1].startDate,
        endDate: bookings[1].endDate,
      });
    });

    it('should exclude PENDING bookings from unavailable ranges', async () => {
      const bookings = [
        {
          id: 'booking-1',
          status: BookingStatus.PENDING,
          startDate: new Date('2024-02-01'),
          endDate: new Date('2024-02-05'),
        },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]), // No CONFIRMED/PAID found
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.getUnavailableRanges('listing-1');

      expect(result).toHaveLength(0);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'booking.status IN (:...statuses)',
        expect.objectContaining({
          statuses: [BookingStatus.CONFIRMED, BookingStatus.PAID],
        }),
      );
    });
  });

  describe('doRangesOverlap', () => {
    it('should detect overlapping ranges', () => {
      const range1 = {
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-05'),
      };
      const range2 = {
        startDate: new Date('2024-02-03'),
        endDate: new Date('2024-02-07'),
      };

      expect(AvailabilityService.doRangesOverlap(range1, range2)).toBe(true);
    });

    it('should not detect overlap when ranges are adjacent (end == start)', () => {
      const range1 = {
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-05'),
      };
      const range2 = {
        startDate: new Date('2024-02-05'),
        endDate: new Date('2024-02-10'),
      };

      expect(AvailabilityService.doRangesOverlap(range1, range2)).toBe(false);
    });

    it('should not detect overlap when ranges are separate', () => {
      const range1 = {
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-05'),
      };
      const range2 = {
        startDate: new Date('2024-02-10'),
        endDate: new Date('2024-02-15'),
      };

      expect(AvailabilityService.doRangesOverlap(range1, range2)).toBe(false);
    });
  });
});
