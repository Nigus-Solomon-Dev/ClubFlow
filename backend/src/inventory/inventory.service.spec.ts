import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: {
    inventory: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    inventoryMovement: { create: jest.Mock; findMany: jest.Mock };
    activityLog: { create: jest.Mock };
  };
  let realtime: { emitToRoles: jest.Mock };

  beforeEach(() => {
    prisma = {
      inventory: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      inventoryMovement: { create: jest.fn(), findMany: jest.fn() },
      activityLog: { create: jest.fn() },
    };
    realtime = { emitToRoles: jest.fn() };
    service = new InventoryService(prisma as never, realtime as never);
  });

  it('updates stock, records a movement, and notifies realtime', async () => {
    prisma.inventory.findUnique.mockResolvedValue({
      id: 'inv1',
      productId: 'p1',
      quantity: 5,
      product: { name: 'beer' },
    });
    prisma.inventory.update.mockResolvedValue({
      id: 'inv1',
      quantity: 12,
      unit: 'bottle',
      product: { name: 'beer', category: {} },
    });
    prisma.inventoryMovement.create.mockResolvedValue({});
    prisma.activityLog.create.mockResolvedValue({});

    const result = await service.update('inv1', { quantity: 12, unit: 'bottle' }, 'u1');

    // from 5 -> 12
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ change: 7, quantityAfter: 12, reason: 'manual', actorId: 'u1' }),
      }),
    );
    expect(prisma.activityLog.create).toHaveBeenCalled();
    expect(realtime.emitToRoles).toHaveBeenCalled();
    expect(result.quantity).toBe(12);
  });
});