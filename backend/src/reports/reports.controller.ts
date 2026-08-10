import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportsService } from './reports.service';

@Controller('api/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  sales(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.sales(from, to);
  }

  @Get('sales-by-category')
  salesByCategory(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.salesByCategory(from, to);
  }

  @Get('top-products')
  topProducts(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.topProducts(
      from,
      to,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('daily')
  daily(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.daily(from, to);
  }

  @Get('monthly')
  monthly(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.monthly(from, to);
  }

  @Get('weekly')
  weekly(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.weekly(from, to);
  }

  @Get('low-selling')
  lowSelling(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.lowSelling(
      from,
      to,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('inventory-usage')
  inventoryUsage(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.inventoryUsage(
      from,
      to,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('cancellations')
  cancellationReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.cancellationReport(from, to);
  }

  @Get('employees')
  employees(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.employees(from, to);
  }

  @Get('activity')
  activity(@Query('limit') limit?: string) {
    return this.reportsService.activity(limit ? parseInt(limit, 10) : 100);
  }
}
