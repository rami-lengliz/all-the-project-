import { Module } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
    imports: [LedgerModule],
    providers: [PayoutsService],
    exports: [PayoutsService],
})
export class PayoutsModule { }
