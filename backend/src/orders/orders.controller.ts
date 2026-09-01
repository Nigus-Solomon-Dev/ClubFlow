import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CancellationStatus,
  EditRequestStatus,
  OrderStatus,
  Role,
} from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderItemDto } from './dto/create-order-item.dto';
import { DecideCancellationDto } from './dto/decide-cancellation.dto';
import { DecideEditDto } from './dto/decide-edit.dto';
import { EditOrderDto } from './dto/edit-order.dto';
import { RequestCancellationDto } from './dto/request-cancellation.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { OrdersService } from './orders.service';

@Controller('api/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(Role.WAITER)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(userId, dto);
  }

  @Get()
  @Roles(Role.WAITER, Role.BARMAN, Role.CASHIER, Role.MANAGER, Role.OWNER)
  findAll(@Query('status') status?: OrderStatus) {
    return this.ordersService.findAll(status);
  }

  @Get(':id')
  @Roles(Role.WAITER, Role.BARMAN, Role.CASHIER, Role.MANAGER, Role.OWNER)
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Post('cancellations/:requestId/barman-approve')
  @Roles(Role.BARMAN, Role.MANAGER)
  barmanApprove(
    @Param('requestId') requestId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.ordersService.barmanApprove(requestId, actorId);
  }

  @Post('cancellations/:requestId/decide')
  @Roles(Role.CASHIER, Role.MANAGER)
  decideCancellation(
    @Param('requestId') requestId: string,
    @CurrentUser('id') actorId: string,
    @Body() dto: DecideCancellationDto,
  ) {
    return this.ordersService.decideCancellation(
      requestId,
      actorId,
      dto.decision as CancellationStatus,
    );
  }

  @Post(':id/items')
  @Roles(Role.WAITER)
  addItem(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOrderItemDto,
  ) {
    return this.ordersService.addItem(id, userId, dto);
  }

  @Patch(':id/items/:itemId')
  @Roles(Role.WAITER)
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateOrderItemDto,
  ) {
    return this.ordersService.updateItem(id, itemId, userId, dto);
  }

  @Delete(':id/items/:itemId')
  @Roles(Role.WAITER)
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.removeItem(id, itemId, userId);
  }

  @Post(':id/send')
  @Roles(Role.WAITER)
  send(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.ordersService.send(id, userId);
  }

  @Post(':id/edit')
  @Roles(Role.WAITER)
  proposeEdit(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: EditOrderDto,
  ) {
    return this.ordersService.proposeEdit(id, userId, dto);
  }

  @Post('edit-requests/:requestId/decide')
  @Roles(Role.BARMAN, Role.MANAGER)
  decideEditRequest(
    @Param('requestId') requestId: string,
    @CurrentUser('id') actorId: string,
    @Body() dto: DecideEditDto,
  ) {
    return this.ordersService.decideEditRequest(
      requestId,
      actorId,
      dto.decision as EditRequestStatus,
    );
  }

  @Post(':id/complete')
  @Roles(Role.BARMAN, Role.MANAGER)
  complete(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.ordersService.complete(id, user.id, user.role);
  }

  @Post(':id/reject-out-of-stock')
  @Roles(Role.BARMAN, Role.MANAGER)
  rejectOutOfStock(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.ordersService.rejectOutOfStock(id, actorId);
  }

  @Post(':id/cancel')
  @Roles(Role.WAITER)
  requestCancellation(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RequestCancellationDto,
  ) {
    return this.ordersService.requestCancellation(id, userId, dto);
  }
}
