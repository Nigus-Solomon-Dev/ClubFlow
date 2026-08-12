import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('api/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('history')
  @Roles(Role.MANAGER, Role.OWNER)
  history(@Query('limit') limit?: string) {
    return this.inventoryService.history(limit ? parseInt(limit, 10) : 50);
  }

  @Get()
  @Roles(Role.MANAGER, Role.BARMAN, Role.OWNER)
  findAll() {
    return this.inventoryService.findAll();
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.BARMAN, Role.OWNER)
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.inventoryService.update(id, dto, actorId);
  }
}
