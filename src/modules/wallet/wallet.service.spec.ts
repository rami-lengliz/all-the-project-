import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../database/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: any;

  beforeEach(async () => {
    // Mock Prisma transactions and methods
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      wallet: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      ledgerEntry: {
        create: jest.fn(),
      },
      walletTransaction: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  describe('topUp', () => {
    it('should throw if amount is zero or negative', async () => {
      await expect(service.topUp('user1', 0)).rejects.toThrow(BadRequestException);
      await expect(service.topUp('user1', -10)).rejects.toThrow(BadRequestException);
    });

    it('should top up wallet and create ledger/transaction entries', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'user1', balance: 0 });
      prisma.wallet.update.mockResolvedValue({ id: 'w1', balance: 100 });
      prisma.ledgerEntry.create.mockResolvedValue({ id: 'le1' });
      prisma.walletTransaction.create.mockResolvedValue({});

      await service.topUp('user1', 100);

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'w1' },
        data: { balance: 100 },
      });
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: 'WALLET_TOP_UP' }),
      }));
    });
  });

  describe('payForBooking', () => {
    it('should throw if insufficient balance', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 50 });
      await expect(service.payForBooking('user1', 'b1', 100, prisma)).rejects.toThrow(BadRequestException);
    });

    it('should atomically decrement and throw if negative', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 100 });
      prisma.wallet.update.mockResolvedValue({ id: 'w1', balance: -10 }); // Mock race condition

      await expect(service.payForBooking('user1', 'b1', 100, prisma)).rejects.toThrow('Wallet balance cannot go negative');
    });

    it('should succeed if sufficient balance', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 100 });
      prisma.wallet.update.mockResolvedValue({ id: 'w1', balance: 50 });

      await service.payForBooking('user1', 'b1', 50, prisma);

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'w1' },
        data: { balance: { decrement: 50 } },
      });
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          type: 'PAYMENT',
          balanceBefore: 100,
          balanceAfter: 50,
        }),
      }));
    });
  });

  describe('refundToWallet', () => {
    it('should be idempotent (no double refund)', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 100 });
      // Mock existing refund transaction
      prisma.walletTransaction.findFirst.mockResolvedValue({ id: 't1' });

      await service.refundToWallet('user1', 'b1', 50, prisma);

      expect(prisma.wallet.update).not.toHaveBeenCalled();
    });

    it('should process refund if not already refunded', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 100 });
      prisma.walletTransaction.findFirst.mockResolvedValue(null);
      prisma.wallet.update.mockResolvedValue({ id: 'w1', balance: 150 });

      await service.refundToWallet('user1', 'b1', 50, prisma);

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'w1' },
        data: { balance: { increment: 50 } },
      });
    });
  });
});
