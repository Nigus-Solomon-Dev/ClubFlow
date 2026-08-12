import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  Role,
  ShiftStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CloseStockHandoverDto } from './dto/close-stock-handover.dto';
import { GiveStockDto } from './dto/give-stock.dto';

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

type ProductSummary = Prisma.ProductGetPayload<{
  select: typeof productSelect;
}>;

const include = {
  manager: { select: { id: true, name: true } },
  barman: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  acceptedBy: { select: { id: true, name: true } },
  items: {
    orderBy: { product: { name: 'asc' } },
    include: { product: { select: productSelect } },
  },
} satisfies Prisma.StockHandoverInclude;

type HandoverWithItems = Prisma.StockHandoverGetPayload<{
  include: typeof include;
}>;

interface ProductLike {
  stockUnit: string;
  piecesPerCase: number | null;
}

@Injectable()
export class StockHandoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async open(userId: string) {
    const existing = await this.prisma.stockHandover.findFirst({
      where: { barmanId: userId, status: { not: 'CLOSED' } },
      include,
    });
    if (existing) {
      return this.serializeHandover(existing);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const h = await tx.stockHandover.create({
        data: { barmanId: userId },
      });
      await tx.stockHandoverEvent.create({
        data: { handoverId: h.id, actorId: userId, action: 'OPEN' },
      });
      await tx.activityLog.create({
        data: {
          userId,
          action: 'handover.open',
          entity: 'StockHandover',
          entityId: h.id,
        },
      });
      return h;
    });

    this.emitChanged(created.id, userId);
    return this.findOne(created.id);
  }

  async give(userId: string, dto: GiveStockDto) {
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!actor) {
      throw new ForbiddenException();
    }

    const barman = await this.prisma.user.findUnique({
      where: { id: dto.barmanId },
    });
    if (!barman || barman.role !== Role.BARMAN) {
      throw new BadRequestException('Selected employee is not a barman');
    }

    const handover = await this.prisma.stockHandover.findFirst({
      where: { barmanId: dto.barmanId, status: { not: 'CLOSED' } },
      include: {
        items: { select: { id: true, productId: true, givenQty: true } },
      },
    });
    if (!handover) {
      throw new BadRequestException(
        'This barman has not clocked in — ask them to open their stock first.',
      );
    }

    const merged = this.mergeItems(dto.items);
    const productIds = [...new Set(merged.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        stockUnit: true,
        piecesPerCase: true,
        sellingUnits: { select: { name: true, stockConsumption: true } },
      },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Some products do not exist');
    }
    const productNames = new Map(products.map((p) => [p.id, p.name]));
    const productById = new Map(products.map((p) => [p.id, p]));

    // A manager may only hand over stock the owner has given him, and never
    // more than his remaining balance.
    let managerStockId: string | null = null;
    if (actor.role === Role.MANAGER) {
      const openStock = await this.prisma.managerStockHandover.findFirst({
        where: { managerId: userId, status: { not: 'CLOSED' } },
        select: { id: true },
      });
      if (!openStock) {
        throw new BadRequestException(
          'You have no stock from the owner yet — ask the owner to hand over stock to you first.',
        );
      }
      managerStockId = openStock.id;
    }

    await this.prisma.$transaction(async (tx) => {
      if (managerStockId) {
        for (const item of merged) {
          const row = await tx.managerStockHandoverItem.findUnique({
            where: {
              handoverId_productId: {
                handoverId: managerStockId,
                productId: item.productId,
              },
            },
            select: { id: true, givenQty: true, givenAwayQty: true },
          });
          const name = productNames.get(item.productId) ?? 'this product';
          if (!row) {
            throw new BadRequestException(
              `You cannot hand over ${name} — the owner has not given it to you.`,
            );
          }
          const available = Number(row.givenQty) - Number(row.givenAwayQty);
          if (item.givenQty > available + 1e-9) {
            throw new BadRequestException(
              `You only have ${this.formatQty(productById.get(item.productId), available)} of ${name} to give.`,
            );
          }
          await tx.managerStockHandoverItem.update({
            where: { id: row.id },
            data: { givenAwayQty: { increment: item.givenQty } },
          });
        }
      }

      for (const item of merged) {
        const existing = handover.items.find(
          (i) => i.productId === item.productId,
        );
        if (existing) {
          await tx.stockHandoverItem.update({
            where: { id: existing.id },
            data: { givenQty: existing.givenQty.add(item.givenQty) },
          });
        } else {
          await tx.stockHandoverItem.create({
            data: {
              handoverId: handover.id,
              productId: item.productId,
              givenQty: item.givenQty,
            },
          });
        }

        const inventory = await tx.inventory.upsert({
          where: { productId: item.productId },
          create: {
            productId: item.productId,
            quantity: item.givenQty,
          },
          update: {
            quantity: { increment: item.givenQty },
          },
          select: { id: true, quantity: true },
        });
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            productId: item.productId,
            productName: productNames.get(item.productId) ?? '',
            change: item.givenQty,
            quantityAfter: Number(inventory.quantity),
            reason: 'handover.give',
            actorId: userId,
          },
        });
      }
      if (!handover.managerId) {
        await tx.stockHandover.update({
          where: { id: handover.id },
          data: { managerId: userId },
        });
      }
      await tx.stockHandoverEvent.create({
        data: {
          handoverId: handover.id,
          actorId: userId,
          action: 'GIVE',
          items: merged,
        },
      });
      await tx.activityLog.create({
        data: {
          userId,
          action: 'handover.give',
          entity: 'StockHandover',
          entityId: handover.id,
        },
      });
    });

    this.emitChanged(handover.id, dto.barmanId);
    this.realtime.emitToRoles(
      [Role.BARMAN, Role.MANAGER],
      'inventory.updated',
      {},
    );
    this.realtime.emitToRoles(
      [Role.MANAGER, Role.OWNER],
      'dashboard.updated',
      {},
    );
    return this.findOne(handover.id);
  }

  async close(userId: string, handoverId: string, dto: CloseStockHandoverDto) {
    const handover = await this.prisma.stockHandover.findUnique({
      where: { id: handoverId },
      include: {
        items: { select: { id: true, productId: true, givenQty: true } },
      },
    });
    if (!handover) {
      throw new NotFoundException('Stock handover not found');
    }
    if (handover.barmanId !== userId) {
      throw new ForbiddenException('You can only close your own stock');
    }
    if (handover.status === 'CLOSED') {
      throw new BadRequestException('This stock was already closed');
    }

    const counts = new Map(dto.items.map((i) => [i.productId, i.countedQty]));
    for (const item of handover.items) {
      if (!counts.has(item.productId)) {
        throw new BadRequestException(
          'Missing count for a product in this handover',
        );
      }
    }
    for (const productId of counts.keys()) {
      if (!handover.items.some((i) => i.productId === productId)) {
        throw new BadRequestException(
          'Count includes a product not in the handover',
        );
      }
    }

    const sold = await this.soldMap(userId, handover.openedAt, new Date());

    await this.prisma.$transaction(async (tx) => {
      for (const item of handover.items) {
        const countedQty = counts.get(item.productId)!;
        const soldQty = sold.get(item.productId) ?? 0;
        const consumed = Number(item.givenQty) - countedQty;
        const variance = this.round(
          Number(item.givenQty) - soldQty - countedQty,
        );
        await tx.stockHandoverItem.update({
          where: { id: item.id },
          data: {
            countedQty,
            consumedQty: consumed,
            variance,
          },
        });
      }
      await tx.stockHandover.update({
        where: { id: handover.id },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: userId },
      });
      await tx.stockHandoverEvent.create({
        data: {
          handoverId: handover.id,
          actorId: userId,
          action: 'CLOSE',
        },
      });
      await tx.activityLog.create({
        data: {
          userId,
          action: 'handover.close',
          entity: 'StockHandover',
          entityId: handover.id,
        },
      });
    });

    this.emitChanged(handover.id, userId);
    return this.findOne(handover.id);
  }

  /**
   * Closes the barman's open stock batch when they clock out, without a
   * physical count. The barman verifies on their own afterwards using the
   * Given / In hand figures.
   */
  async closeOpenForBarman(userId: string) {
    const handover = await this.prisma.stockHandover.findFirst({
      where: { barmanId: userId, status: { not: 'CLOSED' } },
      include: {
        items: { select: { id: true, productId: true, givenQty: true } },
      },
    });
    if (!handover) return null;

    const sold = await this.soldMap(userId, handover.openedAt, new Date());

    await this.prisma.$transaction(async (tx) => {
      for (const item of handover.items) {
        const soldQty = sold.get(item.productId) ?? 0;
        await tx.stockHandoverItem.update({
          where: { id: item.id },
          data: { consumedQty: Number(item.givenQty) - soldQty },
        });
      }
      await tx.stockHandover.update({
        where: { id: handover.id },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: userId },
      });
      await tx.stockHandoverEvent.create({
        data: {
          handoverId: handover.id,
          actorId: userId,
          action: 'CLOSE',
        },
      });
      await tx.activityLog.create({
        data: {
          userId,
          action: 'handover.close',
          entity: 'StockHandover',
          entityId: handover.id,
        },
      });
    });

    this.emitChanged(handover.id, userId);
    return this.findOne(handover.id);
  }

  /**
   * Manager accepts a closed stock batch after physically counting it.
   * Marks the batch as accepted and the barman's matching closed shift as
   * paid, so the Shifts screen flips from "Not given" to "Given" — the same
   * pattern the cashier uses for waiter money.
   */
  async accept(handoverId: string, actorId: string) {
    const handover = await this.prisma.stockHandover.findUnique({
      where: { id: handoverId },
      select: {
        id: true,
        barmanId: true,
        managerId: true,
        status: true,
        acceptedAt: true,
        openedAt: true,
        closedAt: true,
        items: {
          select: {
            id: true,
            productId: true,
            givenQty: true,
            countedQty: true,
          },
        },
      },
    });
    if (!handover) {
      throw new NotFoundException('Stock handover not found');
    }
    if (handover.status !== 'CLOSED') {
      throw new BadRequestException('Only closed stock can be accepted');
    }
    if (handover.acceptedAt) {
      throw new BadRequestException('This stock was already accepted');
    }

    let acceptedShiftId: string | null = null;

    // The barman usually closes by clocking out without a physical count, so
    // the accepted "returned" amount defaults to his in-hand balance
    // (given - sold) — the exact figure the manager verifies against.
    const sold = await this.soldMap(
      handover.barmanId,
      handover.openedAt,
      handover.closedAt ?? new Date(),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.stockHandover.update({
        where: { id: handover.id },
        data: { acceptedAt: new Date(), acceptedById: actorId },
      });
      await tx.stockHandoverEvent.create({
        data: {
          handoverId: handover.id,
          actorId,
          action: 'ACCEPT',
        },
      });
      await tx.activityLog.create({
        data: {
          userId: actorId,
          action: 'handover.accept',
          entity: 'StockHandover',
          entityId: handover.id,
        },
      });

      const shift = await tx.shift.findFirst({
        where: {
          userId: handover.barmanId,
          status: ShiftStatus.CLOSED,
          paidAt: null,
          endedAt: { gte: handover.openedAt },
        },
        orderBy: { endedAt: 'asc' },
      });
      if (shift) {
        acceptedShiftId = shift.id;
        await tx.shift.update({
          where: { id: shift.id },
          data: { paidAt: new Date(), paidById: actorId },
        });
        await tx.activityLog.create({
          data: {
            userId: actorId,
            action: 'shift.accept',
            entity: 'Shift',
            entityId: shift.id,
          },
        });
      }

      // The stock the barman physically returns (countedQty) must land back in
      // the manager's open balance, down to the last double/piece. Normally it
      // shrinks "given away" (what is still out with barmans); when the return
      // is larger, the surplus is added to the manager's given stock. A
      // product the manager never gave is still added — nothing physically
      // returned may be lost.
      if (handover.managerId) {
        const managerOpen = await tx.managerStockHandover.findFirst({
          where: { managerId: handover.managerId, status: { not: 'CLOSED' } },
          select: {
            id: true,
            items: {
              select: {
                id: true,
                productId: true,
                givenQty: true,
                givenAwayQty: true,
              },
            },
          },
        });
        if (managerOpen) {
          for (const it of handover.items) {
            const returned =
              it.countedQty != null
                ? Number(it.countedQty)
                : this.round(
                    Number(it.givenQty) - (sold.get(it.productId) ?? 0),
                  );
            if (returned <= 0) continue;
            const mItem = managerOpen.items.find(
              (i) => i.productId === it.productId,
            );
            if (mItem) {
              const away = Number(mItem.givenAwayQty);
              if (away >= returned) {
                await tx.managerStockHandoverItem.update({
                  where: { id: mItem.id },
                  data: {
                    givenAwayQty: new Prisma.Decimal(this.round(away - returned)),
                  },
                });
              } else {
                await tx.managerStockHandoverItem.update({
                  where: { id: mItem.id },
                  data: {
                    givenAwayQty: new Prisma.Decimal(0),
                    givenQty: new Prisma.Decimal(
                      this.round(Number(mItem.givenQty) + (returned - away)),
                    ),
                  },
                });
              }
            } else {
              await tx.managerStockHandoverItem.create({
                data: {
                  handoverId: managerOpen.id,
                  productId: it.productId,
                  givenQty: new Prisma.Decimal(this.round(returned)),
                  givenAwayQty: new Prisma.Decimal(0),
                },
              });
            }
          }
        }
      }
    });

    this.emitChanged(handover.id, handover.barmanId);
    this.realtime.emitToRoles(
      [Role.WAITER, Role.CASHIER, Role.MANAGER, Role.OWNER],
      'shift.accepted',
      {
        shiftId: acceptedShiftId,
        userId: handover.barmanId,
        handoverId,
      },
    );
    this.realtime.emitToUser(handover.barmanId, 'shift.accepted', {
      handoverId,
    });
    return this.findOne(handover.id);
  }

  async list() {
    const rows = await this.prisma.stockHandover.findMany({
      include,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.serializeHandover(r)));
  }

  async mine(userId: string) {
    const rows = await this.prisma.stockHandover.findMany({
      where: { barmanId: userId },
      include,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.serializeHandover(r)));
  }

  async active() {
    const rows = await this.prisma.stockHandover.findMany({
      where: { status: { not: 'CLOSED' } },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((r) => this.serializeHandover(r)));
  }

  async alerts() {
    const open = await this.prisma.stockHandover.findMany({
      where: { status: { not: 'CLOSED' } },
      include: {
        barman: { select: { id: true, name: true } },
        items: { include: { product: { select: productSelect } } },
      },
    });

    const result: Array<{
      handoverId: string;
      barman: { id: string; name: string };
      product: ProductSummary;
      given: number;
      sold: number;
      left: number;
      threshold: number;
      level: 'warn' | 'empty';
    }> = [];

    for (const h of open) {
      const sold = await this.soldMap(h.barmanId, h.openedAt, new Date());
      for (const it of h.items) {
        const left = this.round(
          Number(it.givenQty) - (sold.get(it.productId) ?? 0),
        );
        const threshold = this.thresholdFor(it.product);
        const level: 'warn' | 'empty' | null =
          left <= 0 ? 'empty' : left < threshold ? 'warn' : null;
        if (level) {
          result.push({
            handoverId: h.id,
            barman: h.barman,
            product: it.product,
            given: Number(it.givenQty),
            sold: sold.get(it.productId) ?? 0,
            left,
            threshold,
            level,
          });
        }
      }
    }

    return result.sort((a, b) => {
      if (a.level !== b.level) return a.level === 'empty' ? -1 : 1;
      return a.product.name.localeCompare(b.product.name);
    });
  }

  private async soldMap(
    barmanId: string,
    start: Date,
    end: Date,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.orderItem.findMany({
      where: {
        order: {
          status: OrderStatus.COMPLETED,
          completedById: barmanId,
          completedAt: { gte: start, lt: end },
        },
      },
      select: { productId: true, quantity: true, stockConsumption: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      if (!r.productId) continue;
      map.set(
        r.productId,
        (map.get(r.productId) ?? 0) +
          r.quantity * Number(r.stockConsumption || 1),
      );
    }
    return map;
  }

  private thresholdFor(product: ProductLike): number {
    // Warn when less than one full giving unit is left:
    // alcohol -> less than a bottle, beer/soft -> less than one case.
    if (product.stockUnit === 'Piece') {
      return product.piecesPerCase ?? 24;
    }
    return 1;
  }

  private async serializeHandover(handover: HandoverWithItems) {
    const end =
      handover.status === 'CLOSED'
        ? (handover.closedAt ?? new Date())
        : new Date();
    const sold = await this.soldMap(handover.barmanId, handover.openedAt, end);

    return {
      ...handover,
      items: handover.items.map((it) => {
        const soldQty = sold.get(it.productId) ?? 0;
        const left = this.round(Number(it.givenQty) - soldQty);
        const threshold = this.thresholdFor(it.product);
        return {
          ...it,
          givenQty: Number(it.givenQty),
          countedQty: it.countedQty == null ? null : Number(it.countedQty),
          consumedQty: it.consumedQty == null ? null : Number(it.consumedQty),
          variance: it.variance == null ? null : Number(it.variance),
          soldQty: this.round(soldQty),
          left,
          threshold,
          level: left <= 0 ? 'empty' : left < threshold ? 'warn' : 'ok',
        };
      }),
    };
  }

  private async findOne(id: string) {
    const row = await this.prisma.stockHandover.findUnique({
      where: { id },
      include,
    });
    if (!row) {
      throw new NotFoundException('Stock handover not found');
    }
    return this.serializeHandover(row);
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

  private formatQty(
    product:
      | {
          stockUnit: string;
          piecesPerCase: number | null;
          sellingUnits?: Array<{
            name: string;
            stockConsumption: number | Prisma.Decimal | null;
          }>;
        }
      | undefined,
    qty: number,
  ): string {
    if (!product) return `${this.round(qty)}`;
    const perCase = product.piecesPerCase ?? 24;
    if (product.stockUnit === 'Piece') {
      const kasa = Math.floor(qty / perCase);
      const pieces = this.round(qty - kasa * perCase);
      const parts: string[] = [];
      if (kasa > 0) parts.push(`${kasa} kasa${kasa > 1 ? 's' : ''}`);
      if (pieces > 0) parts.push(`${pieces} pieces`);
      return parts.length > 0 ? parts.join(' ') : '0';
    }
    const sub = (product.sellingUnits ?? [])
      .filter((u) => {
        const c = Number(u.stockConsumption);
        return c > 0 && c < 1;
      })
      .sort(
        (a, b) => Number(a.stockConsumption) - Number(b.stockConsumption),
      )[0];
    const bottles = Math.floor(qty);
    const remainder = this.round(qty - bottles);
    const parts: string[] = [];
    if (bottles > 0) parts.push(`${bottles} bottle${bottles > 1 ? 's' : ''}`);
    if (sub && remainder > 0.0001) {
      const subCount = Math.round(remainder / Number(sub.stockConsumption));
      if (subCount > 0) parts.push(`${subCount} ${this.plural(sub.name)}`);
    }
    return parts.length > 0 ? parts.join(' ') : '0';
  }

  private plural(name: string): string {
    const n = name.toLowerCase();
    if (n === 'half') return 'halves';
    if (n.endsWith('s')) return n;
    return `${n}s`;
  }

  private round(n: number): number {
    return Math.round(n * 10000) / 10000;
  }

  private emitChanged(handoverId: string, barmanId: string) {
    this.realtime.emitToRoles([Role.MANAGER, Role.OWNER], 'handover.changed', {
      handoverId,
    });
    this.realtime.emitToUser(barmanId, 'handover.changed', { handoverId });
  }
}
