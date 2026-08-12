import { Module } from '@nestjs/common';
import { StockHandoversController } from './stock-handovers.controller';
import { StockHandoversService } from './stock-handovers.service';

@Module({
  controllers: [StockHandoversController],
  providers: [StockHandoversService],
  exports: [StockHandoversService],
})
export class StockHandoversModule {}
