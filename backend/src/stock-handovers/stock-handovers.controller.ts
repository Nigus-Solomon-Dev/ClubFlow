import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CloseStockHandoverDto } from './dto/close-stock-handover.dto';
import { GiveStockDto } from './dto/give-stock.dto';
import { StockHandoversService } from './stock-handovers.service';

@Controller('api/stock-handovers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockHandoversController {
  constructor(private readonly stockHandoversService: StockHandoversService) {}

  // Barman clock-in: opens (or returns) the barman's open stock batch.
  @Post('open')
  @Roles(Role.BARMAN)
  open(@CurrentUser('id') userId: string) {
    return this.stockHandoversService.open(userId);
  }

  // Manager gives / tops up stock into a barman's open batch.
  @Post('give')
  @Roles(Role.MANAGER, Role.OWNER)
  give(@CurrentUser('id') userId: string, @Body() dto: GiveStockDto) {
    return this.stockHandoversService.give(userId, dto);
  }

  // Barman clock-out: records the physical count and closes the batch.
  @Post(':id/close')
  @Roles(Role.BARMAN)
  close(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CloseStockHandoverDto,
  ) {
    return this.stockHandoversService.close(userId, id, dto);
  }

  // Manager accepts a closed batch after physically counting the stock.
  @Post(':id/accept')
  @Roles(Role.MANAGER, Role.OWNER)
  accept(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.stockHandoversService.accept(id, userId);
  }

  @Get('mine')
  @Roles(Role.BARMAN)
  mine(@CurrentUser('id') userId: string) {
    return this.stockHandoversService.mine(userId);
  }

  @Get('active')
  @Roles(Role.MANAGER, Role.OWNER)
  active() {
    return this.stockHandoversService.active();
  }

  @Get('alerts')
  @Roles(Role.MANAGER, Role.OWNER)
  alerts() {
    return this.stockHandoversService.alerts();
  }

  @Get()
  @Roles(Role.MANAGER, Role.OWNER)
  list() {
    return this.stockHandoversService.list();
  }
}
