import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ManagerService } from './manager.service';

@Controller('api/manager/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER, Role.OWNER)
export class ManagerController {
  constructor(private readonly managerService: ManagerService) {}

  @Get()
  dashboard() {
    return this.managerService.dashboard();
  }
}
