import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { GiveManagerStockDto } from './dto/give-manager-stock.dto';
import { SettleManagerStockDto } from './dto/settle-manager-stock.dto';
import { ManagerStockHandoversService } from './manager-stock-handovers.service';

@Controller('api/manager-stock-handovers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManagerStockHandoversController {
  constructor(
    private readonly managerStockHandoversService: ManagerStockHandoversService,
  ) {}

  // Owner gives / tops up the manager's open stock balance.
  @Post('give')
  @Roles(Role.OWNER)
  give(@CurrentUser('id') userId: string, @Body() dto: GiveManagerStockDto) {
    return this.managerStockHandoversService.give(userId, dto);
  }

  // Manager closes their stock batch with a physical count.
  @Post('close')
  @Roles(Role.MANAGER)
  close(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: SettleManagerStockDto,
  ) {
    return this.managerStockHandoversService.closeStock(user, dto);
  }

  // Owner accepts the manager's closed stock batch after counting it.
  @Post(':id/accept')
  @Roles(Role.OWNER)
  accept(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.managerStockHandoversService.accept(id, userId);
  }

  @Get()
  @Roles(Role.MANAGER, Role.OWNER)
  list(@CurrentUser() user: { id: string; role: string }) {
    return this.managerStockHandoversService.list(user);
  }
}
