import { ManagerStockHandoversService } from './manager-stock-handovers.service';

describe('ManagerStockHandoversService', () => {
  let service: ManagerStockHandoversService;
  let prisma: {
    stockHandover: { findFirst: jest.Mock };
    stockHandoverEvent: { findMany: jest.Mock };
    shift: {
      findFirst: jest.Mock;
      aggregate: jest.Mock;
      create: jest.Mock;
    };
    managerStockHandover: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    managerStockHandoverItem: { update: jest.Mock };
    managerStockHandoverEvent: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    activityLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let realtime: { emitToRoles: jest.Mock; emitToUser: jest.Mock };

  beforeEach(() => {
    prisma = {
      stockHandover: { findFirst: jest.fn() },
      stockHandoverEvent: { findMany: jest.fn() },
      shift: {
        findFirst: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
      },
      managerStockHandover: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      managerStockHandoverItem: { update: jest.fn() },
      managerStockHandoverEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      activityLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    realtime = {
      emitToRoles: jest.fn(),
      emitToUser: jest.fn(),
    };
    service = new ManagerStockHandoversService(
      prisma as never,
      realtime as never,
    );
  });

  it('blocks the settle while a barman stock batch is open', async () => {
    prisma.stockHandover.findFirst.mockResolvedValue({ id: 'b1' });

    await expect(
      service.settle({ id: 'm1', role: 'MANAGER' }, { items: [] }),
    ).rejects.toThrow(/barman stock batch/i);
  });

  it('blocks a second settle before the owner accepts the first', async () => {
    prisma.stockHandover.findFirst.mockResolvedValue(null);
    prisma.shift.findFirst.mockResolvedValue({ id: 's1' });

    await expect(
      service.settle({ id: 'm1', role: 'MANAGER' }, { items: [] }),
    ).rejects.toThrow(/previous settle/i);
  });

  it('blocks the settle while a closed barman batch is not yet accepted', async () => {
    prisma.stockHandover.findFirst
      .mockResolvedValueOnce(null) // no open barman batch
      .mockResolvedValueOnce({ id: 'b1' }); // closed, unaccepted

    await expect(
      service.settle({ id: 'm1', role: 'MANAGER' }, { items: [] }),
    ).rejects.toThrow(/accept every barman/i);
  });

  it('creates the money shift from cashier shifts accepted since the last settle', async () => {
    prisma.stockHandover.findFirst.mockResolvedValue(null);
    prisma.shift.findFirst
      .mockResolvedValueOnce(null) // no pending settle
      .mockResolvedValueOnce({ endedAt: new Date('2026-08-10T10:00:00Z') }); // last settle
    prisma.shift.aggregate.mockResolvedValue({ _sum: { expectedMoney: 4500 } });
    prisma.managerStockHandover.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          shift: {
            create: jest
              .fn()
              .mockResolvedValue({ id: 'settle1', expectedMoney: 4500 }),
          },
          activityLog: { create: jest.fn() },
        }),
    );

    const result = await service.settle(
      { id: 'm1', role: 'MANAGER' },
      { items: [] },
    );

    expect(prisma.shift.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ paidById: 'm1' }),
      }),
    );
    expect(result.shift).toEqual({ id: 'settle1', expectedMoney: 4500 });
    expect(result.stock).toBeNull();
  });

  it('closes the manager stock handover with counts at the settle', async () => {
    prisma.stockHandover.findFirst.mockResolvedValue(null);
    prisma.shift.findFirst.mockResolvedValue(null);
    prisma.shift.aggregate.mockResolvedValue({ _sum: { expectedMoney: 0 } });
    prisma.managerStockHandover.findFirst.mockResolvedValue({
      id: 'ms1',
      managerId: 'm1',
      status: 'OPEN',
      openedAt: new Date('2026-08-11T08:00:00Z'),
      items: [{ id: 'i1', productId: 'p1', givenQty: 24, givenAwayQty: 10 }],
    });
    prisma.stockHandoverEvent.findMany.mockResolvedValue([
      { items: [{ productId: 'p1', givenQty: 10 }] },
    ]);
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          managerStockHandoverItem: {
            update: jest
              .fn()
              .mockResolvedValueOnce({ id: 'i1', countedQty: 12 }),
          },
          managerStockHandover: {
            update: jest
              .fn()
              .mockResolvedValue({ id: 'ms1', status: 'CLOSED' }),
          },
          managerStockHandoverEvent: { create: jest.fn() },
          shift: {
            create: jest
              .fn()
              .mockResolvedValue({ id: 'settle1', expectedMoney: 0 }),
          },
          activityLog: { create: jest.fn() },
        }),
    );
    prisma.managerStockHandover.findUnique.mockResolvedValue({
      id: 'ms1',
      managerId: 'm1',
      status: 'CLOSED',
      openedAt: new Date('2026-08-11T08:00:00Z'),
      closedAt: new Date(),
      manager: { id: 'm1', name: 'Manager' },
      givenBy: { id: 'o1', name: 'Owner' },
      closedBy: null,
      acceptedBy: null,
      items: [
        {
          id: 'i1',
          handoverId: 'ms1',
          productId: 'p1',
          product: {
            id: 'p1',
            name: 'Castel',
            stockUnit: 'Piece',
            piecesPerCase: 24,
            category: { name: 'Beer' },
            sellingUnits: [],
          },
          givenQtyLast: 0,
        },
      ],
    });

    const result = await service.settle(
      { id: 'm1', role: 'MANAGER' },
      { items: [{ productId: 'p1', countedQty: 12 }] },
    );

    expect(result.stock).toBeTruthy();
    expect(realtime.emitToRoles).toHaveBeenCalled();
  });
});
