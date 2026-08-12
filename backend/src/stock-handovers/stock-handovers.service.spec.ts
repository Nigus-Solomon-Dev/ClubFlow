import { StockHandoversService } from './stock-handovers.service';

describe('StockHandoversService give with manager balance constraint', () => {
  let service: StockHandoversService;
  let prisma: {
    user: { findUnique: jest.Mock };
    stockHandover: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    product: { findMany: jest.Mock };
    managerStockHandover: { findFirst: jest.Mock };
    orderItem: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let realtime: {
    emitToRoles: jest.Mock;
    emitToUser: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      stockHandover: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      product: { findMany: jest.fn() },
      managerStockHandover: { findFirst: jest.fn() },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    realtime = {
      emitToRoles: jest.fn(),
      emitToUser: jest.fn(),
    };
    service = new StockHandoversService(prisma as never, realtime as never);
  });

  function txLike() {
    return {
      stockHandoverItem: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      inventory: {
        upsert: jest.fn().mockResolvedValue({ id: 'inv1', quantity: 5 }),
      },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
      stockHandover: { update: jest.fn().mockResolvedValue({}) },
      stockHandoverEvent: { create: jest.fn().mockResolvedValue({}) },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
      managerStockHandoverItem: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
  }

  const gold = {
    id: 'p1',
    name: 'Gold',
    stockUnit: 'Bottle',
    piecesPerCase: null,
    sellingUnits: [{ name: 'Double', stockConsumption: 0.1 }],
  };
  const coca = {
    id: 'p2',
    name: 'Coca Cola',
    stockUnit: 'Piece',
    piecesPerCase: 24,
    sellingUnits: [],
  };

  function baseMocks(actorRole: string, items: Record<string, unknown>[]) {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'u', role: actorRole }) // actor
      .mockResolvedValueOnce({ id: 'b1', role: 'BARMAN' }); // barman
    prisma.stockHandover.findFirst.mockResolvedValue({
      id: 'st1',
      managerId: null,
      items: [],
    });
    prisma.product.findMany.mockResolvedValue(items);
  }

  it('blocks a manager with no owner-given stock from giving anything', async () => {
    baseMocks('MANAGER', [gold]);
    prisma.managerStockHandover.findFirst.mockResolvedValue(null);

    await expect(
      service.give('m1', { barmanId: 'b1', items: [{ productId: 'p1', givenQty: 5 }] }),
    ).rejects.toThrow(/no stock from the owner yet/i);
  });

  it('blocks a manager from giving a product the owner never handed over', async () => {
    baseMocks('MANAGER', [coca]);
    prisma.managerStockHandover.findFirst.mockResolvedValue({ id: 'ms1' });
    const tx = txLike();
    tx.managerStockHandoverItem.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    );

    await expect(
      service.give('m1', { barmanId: 'b1', items: [{ productId: 'p2', givenQty: 24 }] }),
    ).rejects.toThrow(/owner has not given it to you/i);
  });

  it('blocks a manager from giving more than his remaining balance', async () => {
    baseMocks('MANAGER', [gold]);
    prisma.managerStockHandover.findFirst.mockResolvedValue({ id: 'ms1' });
    const tx = txLike();
    tx.managerStockHandoverItem.findUnique.mockResolvedValue({
      id: 'mi1',
      givenQty: 5,
      givenAwayQty: 0,
    });
    prisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    );

    await expect(
      service.give('m1', { barmanId: 'b1', items: [{ productId: 'p1', givenQty: 6 }] }),
    ).rejects.toThrow(/only have 5 bottles of Gold/i);
  });

  it('lets a manager give exactly his remaining balance and tracks it away', async () => {
    baseMocks('MANAGER', [gold]);
    prisma.managerStockHandover.findFirst.mockResolvedValue({ id: 'ms1' });
    const tx = txLike();
    tx.managerStockHandoverItem.findUnique.mockResolvedValue({
      id: 'mi1',
      givenQty: 5,
      givenAwayQty: 2,
    });
    prisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    );
    prisma.stockHandover.findUnique.mockResolvedValue({
      id: 'st1',
      barmanId: 'b1',
      openedAt: new Date(),
      closedAt: null,
      status: 'OPEN',
      manager: null,
      barman: { id: 'b1', name: 'Barman' },
      closedBy: null,
      acceptedBy: null,
      items: [],
    });

    const result = await service.give('m1', {
      barmanId: 'b1',
      items: [{ productId: 'p1', givenQty: 3 }],
    });

    expect(tx.managerStockHandoverItem.update).toHaveBeenCalledWith({
      where: { id: 'mi1' },
      data: { givenAwayQty: { increment: 3 } },
    });
    expect(tx.stockHandoverEvent.create).toHaveBeenCalled();
    expect(realtime.emitToRoles).toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it('does not constrain the owner when giving to a barman', async () => {
    baseMocks('OWNER', [gold]);
    const tx = txLike();
    prisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    );
    prisma.stockHandover.findUnique.mockResolvedValue({
      id: 'st1',
      barmanId: 'b1',
      openedAt: new Date(),
      closedAt: null,
      status: 'OPEN',
      manager: null,
      barman: { id: 'b1', name: 'Barman' },
      closedBy: null,
      acceptedBy: null,
      items: [],
    });

    const result = await service.give('o1', {
      barmanId: 'b1',
      items: [{ productId: 'p1', givenQty: 50 }],
    });

    expect(tx.managerStockHandoverItem.findUnique).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it('returns the barman counted stock back into the manager open balance on accept', async () => {
    const tx = txLike();
    tx.stockHandover.update = jest.fn().mockResolvedValue({});
    tx.stockHandoverEvent.create = jest.fn().mockResolvedValue({});
    tx.activityLog.create = jest.fn().mockResolvedValue({});
    tx.shift = { findFirst: jest.fn().mockResolvedValue(null) };
    tx.managerStockHandover = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ms1',
        items: [{ id: 'mi1', productId: 'p1', givenAwayQty: 5 }],
      }),
    };
    tx.managerStockHandoverItem.update = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    );
    prisma.stockHandover.findUnique
      .mockResolvedValueOnce({
        id: 'st1',
        barmanId: 'b1',
        managerId: 'm1',
        status: 'CLOSED',
        acceptedAt: null,
        openedAt: new Date('2026-08-12T08:00:00Z'),
        closedAt: new Date('2026-08-12T10:00:00Z'),
        items: [{ id: 'i1', productId: 'p1', countedQty: 5 }],
      })
      .mockResolvedValueOnce({
        id: 'st1',
        barmanId: 'b1',
        openedAt: new Date(),
        closedAt: new Date(),
        status: 'CLOSED',
        manager: null,
        barman: { id: 'b1', name: 'Barman' },
        closedBy: null,
        acceptedBy: null,
        items: [],
      });

    const result = await service.accept('st1', 'm1');

    expect(tx.managerStockHandover.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ managerId: 'm1' }),
      }),
    );
    const call = tx.managerStockHandoverItem.update.mock.calls[0];
    expect(call[0]).toEqual(
      expect.objectContaining({
        where: { id: 'mi1' },
        data: expect.objectContaining({ givenAwayQty: expect.anything() }),
      }),
    );
    expect(Number(call[0].data.givenAwayQty)).toBe(0);
    expect(result).toBeTruthy();
  });

  it('adds the surplus when a barman returns more than the tracked given-away', async () => {
    const tx = txLike();
    tx.stockHandover.update = jest.fn().mockResolvedValue({});
    tx.stockHandoverEvent.create = jest.fn().mockResolvedValue({});
    tx.activityLog.create = jest.fn().mockResolvedValue({});
    tx.shift = { findFirst: jest.fn().mockResolvedValue(null) };
    tx.managerStockHandover = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ms1',
        items: [{ id: 'mi1', productId: 'p1', givenQty: 10, givenAwayQty: 3 }],
      }),
    };
    tx.managerStockHandoverItem.update = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    );
    prisma.stockHandover.findUnique
      .mockResolvedValueOnce({
        id: 'st1',
        barmanId: 'b1',
        managerId: 'm1',
        status: 'CLOSED',
        acceptedAt: null,
        openedAt: new Date(),
        closedAt: new Date(),
        items: [{ id: 'i1', productId: 'p1', countedQty: 4.5 }],
      })
      .mockResolvedValueOnce({
        id: 'st1',
        barmanId: 'b1',
        openedAt: new Date(),
        closedAt: new Date(),
        status: 'CLOSED',
        manager: null,
        barman: { id: 'b1', name: 'Barman' },
        closedBy: null,
        acceptedBy: null,
        items: [],
      });

    await service.accept('st1', 'm1');

    const call = tx.managerStockHandoverItem.update.mock.calls[0];
    expect(Number(call[0].data.givenAwayQty)).toBe(0);
    expect(Number(call[0].data.givenQty)).toBe(11.5);
  });

  it('adds returned stock as a new item when the manager never gave that product', async () => {
    const tx = txLike();
    tx.stockHandover.update = jest.fn().mockResolvedValue({});
    tx.stockHandoverEvent.create = jest.fn().mockResolvedValue({});
    tx.activityLog.create = jest.fn().mockResolvedValue({});
    tx.shift = { findFirst: jest.fn().mockResolvedValue(null) };
    tx.managerStockHandover = {
      findFirst: jest.fn().mockResolvedValue({ id: 'ms1', items: [] }),
    };
    tx.managerStockHandoverItem.update = jest.fn().mockResolvedValue({});
    tx.managerStockHandoverItem.create = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    );
    prisma.stockHandover.findUnique
      .mockResolvedValueOnce({
        id: 'st1',
        barmanId: 'b1',
        managerId: 'm1',
        status: 'CLOSED',
        acceptedAt: null,
        openedAt: new Date(),
        closedAt: new Date(),
        items: [{ id: 'i1', productId: 'p1', countedQty: 2 }],
      })
      .mockResolvedValueOnce({
        id: 'st1',
        barmanId: 'b1',
        openedAt: new Date(),
        closedAt: new Date(),
        status: 'CLOSED',
        manager: null,
        barman: { id: 'b1', name: 'Barman' },
        closedBy: null,
        acceptedBy: null,
        items: [],
      });

    const result = await service.accept('st1', 'm1');

    expect(tx.managerStockHandoverItem.update).not.toHaveBeenCalled();
    const call = tx.managerStockHandoverItem.create.mock.calls[0];
    expect(call[0].data).toEqual(
      expect.objectContaining({
        handoverId: 'ms1',
        productId: 'p1',
        givenAwayQty: expect.anything(),
      }),
    );
    expect(Number(call[0].data.givenQty)).toBe(2);
    expect(Number(call[0].data.givenAwayQty)).toBe(0);
    expect(result).toBeTruthy();
  });

  it('uses the barman in-hand when he clocked out without a physical count', async () => {
    const tx = txLike();
    tx.stockHandover.update = jest.fn().mockResolvedValue({});
    tx.stockHandoverEvent.create = jest.fn().mockResolvedValue({});
    tx.activityLog.create = jest.fn().mockResolvedValue({});
    tx.shift = { findFirst: jest.fn().mockResolvedValue(null) };
    tx.managerStockHandover = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ms1',
        items: [
          { id: 'mi1', productId: 'p1', givenQty: 240, givenAwayQty: 120 },
        ],
      }),
    };
    tx.managerStockHandoverItem.update = jest.fn().mockResolvedValue({});
    prisma.orderItem.findMany.mockResolvedValue([
      { productId: 'p1', quantity: 10, stockConsumption: 1 },
    ]);
    prisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    );
    prisma.stockHandover.findUnique
      .mockResolvedValueOnce({
        id: 'st1',
        barmanId: 'b1',
        managerId: 'm1',
        status: 'CLOSED',
        acceptedAt: null,
        openedAt: new Date('2026-08-12T08:00:00Z'),
        closedAt: new Date('2026-08-12T10:00:00Z'),
        items: [{ id: 'i1', productId: 'p1', givenQty: 120, countedQty: null }],
      })
      .mockResolvedValueOnce({
        id: 'st1',
        barmanId: 'b1',
        openedAt: new Date(),
        closedAt: new Date(),
        status: 'CLOSED',
        manager: null,
        barman: { id: 'b1', name: 'Barman' },
        closedBy: null,
        acceptedBy: null,
        items: [],
      });

    const result = await service.accept('st1', 'm1');

    const call = tx.managerStockHandoverItem.update.mock.calls[0];
    expect(Number(call[0].data.givenAwayQty)).toBe(10); // 120 - (120 - 10)
    expect(result).toBeTruthy();
  });
});