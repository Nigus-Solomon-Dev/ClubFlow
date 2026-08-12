import { Module } from '@nestjs/common';
import { StockHandoversModule } from '../stock-handovers/stock-handovers.module';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  imports: [StockHandoversModule],
  controllers: [ShiftsController],
  providers: [ShiftsService],
})
export class ShiftsModule {}
