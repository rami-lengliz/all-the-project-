import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { DatabaseModule } from '../../database/database.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ConfigModule } from '@nestjs/config';
import { KonnectProvider } from '../payments/providers/konnect.provider';

@Module({
  imports: [DatabaseModule, LedgerModule, ConfigModule],
  controllers: [WalletController],
  providers: [WalletService, KonnectProvider],
  exports: [WalletService],
})
export class WalletModule {}
