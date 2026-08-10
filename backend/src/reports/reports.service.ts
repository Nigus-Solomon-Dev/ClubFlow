import { Injectable } from '@nestjs/common';
import {
  CancellationStatus,
  OrderStatus,
  Role,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface DateRange {
  gte: Date;
  lte: Date;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveRange(from?: string, to?: string): DateRange {
    const end = to ? new Date(to) : new Date();
    if (from) {
      return { gte: new Date(from), lte: end };
    }
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    return { gte: start, lte: end };
  }

  private completedOrderFilter(range: DateRange) {
    return {
      status: OrderStatus.COMPLETED,
      completedAt: { gte: range.gte, lte: range.lte },
    };
  }

  async sales(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const agg = await this.prisma.order.aggregate({
      where: this.completedOrderFilter(range),
      _count: { _all: true },
      _sum: { totalPrice: true },
    });
    const items = await this.prisma.orderItem.count({
      where: {
        order: {
          is: {
            status: OrderStatus.COMPLETED,
            completedAt: { gte: range.gte, lte: range.lte },
          },
        },
      },
    });
    const orders = agg._count._all ?? 0;
    const revenue = agg._sum.totalPrice ?? 0;
    return {
      orders,
      revenue,
      items,
      averageOrderValue: orders ? Number(revenue) / orders : 0,
    };
  }

  async salesByCategory(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          is: {
            status: OrderStatus.COMPLETED,
            completedAt: { gte: range.gte, lte: range.lte },
          },
        },
      },
      include: {
        product: { select: { category: { select: { name: true } } } },
      },
    });

    const map = new Map<
      string,
      { category: string; revenue: number; items: number }
    >();
    for (const item of items) {
      const name = item.product?.category?.name ?? 'Uncategorized';
      const entry = map.get(name) ?? { category: name, revenue: 0, items: 0 };
      entry.revenue += Number(item.subtotal);
      entry.items += item.quantity;
      map.set(name, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }

  async topProducts(from?: string, to?: string, limit = 10) {
    const range = this.resolveRange(from, to);
    return this.prisma.orderItem.groupBy({
      by: ['productName'],
      where: {
        order: {
          is: {
            status: OrderStatus.COMPLETED,
            completedAt: { gte: range.gte, lte: range.lte },
          },
        },
      },
      _sum: { subtotal: true, quantity: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: limit,
    });
  }

  async daily(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const orders = await this.prisma.order.findMany({
      where: this.completedOrderFilter(range),
      select: { completedAt: true, totalPrice: true },
      orderBy: { completedAt: 'asc' },
    });

    const byDay = new Map<
      string,
      { date: string; revenue: number; orders: number }
    >();
    for (const order of orders) {
      if (!order.completedAt) continue;
      const date = order.completedAt.toISOString().slice(0, 10);
      const entry = byDay.get(date) ?? { date, revenue: 0, orders: 0 };
      entry.revenue += Number(order.totalPrice);
      entry.orders += 1;
      byDay.set(date, entry);
    }
    return Array.from(byDay.values());
  }

  async monthly(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const orders = await this.prisma.order.findMany({
      where: this.completedOrderFilter(range),
      select: { completedAt: true, totalPrice: true },
      orderBy: { completedAt: 'asc' },
    });

    const byMonth = new Map<
      string,
      { month: string; revenue: number; orders: number }
    >();
    for (const order of orders) {
      if (!order.completedAt) continue;
      const month = order.completedAt.toISOString().slice(0, 7);
      const entry = byMonth.get(month) ?? { month, revenue: 0, orders: 0 };
      entry.revenue += Number(order.totalPrice);
      entry.orders += 1;
      byMonth.set(month, entry);
    }
    return Array.from(byMonth.values());
  }

  async weekly(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const orders = await this.prisma.order.findMany({
      where: this.completedOrderFilter(range),
      select: { completedAt: true, totalPrice: true },
      orderBy: { completedAt: 'asc' },
    });

    const byWeek = new Map<
      string,
      { start: string; revenue: number; orders: number }
    >();
    for (const order of orders) {
      if (!order.completedAt) continue;
      const start = this.weekStartKey(order.completedAt);
      const entry = byWeek.get(start) ?? { start, revenue: 0, orders: 0 };
      entry.revenue += Number(order.totalPrice);
      entry.orders += 1;
      byWeek.set(start, entry);
    }
    return Array.from(byWeek.values());
  }

  private weekStartKey(date: Date): string {
    const d = new Date(date);
    const day = d.getDay(); // 0 = Sunday
    const diff = day === 0 ? 6 : day - 1; // back to Monday
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  }

  async lowSelling(from?: string, to?: string, limit = 10) {
    const range = this.resolveRange(from, to);
    return this.prisma.orderItem.groupBy({
      by: ['productName'],
      where: {
        order: {
          is: {
            status: OrderStatus.COMPLETED,
            completedAt: { gte: range.gte, lte: range.lte },
          },
        },
      },
      _sum: { subtotal: true, quantity: true },
      orderBy: { _sum: { subtotal: 'asc' } },
      take: limit,
    });
  }

  async inventoryUsage(from?: string, to?: string, limit = 20) {
    const range = this.resolveRange(from, to);
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        reason: 'order.complete',
        createdAt: { gte: range.gte, lte: range.lte },
      },
      select: { productName: true, change: true },
    });
    const byProduct = new Map<string, number>();
    for (const m of movements) {
      const used = Math.abs(Number(m.change));
      byProduct.set(m.productName, (byProduct.get(m.productName) ?? 0) + used);
    }
    return Array.from(byProduct.entries())
      .map(([productName, consumed]) => ({ productName, consumed }))
      .sort((a, b) => b.consumed - a.consumed)
      .slice(0, limit);
  }

  async cancellationReport(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const requests = await this.prisma.cancellationRequest.findMany({
      where: { createdAt: { gte: range.gte, lte: range.lte } },
      select: {
        status: true,
        order: { select: { totalPrice: true, status: true } },
      },
    });
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let lostRevenue = 0;
    for (const r of requests) {
      if (r.status === CancellationStatus.PENDING) pending += 1;
      else if (r.status === CancellationStatus.APPROVED) {
        approved += 1;
        lostRevenue += Number(r.order.totalPrice);
      } else rejected += 1;
    }
    return {
      totalRequests: requests.length,
      pending,
      approved,
      rejected,
      approvedValue: lostRevenue,
    };
  }

  async activity(limit = 100) {
    return this.prisma.activityLog.findMany({
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async employees(from?: string, to?: string) {
    const range = this.resolveRange(from, to);

    const [completed, activeOrders, staff] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          status: OrderStatus.COMPLETED,
          completedAt: { gte: range.gte, lte: range.lte },
        },
        select: {
          waiterId: true,
          totalPrice: true,
          items: { select: { quantity: true } },
        },
      }),
      this.prisma.order.findMany({
        where: {
          status: { not: OrderStatus.DRAFT },
          createdAt: { gte: range.gte, lte: range.lte },
        },
        select: { waiterId: true, status: true },
      }),
      this.prisma.user.findMany({
        where: { role: { in: [Role.WAITER, Role.BARMAN] }, isActive: true },
        select: { id: true, name: true, role: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const revenue = new Map<string, number>();
    const items = new Map<string, number>();
    for (const order of completed) {
      const rev = revenue.get(order.waiterId) ?? 0;
      revenue.set(order.waiterId, rev + Number(order.totalPrice));
      const qty = items.get(order.waiterId) ?? 0;
      items.set(
        order.waiterId,
        qty +
          order.items.reduce((acc, it) => acc + it.quantity, 0),
      );
    }

    const orders = new Map<string, number>();
    const cancelled = new Map<string, number>();
    for (const order of activeOrders) {
      orders.set(order.waiterId, (orders.get(order.waiterId) ?? 0) + 1);
      if (order.status === OrderStatus.CANCELLED) {
        cancelled.set(order.waiterId, (cancelled.get(order.waiterId) ?? 0) + 1);
      }
    }

    return staff
      .map((s) => ({
        userId: s.id,
        name: s.name,
        role: s.role,
        orders: orders.get(s.id) ?? 0,
        items: items.get(s.id) ?? 0,
        revenue: revenue.get(s.id) ?? 0,
        cancelled: cancelled.get(s.id) ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }
}
