import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditService } from './audit.service';

@Controller('api/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('trail')
  trail(
    @Query('limit') limit?: string,
    @Query('role') role?: Role,
    @Query('action') action?: string,
  ) {
    return this.auditService.trail({
      limit: limit ? parseInt(limit, 10) : undefined,
      role,
      action,
    });
  }

  @Get('orders')
  orders() {
    return this.auditService.orderHistory();
  }

  @Get('cancellations')
  cancellations() {
    return this.auditService.cancellationHistory();
  }
}