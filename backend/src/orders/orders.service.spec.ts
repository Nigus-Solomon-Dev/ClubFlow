import { OrdersService } from './orders.service';

function buildTx() {
  return {
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    orderItem: { findMany: jest.fn() },
    inventory: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    inventoryMovement: { create: jest.fn() },
    activityLog: { create: jest.fn() },
  };
}

function buildPrisma() {
  const tx = buildTx();
  const prisma = {
    order: { findUnique: jest.fn() },
    orderItem: { findMany: jest.fn(), aggregate: jest.fn(), update: jest.fn(), delete: jest.fn() },
    inventory: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    inventoryMovement: { create: jest.fn() },
    activityLog: { create: jest.fn() },
    restaurantTable: { findUnique: jest.fn() },
    product: { findUnique: jest.fn() },
    cancellationRequest: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((cb) => cb(tx)),
  };
  return { tx, prisma };
}

describe('OrdersService.complete', () => {
  let service: OrdersService;
  let tx: ReturnType<typeof buildTx>;
  let prisma: ReturnType<typeof buildPrisma>['prisma'];
  let realtime: { emitToRoles: jest.Mock };

  beforeEach(() => {
    const built = buildPrisma();
    tx = built.tx;
    prisma = built.prisma;
    realtime = { emitToRoles: jest.fn() };
    service = new OrdersService(prisma as never, realtime as never);
  });

  it('atomically claims the SENT -> COMPLETED transition', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'SENT' });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.orderItem.findMany.mockResolvedValue([]);
    tx.order.findUnique.mockResolvedValue({ id: 'o1', orderNumber: 1, totalPrice: 0 });

    await service.complete('o1', 'u1');

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1', status: 'SENT' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(realtime.emitToRoles).toHaveBeenCalled();
  });

  it('rejects completing a non-SENT order', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'DRAFT' });
    await expect(service.complete('o1', 'u1')).rejects.toThrow(/Only a SENT order/);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('returns a conflict when another completion already claimed the order', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'SENT' });
    // The atomically guarded claim finds the order already moved on.
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.complete('o1', 'u1')).rejects.toThrow(/already completed/);
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it('decrements inventory atomically and records a movement on completion', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'SENT' });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.orderItem.findMany.mockResolvedValue([
      { productId: 'p1', productName: 'beer', quantity: 2 },
      { productId: 'p2', productName: 'water', quantity: 1 },
    ]);
    // Call order: p1 pre-check, p1 post-decrement read, then p2 (no inventory).
    tx.inventory.findUnique
      .mockResolvedValueOnce({ id: 'inv1', productId: 'p1', quantity: 10 })
      .mockResolvedValueOnce({ id: 'inv1', quantity: 8 })
      .mockResolvedValueOnce(null);
    tx.inventory.updateMany.mockResolvedValue({ count: 1 });
    tx.inventoryMovement.create.mockResolvedValue({});
    tx.order.findUnique.mockResolvedValue({ id: 'o1', orderNumber: 9 });

    await service.complete('o1', 'u1');

    expect(tx.inventory.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv1', quantity: { gte: 2 } },
      data: { quantity: { decrement: 2 } },
    });
    const calls = tx.inventoryMovement.create.mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0].data).toMatchObject({
      inventoryId: 'inv1',
      change: -2,
      quantityAfter: 8,
      reason: 'order.complete',
      orderId: 'o1',
      actorId: 'u1',
    });
  });

  it('rejects completion and does not record a movement when stock is insufficient', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'SENT' });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.orderItem.findMany.mockResolvedValue([
      { productId: 'p1', productName: 'beer', quantity: 5 },
    ]);
    // Only 3 in stock, and #not applied by the guarded update.
    tx.inventory.findUnique
      .mockResolvedValueOnce({ id: 'inv1', productId: 'p1', quantity: 3 });
    tx.inventory.updateMany.mockResolvedValue({ count: 0 });
    tx.activityLog.create.mockResolvedValue({});

    await expect(service.complete('o1', 'u1')).rejects.toThrow(/Insufficient stock/);
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });
});