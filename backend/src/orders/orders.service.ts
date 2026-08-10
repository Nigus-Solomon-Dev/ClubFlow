import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CancellationStatus,
  EditRequestStatus,
  OrderStatus,
  Prisma,
  Role,
  ShiftStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderItemDto } from './dto/create-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { RequestCancellationDto } from './dto/request-cancellation.dto';
import { EditOrderDto } from './dto/edit-order.dto';

interface OrderEditLine {
  productId: string;
  quantity: number;
  productName?: string;
  unitPrice?: number;
  sellingUnitId?: string | null;
  sellingName?: string | null;
  stockConsumption?: number;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    if (dto.tableId) {
      const table = await this.prisma.restaurantTable.findUnique({
        where: { id: dto.tableId },
      });
      if (!table) {
        throw new NotFoundException('Table not found');
      }
    }

    const shift = await this.prisma.shift.findFirst({
      where: { userId, status: ShiftStatus.OPEN },
      select: { id: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          waiterId: userId,
          tableId: dto.tableId ?? null,
          shiftId: shift?.id ?? null,
        },
      });

      if (dto.items && dto.items.length > 0) {
        for (const item of dto.items) {
          await this.upsertItem(tx, order.id, item);
        }
      }
      await this.recomputeTotal(tx, order.id);

      await tx.activityLog.create({
        data: {
          userId,
          action: 'order.create',
          entity: 'Order',
          entityId: order.id,
        },
      });

