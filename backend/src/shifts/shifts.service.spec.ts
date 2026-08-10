import { ShiftsService } from './shifts.service';

describe('ShiftsService', () => {
  let service: ShiftsService;
  let prisma: {
    shift: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
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
    );
  });

  it('opens a shift and logs it', async () => {
    prisma.shift.findFirst.mockResolvedValue(null);
    prisma.shift.create.mockResolvedValue({ id: 's1', userId: 'u1', status: 'OPEN' });

    const shift = await service.open('u1');
    expect(shift.status).toBe('OPEN');
    expect(shift.expectedMoney).toBe(0);
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'shift.open' }) }),
    );
  });

  it('does not allow a duplicate open shift', async () => {
    prisma.shift.findFirst.mockResolvedValue({ id: 's1', status: 'OPEN' });
    await expect(service.open('u1')).rejects.toThrow(/already have an open shift/);
  });

  it('records expectedMoney from completed orders on close', async () => {
    prisma.shift.findFirst.mockResolvedValue({ id: 's1', userId: 'u1', status: 'OPEN' });
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
      expect.objectContaining({ data: expect.objectContaining({ action: 'shift.close' }) }),
    );
  });

  it('accepts a closed shift, records paid and updates today settlement', async () => {
    prisma.shift.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'CLOSED',
      expectedMoney: 2000,
      paidAt: null,
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

    const shift = await service.accept('s1', 'cashier1');
    expect(shift.paidAt).toBeTruthy();
    expect(prisma.settlementEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ settlementId: 'sett1', employeeId: 'u1' }),
        data: expect.objectContaining({ collected: 2000 }),
      }),
    );
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'shift.accept' }) }),
    );
  });

  it('rejects accepting a shift that is not closed', async () => {
    prisma.shift.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      status: 'OPEN',
      expectedMoney: 0,
      paidAt: null,
    });
    await expect(service.accept('s1', 'cashier1')).rejects.toThrow(/not closed/);
  });
});
