import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { TablesService } from './tables.service';

@Controller('api/tables')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER, Role.OWNER)
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  @Roles(Role.MANAGER, Role.OWNER, Role.WAITER, Role.BARMAN, Role.CASHIER)
  findAll() {
    return this.tablesService.findAll();
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.OWNER, Role.WAITER, Role.BARMAN, Role.CASHIER)
  findOne(@Param('id') id: string) {
    return this.tablesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTableDto) {
    return this.tablesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.tablesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tablesService.remove(id);
  }
}
