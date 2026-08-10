import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ShiftsService } from './shifts.service';

@Controller('api/shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post('open')
  @Roles(Role.MANAGER, Role.CASHIER, Role.BARMAN, Role.WAITER)
  @HttpCode(HttpStatus.CREATED)
  open(@CurrentUser('id') userId: string) {
    return this.shiftsService.open(userId);
  }

  @Post('close')
  @Roles(Role.MANAGER, Role.CASHIER, Role.BARMAN, Role.WAITER)
  close(@CurrentUser('id') userId: string) {
    return this.shiftsService.close(userId);
  }

  @Post(':id/accept')
  @Roles(Role.CASHIER, Role.MANAGER)
  accept(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.shiftsService.accept(id, actorId);
  }

  @Get('today')
  @Roles(Role.CASHIER, Role.MANAGER, Role.OWNER)
  today() {
    return this.shiftsService.today();
  }

  @Get()
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER, Role.BARMAN, Role.WAITER)
  list(@CurrentUser() user: { id: string; role: string }) {
    return this.shiftsService.list(user);
  }
}
