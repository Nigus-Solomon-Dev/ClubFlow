import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CountStockHandoverDto } from './dto/count-stock-handover.dto';
import { CreateStockHandoverDto } from './dto/create-stock-handover.dto';
import { StockHandoversService } from './stock-handovers.service';

@Controller('api/stock-handovers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockHandoversController {
  constructor(private readonly stockHandoversService: StockHandoversService) {}

  @Post()
  @Roles(Role.MANAGER, Role.OWNER)
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateStockHandoverDto,
  ) {
    return this.stockHandoversService.create(userId, dto);
  }

  @Get('mine')
  @Roles(Role.BARMAN)
  mine(@CurrentUser('id') userId: string) {
    return this.stockHandoversService.mine(userId);
  }

  @Get('reconciliation')
  @Roles(Role.CASHIER, Role.MANAGER, Role.OWNER)
  reconciliation(@Query('date') date?: string) {
    return this.stockHandoversService.reconciliation(date);
  }

  @Get('active')
  @Roles(Role.CASHIER, Role.MANAGER, Role.OWNER)
  active() {
    return this.stockHandoversService.active();
  }

  @Get()
  @Roles(Role.MANAGER, Role.OWNER, Role.CASHIER)
  list() {
    return this.stockHandoversService.list();
  }

  @Post(':id/count')
  @Roles(Role.CASHIER, Role.MANAGER)
  count(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @Body() dto: CountStockHandoverDto,
  ) {
    return this.stockHandoversService.count(id, actorId, dto);
  }
}
