import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, ShiftStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { GiveManagerStockDto } from './dto/give-manager-stock.dto';
import { SettleManagerStockDto } from './dto/settle-manager-stock.dto';

const productSelect = {
  id: true,
  name: true,
  stockUnit: true,
  piecesPerCase: true,
  category: { select: { name: true } },
  sellingUnits: {
    select: {
      id: true,
      name: true,
      price: true,
      stockConsumption: true,
      isDefault: true,
    },
  },
} as const;

const include = {
  manager: { select: { id: true, name: true } },
  givenBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  acceptedBy: { select: { id: true, name: true } },
  items: {
    orderBy: { product: { name: 'asc' } },
    include: { product: { select: productSelect } },
  },
} satisfies Prisma.ManagerStockHandoverInclude;

type HandoverWithItems = Prisma.ManagerStockHandoverGetPayload<{
  include: typeof include;
}>;

@Injectable()
export class ManagerStockHandoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(user: { id: string; role: string }) {
    const rows = await this.prisma.managerStockHandover.findMany({
      where: user.role === Role.OWNER ? {} : { managerId: user.id },
      include,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.serialize(r)));
  }

  async give(actorId: string, dto: GiveManagerStockDto) {
    const manager = await this.prisma.user.findUnique({
      where: { id: dto.managerId },
    });
    if (!manager || manager.role !== Role.MANAGER) {
      throw new BadRequestException('Selected employee is not a manager');
    }

    let handover = await this.prisma.managerStockHandover.findFirst({
      where: { managerId: dto.managerId, status: { not: 'CLOSED' } },
      select: { id: true, givenById: true },
    });
    if (!handover) {
      handover = await this.prisma.$transaction(async (tx) => {
        const h = await tx.managerStockHandover.create({
          data: { managerId: dto.managerId, givenById: actorId },
        });
        await tx.managerStockHandoverEvent.create({
          data: { handoverId: h.id, actorId, action: 'OPEN' },
        });
        return h;
      });
    } else if (!handover.givenById) {
      handover = await this.prisma.managerStockHandover.update({
        where: { id: handover.id },
        data: { givenById: actorId },
        select: { id: true, givenById: true },
      });
    }

    const existingItems = await this.prisma.managerStockHandoverItem.findMany({
      where: { handoverId: handover.id },
      select: { id: true, productId: true, givenQty: true },
    });

    const merged = this.mergeItems(dto.items);
    const productIds = [...new Set(merged.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Some products do not exist');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of merged) {
        const existing = existingItems.find(
          (i) => i.productId === item.productId,
        );
        if (existing) {
          await tx.managerStockHandoverItem.update({
            where: { id: existing.id },
            data: { givenQty: existing.givenQty.add(item.givenQty) },
          });
        } else {
          await tx.managerStockHandoverItem.create({
            data: {
              handoverId: handover.id,
              productId: item.productId,
              givenQty: item.givenQty,
            },
          });
        }
      }
      await tx.managerStockHandoverEvent.create({
        data: {
          handoverId: handover.id,
          actorId,
          action: 'GIVE',
          items: merged,
        },
      });
      await tx.activityLog.create({
        data: {
          userId: actorId,
          action: 'manager.handover.give',
          entity: 'ManagerStockHandover',
          entityId: handover.id,
        },
      });
    });

    this.emitChanged(handover.id, dto.managerId);
    return this.findOne(handover.id);
  }

  /**
   * The manager's action to close their stock batch with a physical count.
   * It blocks until every barman stock batch is closed and accepted.
   */
  async closeStock(user: { id: string; role: string }, dto: SettleManagerStockDto) {
    const openBarman = await this.prisma.stockHandover.findFirst({
      where: { status: { not: 'CLOSED' } },
      select: { id: true },
    });
    if (openBarman) {
      throw new BadRequestException(
        'Count and close every barman stock batch before closing your stock.',
      );
    }

    const unacceptedBarman = await this.prisma.stockHandover.findFirst({
      where: { status: 'CLOSED', acceptedAt: null },
      select: { id: true },
    });
    if (unacceptedBarman) {
      throw new BadRequestException(
        'Accept every barman\'s counted stock before closing your stock.',
      );
    }

    const openStock = await this.prisma.managerStockHandover.findFirst({
      where: { managerId: user.id, status: { not: 'CLOSED' } },
      include: {
        items: {
          select: { id: true, productId: true, givenQty: true, givenAwayQty: true },
        },
      },
    });

    if (!openStock) {
      throw new BadRequestException('There is no open manager stock to close.');
    }

    const counts = new Map(dto.items.map((i) => [i.productId, i.countedQty]));
    for (const item of openStock.items) {
      if (!counts.has(item.productId)) {
        throw new BadRequestException(
          'Missing count for a product in your stock handover.',
        );
      }
    }
    for (const productId of counts.keys()) {
      if (!openStock.items.some((i) => i.productId === productId)) {
        throw new BadRequestException(
          'Count includes a product not in your stock handover.',
        );
      }
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const item of openStock.items) {
        const countedQty = counts.get(item.productId)!;
        const givenAway = Number(item.givenAwayQty);
        await tx.managerStockHandoverItem.update({
          where: { id: item.id },
          data: {
            countedQty,
            consumedQty: this.round(givenAway),
            variance: this.round(
              Number(item.givenQty) - givenAway - countedQty,
            ),
          },
        });
      }
      await tx.managerStockHandover.update({
        where: { id: openStock.id },
        data: { status: 'CLOSED', closedAt: now, closedById: user.id },
      });
      await tx.managerStockHandoverEvent.create({
        data: { handoverId: openStock.id, actorId: user.id, action: 'CLOSE' },
      });
      await tx.activityLog.create({
        data: {
          userId: user.id,
          action: 'manager.handover.close',
          entity: 'ManagerStockHandover',
          entityId: openStock.id,
        },
      });
    });

    this.emitChanged(openStock.id, user.id);

    return {
      stock: await this.findOne(openStock.id),
    };
  }

  async accept(handoverId: string, actorId: string) {
    const handover = await this.prisma.managerStockHandover.findUnique({
      where: { id: handoverId },
      select: { id: true, status: true, acceptedAt: true },
    });
    if (!handover) {
      throw new NotFoundException('Manager stock handover not found');
    }
    if (handover.status !== 'CLOSED') {
      throw new BadRequestException('Only closed stock can be accepted');
    }
    if (handover.acceptedAt) {
      throw new BadRequestException('This stock was already accepted');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.managerStockHandover.update({
        where: { id: handover.id },
        data: { acceptedAt: new Date(), acceptedById: actorId },
      });
      await tx.managerStockHandoverEvent.create({
        data: { handoverId: handover.id, actorId, action: 'ACCEPT' },
      });
      await tx.activityLog.create({
        data: {
          userId: actorId,
          action: 'manager.handover.accept',
          entity: 'ManagerStockHandover',
          entityId: handover.id,
        },
      });
    });

    this.emitChanged(handover.id, handover.id);
    return this.findOne(handover.id);
  }

  private async serialize(handover: HandoverWithItems) {
    return {
      ...handover,
      items: handover.items.map((it) => {
        const givenAway = Number(it.givenAwayQty);
        const left = this.round(Number(it.givenQty) - givenAway);
        return {
          ...it,
          givenQty: Number(it.givenQty),
          givenAwayQty: Number(it.givenAwayQty),
          countedQty: it.countedQty == null ? null : Number(it.countedQty),
          consumedQty: it.consumedQty == null ? null : Number(it.consumedQty),
          variance: it.variance == null ? null : Number(it.variance),
          soldQty: this.round(givenAway),
          left,
          level: left <= 0 ? 'empty' : 'ok',
        };
      }),
    };
  }

  private async findOne(id: string) {
    const row = await this.prisma.managerStockHandover.findUnique({
      where: { id },
      include,
    });
    if (!row) {
      throw new NotFoundException('Manager stock handover not found');
    }
    return this.serialize(row);
  }

  private mergeItems(items: { productId: string; givenQty: number }[]) {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.productId, (map.get(item.productId) ?? 0) + item.givenQty);
    }
    return [...map.entries()].map(([productId, givenQty]) => ({
      productId,
      givenQty,
    }));
  }

  private round(n: number): number {
    return Math.round(n * 10000) / 10000;
  }

  private toNumber(value: unknown): number {
    return value == null ? 0 : Number(value);
  }

  private emitChanged(handoverId: string, managerId: string) {
    this.realtime.emitToRoles([Role.MANAGER, Role.OWNER], 'handover.changed', {
      handoverId,
    });
    this.realtime.emitToUser(managerId, 'handover.changed', { handoverId });
  }
}
