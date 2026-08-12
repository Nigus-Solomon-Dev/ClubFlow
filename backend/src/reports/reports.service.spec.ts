import { ReportsService } from './reports.service';

function buildPrisma() {
  return {
    order: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    orderItem: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    inventoryMovement: { findMany: jest.fn() },
    cancellationRequest: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  };
}

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new ReportsService(prisma as never);
  });

  it('sales aggregates orders, revenue and average value', async () => {
    prisma.order.aggregate.mockResolvedValue({
      _count: { _all: 5 },
      _sum: { totalPrice: 1000 },
    });
    prisma.orderItem.count.mockResolvedValue(12);

    const result = await service.sales();

    expect(prisma.order.aggregate).toHaveBeenCalled();
    expect(result.orders).toBe(5);
    expect(result.revenue).toBe(1000);
    expect(result.items).toBe(12);
    expect(result.averageOrderValue).toBe(200);
  });

  it('groups monthly sales by YYYY-MM', async () => {
    prisma.order.findMany.mockResolvedValue([
      { completedAt: new Date('2024-01-05T10:00:00Z'), totalPrice: 100 },
      { completedAt: new Date('2024-01-20T10:00:00Z'), totalPrice: 50 },
      { completedAt: new Date('2024-02-02T10:00:00Z'), totalPrice: 25 },
    ]);

    const result = await service.monthly();
    expect(result).toEqual([
      { month: '2024-01', revenue: 150, orders: 2 },
      { month: '2024-02', revenue: 25, orders: 1 },
    ]);
  });

  it('groups weekly sales starting on Monday', async () => {
    prisma.order.findMany.mockResolvedValue([
      { completedAt: new Date('2024-08-06T10:00:00Z'), totalPrice: 80 },
      { completedAt: new Date('2024-08-08T10:00:00Z'), totalPrice: 20 },
    ]);

    const result = await service.weekly();
    expect(result.length).toBe(1);
    expect(result[0].start).toBe('2024-08-05');
    expect(result[0].orders).toBe(2);
    expect(result[0].revenue).toBe(100);
  });

  it('returns cancellation totals and approved value', async () => {
    prisma.cancellationRequest.findMany.mockResolvedValue([
      { status: 'APPROVED', order: { totalPrice: 300 } },
      { status: 'APPROVED', order: { totalPrice: 120 } },
      { status: 'REJECTED', order: { totalPrice: 999 } },
      { status: 'PENDING', order: { totalPrice: 10 } },
    ]);

    const result = await service.cancellationReport();
    expect(result).toMatchObject({
      totalRequests: 4,
      pending: 1,
      approved: 2,
      rejected: 1,
      approvedValue: 420,
    });
  });

  it('keeps low-selling products separate from top products', async () => {
    prisma.orderItem.groupBy.mockResolvedValue([
      { productName: 'A', _sum: { subtotal: 5, quantity: 1 } },
    ]);

    // lowSelling uses the same groupBy mock.
    const low = await service.lowSelling();
    expect(low.length).toBe(1);
    expect(low[0]).toEqual({
      productName: 'A',
      _sum: { subtotal: 5, quantity: 1 },
    });
    expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { _sum: { subtotal: 'asc' } } }),
    );
  });

  it('sums consumed inventory from order.complete movements', async () => {
    prisma.inventoryMovement.findMany.mockResolvedValue([
      { productName: 'beer', change: -3 },
      { productName: 'beer', change: -2 },
      { productName: 'wine', change: -1 },
    ]);

    const usage = await service.inventoryUsage();
    expect(usage).toEqual([
      { productName: 'beer', consumed: 5 },
      { productName: 'wine', consumed: 1 },
    ]);
  });
});
