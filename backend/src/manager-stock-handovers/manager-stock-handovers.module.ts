import { Module } from '@nestjs/common';
import { ManagerStockHandoversController } from './manager-stock-handovers.controller';
import { ManagerStockHandoversService } from './manager-stock-handovers.service';

@Module({
  controllers: [ManagerStockHandoversController],
  providers: [ManagerStockHandoversService],
  exports: [ManagerStockHandoversService],
})
export class ManagerStockHandoversModule {}
