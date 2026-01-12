import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvailabilityUtil } from './availability.util';
import { Booking, BookingStatus } from '../../entities/booking.entity';

describe('AvailabilityUtil', () => {
  let util: AvailabilityUtil;
  let bookingRepository: Repository<Booking>;

  const mockBookingRepository = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityUtil,
        {
          provide: getRepositoryToken(Booking),
          useValue: mockBookingRepository,
        },
      ],
    }).compile();

    util = module.get<AvailabilityUtil>(AvailabilityUtil);
    bookingRepository = module.get<Repository<Booking>>(
      getRepositoryToken(Booking),
    );
  });

  it('should be defined', () => {
    expect(util).toBeDefined();
  });

  describe('isDateRangeAvailable', () => {
    it('should return true when no conflicting bookings exist', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await util.isDateRangeAvailable(
        'listing-id',
        new Date('2024-06-01'),
        new Date('2024-06-05'),
      );

      expect(result).toBe(true);
      expect(mockQueryBuilder.getOne).toHaveBeenCalled();
    });

    it('should return false when conflicting booking exists', async () => {
      const conflictingBooking = { id: 'booking-id' };
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(conflictingBooking),
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await util.isDateRangeAvailable(
        'listing-id',
        new Date('2024-06-01'),
        new Date('2024-06-05'),
      );

      expect(result).toBe(false);
    });
  });
});

