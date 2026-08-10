import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CollectSettlementDto } from './dto/collect-settlement.dto';
import { SettlementsService } from './settlements.service';

@Controller('api/settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get('today')
  @Roles(Role.CASHIER, Role.MANAGER, Role.OWNER)
  today(@CurrentUser('id') actorId: string) {
    return this.settlementsService.today(actorId);
  }

  @Post('today/collect')
  @Roles(Role.CASHIER, Role.MANAGER)
  collect(
    @CurrentUser('id') actorId: string,
    @Body() dto: CollectSettlementDto,
  ) {
    return this.settlementsService.collect(actorId, dto);
  }

  @Post('today/close')
  @Roles(Role.CASHIER, Role.MANAGER)
  close(@CurrentUser('id') actorId: string) {
    return this.settlementsService.close(actorId);
  }

  @Get()
  @Roles(Role.MANAGER, Role.OWNER)
  history(@CurrentUser('id') actorId: string) {
    return this.settlementsService.history(actorId);
  }
}