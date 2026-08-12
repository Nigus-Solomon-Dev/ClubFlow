import { ShiftsService } from './shifts.service';

describe('ShiftsService', () => {
  let service: ShiftsService;
  let prisma: {
    shift: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    order: { aggregate: jest.Mock; groupBy: jest.Mock };
    settlement: { findUnique: jest.Mock };
    settlementEntry: { updateMany: jest.Mock };
    activityLog: { create: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      shift: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      order: {
        aggregate: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      settlement: { findUnique: jest.fn() },
      settlementEntry: { updateMany: jest.fn() },
      activityLog: { create: jest.fn() },
    };
    service = new ShiftsService(
      prisma as never,
      { emitToRoles: jest.fn(), emitToUser: jest.fn() } as never,
      { open: jest.fn() } as never,
    );
  });

  it('opens a shift and logs it', async () => {
    prisma.shift.findFirst.mockResolvedValue(null);
    prisma.shift.create.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'OPEN',
    });

    const shift = await service.open('u1', 'WAITER');
    expect(shift.status).toBe('OPEN');
    expect(shift.expectedMoney).toBe(0);
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'shift.open' }),
      }),
    );
  });

  it('opens the stock handover when a barman clocks in', async () => {
    const stockOpen = jest.fn();
    service = new ShiftsService(
      prisma as never,
      { emitToRoles: jest.fn(), emitToUser: jest.fn() } as never,
      { open: stockOpen } as never,
    );
    prisma.shift.findFirst.mockResolvedValue(null);
    prisma.shift.create.mockResolvedValue({
      id: 's2',
      userId: 'u1',
      status: 'OPEN',
    });

    const shift = await service.open('u1', 'BARMAN');
    expect(shift.status).toBe('OPEN');
    expect(stockOpen).toHaveBeenCalledWith('u1');
  });

  it('does not allow a duplicate open shift', async () => {
    prisma.shift.findFirst.mockResolvedValue({ id: 's1', status: 'OPEN' });
    await expect(service.open('u1', 'WAITER')).rejects.toThrow(
      /already have an open shift/,
    );
  });

  it('records expectedMoney from completed orders on close', async () => {
    prisma.shift.findFirst.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'OPEN',
    });
    prisma.order.aggregate.mockResolvedValue({ _sum: { totalPrice: 2000 } });
    prisma.shift.update.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'CLOSED',
      startedAt: new Date(),
      endedAt: new Date(),
      expectedMoney: 2000,
    });

    const shift = await service.close('u1');
    expect(shift.expectedMoney).toBe(2000);
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'shift.close' }),
      }),
    );
  });

  it('accepts a closed shift, records paid and updates today settlement', async () => {
    prisma.shift.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'CLOSED',
      expectedMoney: 2000,
      paidAt: null,
      user: { role: 'WAITER' },
    });
    prisma.shift.findFirst.mockResolvedValue({
      id: 'c1',
      userId: 'cashier1',
      status: 'OPEN',
    });
    prisma.shift.update.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'CLOSED',
      expectedMoney: 2000,
      paidAt: new Date(),
      paidById: 'cashier1',
    });
    prisma.settlement.findUnique.mockResolvedValue({ id: 'sett1' });

    const shift = await service.accept('s1', {
      id: 'cashier1',
      role: 'CASHIER',
    });
    expect(shift.paidAt).toBeTruthy();
    expect(prisma.settlementEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          settlementId: 'sett1',
          employeeId: 'u1',
        }),
        data: expect.objectContaining({ collected: 2000 }),
      }),
    );
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'shift.accept' }),
      }),
    );
  });

  it('requires the cashier to clock in before accepting', async () => {
    prisma.shift.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'CLOSED',
      expectedMoney: 2000,
      paidAt: null,
      user: { role: 'WAITER' },
    });
    prisma.shift.findFirst.mockResolvedValue(null);

    await expect(
      service.accept('s1', { id: 'cashier1', role: 'CASHIER' }),
    ).rejects.toThrow(/clock in/i);
  });

  it('rejects accepting your own shift money', async () => {
    prisma.shift.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'CLOSED',
      expectedMoney: 2000,
      paidAt: null,
    });

    await expect(
      service.accept('s1', { id: 'u1', role: 'CASHIER' }),
    ).rejects.toThrow(/own shift/i);
  });

  it('rejects accepting a shift that is not closed', async () => {
    prisma.shift.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'OPEN',
      expectedMoney: 0,
      paidAt: null,
    });
    await expect(
      service.accept('s1', { id: 'cashier1', role: 'CASHIER' }),
    ).rejects.toThrow(/not closed/);
  });

  it('lets a manager accept a cashier shift and an owner a manager shift', async () => {
    prisma.shift.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'CLOSED',
      expectedMoney: 3000,
      paidAt: null,
      user: { role: 'CASHIER' },
    });
    prisma.shift.update.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'CLOSED',
      expectedMoney: 3000,
      paidAt: new Date(),
      paidById: 'manager1',
    });

    const shift = await service.accept('s1', {
      id: 'manager1',
      role: 'MANAGER',
    });
    expect(shift.paidAt).toBeTruthy();

    prisma.shift.findUnique.mockResolvedValue({
      id: 's2',
      userId: 'manager1',
      status: 'CLOSED',
      expectedMoney: 5000,
      paidAt: null,
      user: { role: 'MANAGER' },
    });
    prisma.shift.update.mockResolvedValue({
      id: 's2',
      userId: 'manager1',
      status: 'CLOSED',
      expectedMoney: 5000,
      paidAt: new Date(),
      paidById: 'owner1',
    });

    const ownerShift = await service.accept('s2', {
      id: 'owner1',
      role: 'OWNER',
    });
    expect(ownerShift.paidAt).toBeTruthy();
  });

  it('blocks accepting money two levels above you', async () => {
    prisma.shift.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'CLOSED',
      expectedMoney: 2000,
      paidAt: null,
      user: { role: 'WAITER' },
    });
    await expect(
      service.accept('s1', { id: 'manager1', role: 'MANAGER' }),
    ).rejects.toThrow(/directly below/);
  });
});
