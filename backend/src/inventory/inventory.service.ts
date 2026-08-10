import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  findAll() {
    return this.prisma.inventory.findMany({
      include: { product: { include: { category: true } } },
      orderBy: { product: { name: 'asc' } },
    });
  }

  async findOne(id: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id },
      include: { product: { include: { category: true } } },
    });
    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }
    return inventory;
  }

  async update(id: string, dto: UpdateInventoryDto, actorId?: string) {
    const inventory = await this.findOne(id);
    const change = dto.quantity - Number(inventory.quantity);

    const updated = await this.prisma.inventory.update({
      where: { id },
      data: { quantity: dto.quantity, unit: dto.unit },
      include: { product: { include: { category: true } } },
    });

    await this.prisma.inventoryMovement.create({
      data: {
        inventoryId: id,
        productId: inventory.productId,
        productName: updated.product.name,
        change,
        quantityAfter: dto.quantity,
        reason: 'manual',
        actorId,
      },
    });

    this.realtime.emitToRoles(
      [Role.MANAGER, Role.BARMAN],
      'inventory.updated',
      { inventoryId: id },
    );
    this.realtime.emitToRoles([Role.MANAGER, Role.OWNER], 'dashboard.updated', {});

    if (actorId) {
      await this.prisma.activityLog.create({
        data: {
          userId: actorId,
          action: 'inventory.update',
          entity: 'Inventory',
          entityId: id,
          details: {
            product: updated.product.name,
            before: Number(inventory.quantity),
            after: dto.quantity,
          } as never,
        },
      });
    }

    return updated;
  }

  async history(limit = 50) {
    return this.prisma.inventoryMovement.findMany({
      include: { order: { select: { orderNumber: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}