      const orderWithItems = await this.findWithItems(tx, order.id);
      this.emitOrderRelated(order.id, 'order.updated');
      return orderWithItems;
    });
  }

  findAll(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : undefined,
      include: {
        table: true,
        waiter: { select: { id: true, name: true } },
        shift: { select: { id: true, status: true, paidAt: true } },
        items: true,
        cancellationRequests: true,
        editRequests: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        table: true,
        waiter: { select: { id: true, name: true } },
        shift: { select: { id: true, status: true, paidAt: true } },
        items: true,
        cancellationRequests: true,
        editRequests: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async addItem(orderId: string, userId: string, dto: CreateOrderItemDto) {
    const order = await this.getEditableByUser(orderId, userId);
    await this.ensureProduct(dto.productId);

    return this.prisma.$transaction(async (tx) => {
      await this.upsertItem(tx, order.id, dto);
      await this.recomputeTotal(tx, order.id);
      return this.findWithItems(tx, order.id);
    });
  }

  private async upsertItem(
    tx: Prisma.TransactionClient,
    orderId: string,
    dto: CreateOrderItemDto,
  ) {
    const product = await tx.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const sell = await this.resolveSelling(
      tx,
      product.id,
      dto.sellingUnitId,
    );

    const existing = await tx.orderItem.findFirst({
      where: {
        orderId,
        productId: dto.productId,
        sellingUnitId: dto.sellingUnitId ?? null,
      },
    });
    if (existing) {
      await tx.orderItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + (dto.quantity ?? 1),
          subtotal: existing.unitPrice.mul(
            existing.quantity + (dto.quantity ?? 1),
          ),
        },
      });
    } else {
      const unitPrice = sell.unitPrice ? sell.unitPrice : product.price;
      await tx.orderItem.create({
        data: {
          orderId,
          productId: product.id,
          sellingUnitId: dto.sellingUnitId ?? null,
          sellingName: sell.sellingName,
          stockConsumption: sell.stockConsumption,
          productName: product.name,
          unitPrice,
          quantity: dto.quantity ?? 1,
          subtotal: unitPrice.mul(dto.quantity ?? 1),
        },
      });
    }
  }

  private async resolveSelling(
    client: Prisma.TransactionClient | PrismaService,
    productId: string,
    sellingUnitId?: string,
  ) {
    if (!sellingUnitId) {
      return { sellingName: null, unitPrice: null, stockConsumption: 1 };
    }
    const unit = await client.sellingUnit.findFirst({
      where: { id: sellingUnitId, productId },
    });
    if (!unit) {
      throw new BadRequestException(
        'Selling unit does not belong to this product',
      );
    }
    return {
      sellingName: unit.name,
      unitPrice: unit.price,
      stockConsumption: Number(unit.stockConsumption),
    };
  }

  async updateItem(
    orderId: string,
    itemId: string,
    userId: string,
    dto: UpdateOrderItemDto,
  ) {
    const order = await this.getEditableByUser(orderId, userId);
    const item = await this.findItemInOrder(order.id, itemId);

    return this.prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          quantity: dto.quantity,
          subtotal: item.unitPrice.mul(dto.quantity),
        },
      });
      await this.recomputeTotal(tx, order.id);
      return this.findWithItems(tx, order.id);
    });
  }

  async removeItem(orderId: string, itemId: string, userId: string) {
    const order = await this.getEditableByUser(orderId, userId);
    const item = await this.findItemInOrder(order.id, itemId);

    return this.prisma.$transaction(async (tx) => {
      await tx.orderItem.delete({ where: { id: item.id } });
      await this.recomputeTotal(tx, order.id);
      return this.findWithItems(tx, order.id);
    });
  }

  async send(orderId: string, userId: string) {
    const order = await this.getEditableByUser(orderId, userId);
    if (order.items.length === 0) {
      throw new BadRequestException('Cannot send an order with no items');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.SENT, sentAt: new Date() },
      });
      await tx.activityLog.create({
        data: {
          userId,
          action: 'order.send',
          entity: 'Order',
          entityId: order.id,
        },
      });
      const orderWithItems = await this.findWithItems(tx, order.id);
      this.emitOrderRelated(order.id, 'order.updated');
      return orderWithItems;
    });
  }

  async complete(orderId: string, actorId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status === OrderStatus.COMPLETED) {
      throw new ConflictException('This order was already completed');
    }
    if (order.status !== OrderStatus.SENT) {
      throw new BadRequestException('Only a SENT order can be completed');
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomically claim the SENT -> COMPLETED transition. Only one request
      // can match an order still in SENT state; concurrent completions fail
      // this guarded update and receive a conflict response.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.SENT },
        data: { status: OrderStatus.COMPLETED, completedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'This order was already completed or is not in a completable state',
        );
      }

      const items = await tx.orderItem.findMany({ where: { orderId } });
      for (const item of items) {
        if (!item.productId) continue;
        const inv = await tx.inventory.findUnique({
          where: { productId: item.productId },
        });
        if (!inv) continue;

        const need =
          item.quantity * (Number(item.stockConsumption) || 1);

        // Atomic guarded decrement: only subtracts while enough stock remains,
        // so inventory never silently goes negative. A shortage throws and
        // rolls the whole transaction back, leaving the order in SENT state.
        const updated = await tx.inventory.updateMany({
          where: { id: inv.id, quantity: { gte: need } },
          data: { quantity: { decrement: need } },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            `Insufficient stock for "${item.productName}": need ${Number(
              item.quantity,
            )} ${item.sellingName ?? ''} (${need} in stock units), available ${Number(
              inv.quantity,
            )}`,
          );
        }

        const after = await tx.inventory.findUnique({
          where: { id: inv.id },
          select: { quantity: true },
        });
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inv.id,
            productId: item.productId,
            productName: item.productName,
            change: -need,
            quantityAfter: Number(after?.quantity ?? 0),
            reason: 'order.complete',
            orderId,
            actorId,
          },
        });
      }
      await tx.activityLog.create({
        data: {
          userId: actorId,
          action: 'order.complete',
          entity: 'Order',
          entityId: orderId,
        },
      });
      const orderWithItems = await this.findWithItems(tx, orderId);
      this.emitOrderRelated(orderId, 'order.updated');
      this.realtime.emitToRoles(
        [Role.BARMAN, Role.MANAGER],
        'inventory.updated',
        {},
      );
      return orderWithItems;
    });
  }

  async requestCancellation(
    orderId: string,
    userId: string,
    dto: RequestCancellationDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.waiterId !== userId) {
      throw new ForbiddenException('You can only cancel orders you created');
    }
    if (
      order.status !== OrderStatus.SENT &&
      order.status !== OrderStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Only an order sent to the kitchen or completed can be cancelled',
      );
    }

    const pending = await this.prisma.cancellationRequest.findFirst({
      where: { orderId, status: CancellationStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException(
        'A cancellation request is already pending',
      );
    }
    const request = await this.prisma.cancellationRequest.create({
      data: {
        orderId,
        requestedById: userId,
        reason: dto.reason,
      },
    });
    await this.prisma.activityLog.create({
      data: {
        userId,
        action: 'order.cancel.request',
        entity: 'Order',
        entityId: orderId,
      },
    });
    this.emitOrderRelated(orderId, 'order.cancellation.requested');
    return request;
  }

  async barmanApprove(requestId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.cancellationRequest.findUnique({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException('Cancellation request not found');
      }
      if (request.status !== CancellationStatus.PENDING) {
        throw new ConflictException(
          'This cancellation request has already been decided',
        );
      }
      if (request.barmanId) {
        throw new ConflictException(
          'This cancellation request was already approved by the barman',
        );
      }

      const order = await tx.order.findUnique({
        where: { id: request.orderId },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (
        order.status !== OrderStatus.SENT &&
        order.status !== OrderStatus.COMPLETED
      ) {
        throw new BadRequestException(
          'This order cannot be cancelled at this stage',
        );
      }

      if (order.status === OrderStatus.COMPLETED) {
        const items = await tx.orderItem.findMany({
          where: { orderId: order.id },
        });
        for (const item of items) {
          if (item.productId) {
            await tx.inventory.updateMany({
              where: { productId: item.productId },
              data: {
                quantity: {
                  increment: item.quantity * (Number(item.stockConsumption) || 1),
                },
              },
            });
          }
        }
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
      });
      await this.approveCancellationNow(tx, request.id, actorId);
      await tx.activityLog.create({
        data: {
          userId: actorId,
          action: 'order.cancel.barman_approve',
          entity: 'CancellationRequest',
          entityId: request.id,
        },
      });
      this.emitOrderRelated(order.id, 'order.updated');
      this.emitOrderRelated(order.id, 'order.cancellation.approved');
      return tx.cancellationRequest.findUnique({
        where: { id: requestId },
        include: { order: true, requestedBy: { select: { name: true } } },
      });
    });
  }

  private async approveCancellationNow(
    tx: Prisma.TransactionClient,
    requestId: string,
    actorId: string,
  ) {
    await tx.cancellationRequest.update({
      where: { id: requestId },
      data: {
        barmanId: actorId,
        barmanDecidedAt: new Date(),
        status: CancellationStatus.APPROVED,
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });
  }

  async decideCancellation(
    requestId: string,
    actorId: string,
    decision: CancellationStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.cancellationRequest.findUnique({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException('Cancellation request not found');
      }
      if (request.status !== CancellationStatus.PENDING) {
        throw new ConflictException(
          'This cancellation request has already been decided',
        );
      }
      if (!request.barmanId) {
        throw new ConflictException(
          'The barman must approve this cancellation first',
        );
      }

      await tx.cancellationRequest.update({
        where: { id: requestId },
        data: {
          status: decision,
          decidedById: actorId,
          decidedAt: new Date(),
        },
      });

      if (decision === CancellationStatus.APPROVED) {
        const order = await tx.order.findUnique({
          where: { id: request.orderId },
        });
        if (!order) {
          throw new NotFoundException('Order not found');
        }
        if (order.status === OrderStatus.COMPLETED) {
          const items = await tx.orderItem.findMany({
            where: { orderId: order.id },
          });
          for (const item of items) {
            if (item.productId) {
              await tx.inventory.updateMany({
                where: { productId: item.productId },
                data: {
                quantity: {
                  increment: item.quantity * (Number(item.stockConsumption) || 1),
                },
              },
              });
            }
          }
        }
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
        });
      }

      await tx.activityLog.create({
        data: {
          userId: actorId,
          action: `order.cancel.${decision.toLowerCase()}`,
          entity: 'CancellationRequest',
          entityId: request.id,
        },
      });
      this.emitOrderRelated(request.orderId, 'order.cancellation.decided');
      return tx.cancellationRequest.findUnique({
        where: { id: requestId },
        include: { order: true },
      });
    });
  }

  async proposeEdit(orderId: string, userId: string, dto: EditOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.waiterId !== userId) {
      throw new ForbiddenException('You can only edit orders you created');
    }
    if (
      order.status !== OrderStatus.SENT &&
      order.status !== OrderStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Only an order sent to the kitchen or already completed can be edited',
      );
    }

    const lines: OrderEditLine[] = [];
    for (const item of dto.items) {
      const product = await this.ensureProduct(item.productId);
      const sell = await this.resolveSelling(
        this.prisma,
        item.productId,
        item.sellingUnitId,
      );
      lines.push({
        productId: item.productId,
        quantity: item.quantity,
        productName: product.name,
        unitPrice: sell.unitPrice ? Number(sell.unitPrice) : Number(product.price),
        sellingUnitId: item.sellingUnitId ?? null,
        sellingName: sell.sellingName,
        stockConsumption: sell.stockConsumption,
      });
    }

    if (order.status === OrderStatus.SENT) {
      return this.prisma.$transaction(async (tx) => {
        await this.replaceOrderItems(tx, order.id, lines);
        await this.recomputeTotal(tx, order.id);
        await tx.activityLog.create({
          data: {
            userId,
            action: 'order.edit',
            entity: 'Order',
            entityId: order.id,
          },
        });
        const updated = await this.findWithItems(tx, order.id);
        this.emitOrderRelated(order.id, 'order.updated');
        return updated;
      });
    }

    const pending = await this.prisma.orderEditRequest.findFirst({
      where: { orderId, status: EditRequestStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException(
        'An edit request is already pending for this order',
      );
    }

    const request = await this.prisma.orderEditRequest.create({
      data: {
        orderId,
        requestedById: userId,
        items: lines as unknown as Prisma.InputJsonValue,
      },
    });
    this.emitOrderRelated(orderId, 'order.edit.requested');
    return request;
  }

  async decideEditRequest(
    requestId: string,
    actorId: string,
    decision: EditRequestStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.orderEditRequest.findUnique({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException('Edit request not found');
      }
      if (request.status !== EditRequestStatus.PENDING) {
        throw new ConflictException(
          'This edit request has already been decided',
        );
      }

      const order = await tx.order.findUnique({
        where: { id: request.orderId },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const lines = request.items as unknown as OrderEditLine[];

      if (decision === EditRequestStatus.APPROVED) {
        if (order.status === OrderStatus.CANCELLED) {
          await tx.orderEditRequest.update({
            where: { id: request.id },
            data: {
              status: EditRequestStatus.REJECTED,
              decidedById: actorId,
              decidedAt: new Date(),
            },
          });
          await tx.activityLog.create({
            data: {
              userId: actorId,
              action: 'order.edit.reject',
              entity: 'OrderEditRequest',
              entityId: request.id,
            },
          });
          this.emitOrderRelated(order.id, 'order.edit.decided');
          return tx.orderEditRequest.findUnique({
            where: { id: requestId },
            include: { order: true },
          });
        }

        for (const line of lines) {
          await this.ensureProduct(line.productId);
        }

        if (order.status === OrderStatus.COMPLETED) {
          const oldItems = await tx.orderItem.findMany({
            where: { orderId: order.id },
          });
          for (const item of oldItems) {
            if (item.productId) {
              await tx.inventory.updateMany({
                where: { productId: item.productId },
                data: {
                quantity: {
                  increment: item.quantity * (Number(item.stockConsumption) || 1),
                },
              },
              });
            }
          }
        }

        await this.replaceOrderItems(tx, order.id, lines);
        await this.recomputeTotal(tx, order.id);
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.SENT, sentAt: new Date() },
        });
        await tx.orderEditRequest.update({
          where: { id: request.id },
          data: {
            status: EditRequestStatus.APPROVED,
            decidedById: actorId,
            decidedAt: new Date(),
          },
        });
        await tx.activityLog.create({
          data: {
            userId: actorId,
            action: 'order.edit.approve',
            entity: 'OrderEditRequest',
            entityId: request.id,
          },
        });
        this.emitOrderRelated(order.id, 'order.updated');
        this.emitOrderRelated(order.id, 'order.edit.decided');
        return tx.orderEditRequest.findUnique({
          where: { id: requestId },
          include: { order: true },
        });
      }

      await tx.orderEditRequest.update({
        where: { id: request.id },
        data: {
          status: EditRequestStatus.REJECTED,
          decidedById: actorId,
          decidedAt: new Date(),
        },
      });
      await tx.activityLog.create({
        data: {
          userId: actorId,
          action: 'order.edit.reject',
          entity: 'OrderEditRequest',
          entityId: request.id,
        },
      });
      this.emitOrderRelated(order.id, 'order.edit.decided');
      return tx.orderEditRequest.findUnique({
        where: { id: requestId },
        include: { order: true },
      });
    });
  }

  private async replaceOrderItems(
    tx: Prisma.TransactionClient,
    orderId: string,
    lines: OrderEditLine[],
  ) {
    await tx.orderItem.deleteMany({ where: { orderId } });
    for (const line of lines) {
      const product = await tx.product.findUnique({
        where: { id: line.productId },
      });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      const unitPrice = line.unitPrice ?? Number(product.price);
      await tx.orderItem.create({
        data: {
          orderId,
          productId: product.id,
          sellingUnitId: line.sellingUnitId ?? null,
          sellingName: line.sellingName ?? null,
          stockConsumption: line.stockConsumption ?? 1,
          productName: product.name,
          unitPrice,
          quantity: line.quantity,
          subtotal: unitPrice * line.quantity,
        },
      });
    }
  }

  private emitOrderRelated(orderId: string, event: string) {
    this.realtime.emitToRoles(
      [Role.WAITER, Role.BARMAN, Role.CASHIER],
      event,
      { orderId },
    );
    // Managers and owners watch live dashboards and notification feeds.
    this.realtime.emitToRoles(
      [Role.MANAGER, Role.OWNER],
      event,
      { orderId },
    );
    this.realtime.emitToRoles(
      [Role.MANAGER, Role.OWNER],
      'dashboard.updated',
      {},
    );
  }

  private async getEditableByUser(orderId: string, userId: string) {
    const order = await this.getEdible(orderId);
    if (order.waiterId !== userId) {
      throw new ForbiddenException('You can only edit orders you created');
    }
    return order;
  }

  private async getEdible(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== OrderStatus.DRAFT) {
      throw new ForbiddenException(
        'Order can only be modified while it is a DRAFT',
      );
    }
    return order;
  }

  private async ensureProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (!product.isAvailable) {
      throw new BadRequestException('This product is currently unavailable');
    }
    return product;
  }

  private async findItemInOrder(orderId: string, itemId: string) {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) {
      throw new NotFoundException('Order item not found');
    }
    return item;
  }

  private async recomputeTotal(tx: Prisma.TransactionClient, orderId: string) {
    const agg = await tx.orderItem.aggregate({
      where: { orderId },
      _sum: { subtotal: true },
    });
    await tx.order.update({
      where: { id: orderId },
      data: { totalPrice: agg._sum.subtotal ?? 0 },
    });
  }

  private findWithItems(tx: Prisma.TransactionClient, orderId: string) {
    return tx.order.findUnique({
      where: { id: orderId },
      include: {
        waiter: { select: { id: true, name: true } },
        table: true,
        shift: { select: { id: true, status: true, paidAt: true } },
        items: true,
      },
    });
  }
}
