import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CountStockHandoverDto } from './dto/count-stock-handover.dto';
import { CreateStockHandoverDto } from './dto/create-stock-handover.dto';

const include = {
  manager: { select: { id: true, name: true } },
  barman: { select: { id: true, name: true } },
  countedBy: { select: { id: true, name: true } },
  items: {
    orderBy: { product: { name: 'asc' } },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          stockUnit: true,
          piecesPerCase: true,
          category: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.StockHandoverInclude;

@Injectable()
export class StockHandoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(userId: string, dto: CreateStockHandoverDto) {
    const date = dto.date ?? this.dayKey(new Date());

    const barman = await this.prisma.user.findUnique({
      where: { id: dto.barmanId },
    });
    if (!barman || barman.role !== Role.BARMAN) {
      throw new BadRequestException('Selected employee is not a barman');
    }

    const existing = await this.prisma.stockHandover.findUnique({
      where: { date_barmanId: { date, barmanId: dto.barmanId } },
    });
    if (existing && existing.status === 'COUNTED') {
      throw new BadRequestException(
        'This handover was already counted and cannot be edited',
      );
    }

    const merged = this.mergeItems(dto.items);
    const productIds = [...new Set(merged.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Some products do not exist');
    }

    const handover = await this.prisma.$transaction(async (tx) => {
      const h =
        existing ??
        (await tx.stockHandover.create({
          data: { date, managerId: userId, barmanId: dto.barmanId },
        }));
      if (existing) {
        await tx.stockHandover.update({
          where: { id: existing.id },
          data: { managerId: userId },
        });
      }
      await tx.stockHandoverItem.deleteMany({
        where: { handoverId: h.id },
      });
      await tx.stockHandoverItem.createMany({
        data: merged.map((i) => ({
          handoverId: h.id,
          productId: i.productId,
          givenQty: i.givenQty,
        })),
      });
      return h;
    });

    await this.logActivity(userId, 'handover.give', handover.id);
    this.realtime.emitToRoles(
      [Role.MANAGER, Role.CASHIER, Role.OWNER],
      'handover.changed',
      { handoverId: handover.id, date, barmanId: dto.barmanId },
    );
    this.realtime.emitToUser(dto.barmanId, 'handover.changed', {
      handoverId: handover.id,
      date,
    });

    return this.findOne(handover.id);
  }

  async list() {
    const rows = await this.prisma.stockHandover.findMany({
      include,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.serialize(r));
  }

  async mine(userId: string) {
    const rows = await this.prisma.stockHandover.findMany({
      where: { barmanId: userId },
      include,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.serialize(r));
  }

  async active() {
    const rows = await this.prisma.stockHandover.findMany({
      where: { status: 'ACTIVE' },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.serialize(r));
  }

  async count(id: string, actorId: string, dto: CountStockHandoverDto) {    const handover = await this.prisma.stockHandover.findUnique({
      where: { id },
      include: { items: { select: { id: true, productId: true, givenQty: true } } },
    });
    if (!handover) {
      throw new NotFoundException('Stock handover not found');
    }
    if (handover.status === 'COUNTED') {
      throw new BadRequestException('This handover was already counted');
    }

    const counts = new Map(
      dto.items.map((i) => [i.productId, i.countedQty]),
    );
    for (const item of handover.items) {
      if (!counts.has(item.productId)) {
        throw new BadRequestException(
          `Missing count for a product in this handover`,
        );
      }
    }
    for (const productId of counts.keys()) {
      if (!handover.items.some((i) => i.productId === productId)) {
        throw new BadRequestException('Count includes a product not in the handover');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of handover.items) {
        const countedQty = counts.get(item.productId)!;
        await tx.stockHandoverItem.update({
          where: { id: item.id },
          data: {
            countedQty,
            consumedQty: item.givenQty.minus(countedQty),
          },
        });
      }
      await tx.stockHandover.update({
        where: { id },
        data: {
          status: 'COUNTED',
          countedAt: new Date(),
          countedById: actorId,
        },
      });
    });

    await this.logActivity(actorId, 'handover.count', id);
    this.realtime.emitToRoles(
      [Role.MANAGER, Role.CASHIER, Role.OWNER, Role.BARMAN],
      'handover.changed',
      { handoverId: id },
    );

    return this.findOne(id);
  }

  async reconciliation(date?: string) {
    const key = date ?? this.dayKey(new Date());
    const start = new Date(`${key}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const handovers = await this.prisma.stockHandover.findMany({
      where: { date: key },
      include: {
        barman: { select: { id: true, name: true } },
        items: {
          select: {
            productId: true,
            givenQty: true,
            countedQty: true,
            consumedQty: true,
          },
        },
      },
    });

    const givenMap = new Map<string, number>();
    const countedMap = new Map<string, number>();
    let allCounted = true;
    for (const h of handovers) {
      if (h.status !== 'COUNTED') allCounted = false;
      for (const it of h.items) {
        givenMap.set(it.productId, (givenMap.get(it.productId) ?? 0) + Number(it.givenQty));
        if (it.countedQty != null) {
          countedMap.set(it.productId, (countedMap.get(it.productId) ?? 0) + Number(it.countedQty));
        }
      }
    }

    const soldRows = await this.prisma.orderItem.findMany({
      where: {
        order: {
          status: OrderStatus.COMPLETED,
          completedAt: { gte: start, lt: end },
        },
      },
      select: { productId: true, quantity: true, stockConsumption: true },
    });
    const soldMap = new Map<string, number>();
    for (const it of soldRows) {
      if (!it.productId) continue;
      soldMap.set(it.productId, (soldMap.get(it.productId) ?? 0) + it.quantity * Number(it.stockConsumption));
    }

    const productIds = new Set([
      ...givenMap.keys(),
      ...countedMap.keys(),
      ...soldMap.keys(),
    ]);
    const products = await this.prisma.product.findMany({
      where: { id: { in: [...productIds] } },
      select: {
        id: true,
        name: true,
        stockUnit: true,
        piecesPerCase: true,
        category: { select: { name: true } },
      },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const rows = [...productIds]
      .map((id) => {
        const given = givenMap.get(id) ?? 0;
        const sold = soldMap.get(id) ?? 0;
        const counted = countedMap.has(id) ? (countedMap.get(id) as number) : null;
        const expectedRemaining = this.round(given - sold);
        const variance =
          counted == null ? null : this.round(expectedRemaining - counted);
        return {
          product:
            productById.get(id) ?? {
              id,
              name: 'Unknown',
              stockUnit: '',
              piecesPerCase: null,
              category: null,
            },
          given: this.round(given),
          sold: this.round(sold),
          expectedRemaining,
          counted: counted == null ? null : this.round(counted),
          variance,
        };
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));

    const summary = {
      given: this.round([...givenMap.values()].reduce((s, x) => s + x, 0)),
      sold: this.round([...soldMap.values()].reduce((s, x) => s + x, 0)),
      counted: countedMap.size
        ? this.round([...countedMap.values()].reduce((s, x) => s + x, 0))
        : null,
      allCounted,
    };

    return { date: key, handovers: handovers.length, rows, summary };
  }

  private round(n: number): number {
    return Math.round(n * 10000) / 10000;
  }

  private async findOne(id: string) {
    const row = await this.prisma.stockHandover.findUnique({
      where: { id },
      include,
    });
    return this.serialize(row!);
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

  private serialize<T extends { items: Array<{ givenQty: unknown; countedQty: unknown; consumedQty: unknown }> }>(
    handover: T,
  ) {
    return {
      ...handover,
      items: handover.items.map((i) => ({
        ...i,
        givenQty: Number(i.givenQty),
        countedQty: i.countedQty == null ? null : Number(i.countedQty),
        consumedQty: i.consumedQty == null ? null : Number(i.consumedQty),
      })),
    };
  }

  private async logActivity(userId: string, action: string, handoverId: string) {
    await this.prisma.activityLog.create({
      data: { userId, action, entity: 'StockHandover', entityId: handoverId },
    });
  }

  private dayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
