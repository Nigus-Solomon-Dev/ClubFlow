import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ManagerService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const [
      todayOrderCount,
      todaySales,
      categoryCount,
      tableCount,
      activeTableCount,
      openShiftCount,
      pendingCount,
      userCount,
      managerStockSummary,
    ] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.order.aggregate({
        where: {
          status: OrderStatus.COMPLETED,
          completedAt: { gte: startOfToday },
        },
        _sum: { totalPrice: true },
      }),
      this.prisma.category.count(),
      this.prisma.restaurantTable.count(),
      this.prisma.restaurantTable.count({ where: { isActive: true } }),
      this.prisma.shift.count({
        where: { status: 'OPEN' as never },
      }),
      this.prisma.order.count({
        where: {
          status: { in: [OrderStatus.DRAFT, OrderStatus.SENT] },
        },
      }),
      this.prisma.user.count(),
      this.getManagerStockSummary(),
    ]);

    return {
      today: {
        orders: todayOrderCount,
        revenue: todaySales._sum?.totalPrice ?? null,
      },
      totals: {
        products: managerStockSummary.productCount,
        categories: categoryCount,
        tables: tableCount,
        activeTables: activeTableCount,
        employees: userCount,
        openShifts: openShiftCount,
        lowStockItems: managerStockSummary.lowStockCount,
        pendingOrders: pendingCount,
      },
    };
  }

  private async getManagerStockSummary() {
    const openHandovers = await this.prisma.managerStockHandover.findMany({
      where: { status: { not: 'CLOSED' } },
      include: {
        items: {
          select: {
            productId: true,
            givenQty: true,
            givenAwayQty: true,
            product: { select: { id: true, stockUnit: true, piecesPerCase: true } },
          },
        },
      },
    });

    let productCount = 0;
    let lowStockCount = 0;

    for (const h of openHandovers) {
      for (const item of h.items) {
        const left = Number(item.givenQty) - Number(item.givenAwayQty);
        if (left > 0) {
          // Count distinct products with positive balance
          productCount++;
          // Low stock threshold: < 5 stock units (or < 5 pieces for Piece-type)
          if (left < 5) {
            lowStockCount++;
          }
        }
      }
    }

    return { productCount, lowStockCount };
  }
}
