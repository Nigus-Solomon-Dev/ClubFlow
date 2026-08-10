import { Injectable } from '@nestjs/common';
import { OrderStatus } from '../../generated/prisma/client';
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
      productCount,
      categoryCount,
      tableCount,
      activeTableCount,
      openShiftCount,
      lowStock,
      pendingCount,
      userCount,
    ] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.order.aggregate({
        where: {
          status: OrderStatus.COMPLETED,
          completedAt: { gte: startOfToday },
        },
        _sum: { totalPrice: true },
      }),
      this.prisma.product.count(),
      this.prisma.category.count(),
      this.prisma.restaurantTable.count(),
      this.prisma.restaurantTable.count({ where: { isActive: true } }),
      this.prisma.shift.count({
        where: { status: 'OPEN' as never },
      }),
      this.prisma.inventory.count({ where: { quantity: { lt: 5 } } }),
      this.prisma.order.count({
        where: {
          status: { in: [OrderStatus.DRAFT, OrderStatus.SENT] },
        },
      }),
      this.prisma.user.count(),
    ]);

    return {
      today: {
        orders: todayOrderCount,
        revenue: todaySales._sum?.totalPrice ?? null,
      },
      totals: {
        products: productCount,
        categories: categoryCount,
        tables: tableCount,
        activeTables: activeTableCount,
        employees: userCount,
        openShifts: openShiftCount,
        lowStockItems: lowStock,
        pendingOrders: pendingCount,
      },
    };
  }
}
