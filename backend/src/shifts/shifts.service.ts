import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Role, ShiftStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockHandoversService } from '../stock-handovers/stock-handovers.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly stockHandovers: StockHandoversService,
  ) {}

  async open(userId: string, userRole: string) {
    const existing = await this.prisma.shift.findFirst({
      where: { userId, status: ShiftStatus.OPEN },
    });
    if (existing) {
      throw new BadRequestException('You already have an open shift');
    }
    if (userRole === Role.BARMAN) {
      await this.stockHandovers.open(userId);
    }
    const shift = await this.prisma.shift.create({
      data: { userId, status: ShiftStatus.OPEN, startedAt: new Date() },
    });
    await this.logShift(userId, 'shift.open', shift.id);
    this.realtime.emitToRoles(
      [Role.WAITER, Role.BARMAN, Role.CASHIER, Role.MANAGER, Role.OWNER],
      'shift.opened',
      { shiftId: shift.id, userId },
    );
    this.realtime.emitToUser(userId, 'shift.opened', { shiftId: shift.id });
    return (await this.withExpectedMoney([shift]))[0];
  }

  async close(userId: string, userRole?: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { userId, status: ShiftStatus.OPEN },
    });
    if (!shift) {
      throw new NotFoundException('You have no open shift');
    }
    if (userRole === Role.BARMAN) {
      await this.stockHandovers.closeOpenForBarman(userId);
    }
    const expectedMoney =
      userRole === Role.CASHIER
        ? await this.acceptedForCashier(userId, shift.startedAt, new Date())
        : await this.completedForShift(shift.id);
    const updated = await this.prisma.shift.update({
      where: { id: shift.id },
      data: {
        status: ShiftStatus.CLOSED,
        endedAt: new Date(),
        expectedMoney,
      },
    });
    await this.logShift(userId, 'shift.close', shift.id);
    this.realtime.emitToRoles(
      [Role.WAITER, Role.BARMAN, Role.CASHIER, Role.MANAGER, Role.OWNER],
      'shift.closed',
      { shiftId: shift.id, userId },
    );
    this.realtime.emitToUser(userId, 'shift.closed', { shiftId: shift.id });
    return this.serialize(updated);
  }
  async managerCashDrop(user: { id: string; role: string }) {
    if (user.role !== Role.MANAGER) {
      throw new BadRequestException('Only managers can drop cash to the owner');
    }

    const pending = await this.prisma.shift.findFirst({
      where: {
        userId: user.id,
        status: ShiftStatus.CLOSED,
        isSettle: true,
        paidAt: null,
      },
      select: { id: true },
    });
    if (pending) {
      throw new BadRequestException(
        'The owner has not accepted your previous cash drop yet.',
      );
    }

    const lastSettle = await this.prisma.shift.findFirst({
      where: { userId: user.id, status: ShiftStatus.CLOSED, isSettle: true },
      orderBy: { endedAt: 'desc' },
      select: { endedAt: true },
    });
    const windowStart = lastSettle?.endedAt ?? new Date(0);
    const now = new Date();

    const moneyAgg = await this.prisma.shift.aggregate({
      where: {
        paidById: user.id,
        paidAt: { gt: windowStart },
        status: ShiftStatus.CLOSED,
        user: { role: Role.CASHIER },
      },
      _sum: { expectedMoney: true },
    });
    const expectedMoney = this.toNumber(moneyAgg._sum?.expectedMoney);

    const created = await this.prisma.shift.create({
      data: {
        userId: user.id,
        status: ShiftStatus.CLOSED,
        startedAt: lastSettle?.endedAt ?? now,
        endedAt: now,
        expectedMoney,
        isSettle: true,
      },
    });

    await this.logShift(user.id, 'shift.settle', created.id);

    this.realtime.emitToRoles(
      [Role.CASHIER, Role.MANAGER, Role.OWNER],
      'shift.closed',
      { shiftId: created.id, userId: user.id },
    );

    return this.serialize(created);
  }

  async accept(shiftId: string, actor: { id: string; role: string }) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { user: { select: { role: true } } },
    });
    if (!shift) {
      throw new NotFoundException('Shift not found');
    }
    if (shift.status !== ShiftStatus.CLOSED) {
      throw new BadRequestException('Shift is not closed yet');
    }
    if (shift.paidAt) {
      throw new BadRequestException('Shift money was already accepted');
    }
    if (shift.userId === actor.id) {
      throw new BadRequestException('You cannot accept your own shift money');
    }
    // Money flows up the chain one level at a time:
    // cashier accepts waiters, manager accepts cashiers, owner accepts manager.
    const targetRole = shift.user?.role;
    const acceptedTargets: Record<string, string | null> = {
      [Role.CASHIER]: Role.WAITER,
      [Role.MANAGER]: Role.CASHIER,
      [Role.OWNER]: Role.MANAGER,
    };
    if (acceptedTargets[actor.role] !== targetRole) {
      throw new BadRequestException(
        'You can only accept the money of the role directly below you',
      );
    }
    if (actor.role === Role.CASHIER) {
      const openShift = await this.prisma.shift.findFirst({
        where: { userId: actor.id, status: ShiftStatus.OPEN },
        select: { id: true },
      });
      if (!openShift) {
        throw new BadRequestException('Clock in before accepting waiter money');
      }
    }
    const updated = await this.prisma.shift.update({
      where: { id: shiftId },
      data: { paidAt: new Date(), paidById: actor.id },
    });
    await this.recordSettlementCollected(
      shift.userId,
      this.toNumber(shift.expectedMoney),
    );
    await this.logShift(actor.id, 'shift.accept', shiftId);
    this.realtime.emitToRoles(
      [Role.WAITER, Role.CASHIER, Role.MANAGER, Role.OWNER],
      'shift.accepted',
      { shiftId, userId: shift.userId },
    );
    this.realtime.emitToUser(shift.userId, 'shift.accepted', { shiftId });
    this.realtime.emitToRoles(
      [Role.CASHIER, Role.MANAGER, Role.OWNER],
      'dashboard.updated',
      {},
    );
    return this.serialize(updated);
  }

  private async recordSettlementCollected(userId: string, amount: number) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { date: this.dayKey(new Date()) },
    });
    if (!settlement) return;
    await this.prisma.settlementEntry.updateMany({
      where: { settlementId: settlement.id, employeeId: userId },
      data: { collected: amount },
    });
  }

  private async logShift(userId: string, action: string, shiftId: string) {
    await this.prisma.activityLog.create({
      data: { userId, action, entity: 'Shift', entityId: shiftId },
    });
  }

  async myShifts(userId: string) {
    const shifts = await this.prisma.shift.findMany({
      where: { userId },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    return this.withExpectedMoney(shifts);
  }

  async allShifts() {
    const shifts = await this.prisma.shift.findMany({
      include: {
        user: { select: { id: true, name: true, role: true } },
        paidBy: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    return this.withExpectedMoney(shifts);
  }

  async today() {
    const shifts = await this.prisma.shift.findMany({
      where: {
        status: ShiftStatus.CLOSED,
        endedAt: { gte: this.startOfToday(), lt: this.endOfToday() },
        user: { role: { not: Role.BARMAN } },
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        paidBy: { select: { id: true, name: true } },
      },
      orderBy: { endedAt: 'asc' },
    });
    return shifts.map((s) => this.serialize(s));
  }

  async list(user: { id: string; role: string }) {
    if (user.role === Role.OWNER || user.role === Role.MANAGER) {
      return this.allShifts();
    }
    return this.myShifts(user.id);
  }

  private toNumber(value: unknown): number {
    return value == null ? 0 : Number(value);
  }

  private serialize<T extends { expectedMoney?: unknown }>(
    shift: T,
  ): T & { expectedMoney: number } {
    return { ...shift, expectedMoney: this.toNumber(shift.expectedMoney) };
  }

  private startOfToday(): Date {
    const now = new Date();
    const s = new Date(now);
    s.setHours(0, 0, 0, 0);
    return s;
  }

  private endOfToday(): Date {
    const s = this.startOfToday();
    s.setDate(s.getDate() + 1);
    return s;
  }

  private dayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private async completedForShift(shiftId: string): Promise<number> {
    const agg = await this.prisma.order.aggregate({
      where: {
        status: OrderStatus.COMPLETED,
        shiftId,
      },
      _sum: { totalPrice: true },
    });
    return this.toNumber(agg._sum?.totalPrice);
  }

  private async acceptedForCashier(
    cashierId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const agg = await this.prisma.shift.aggregate({
      where: {
        paidById: cashierId,
        paidAt: { gte: start, lt: end },
        status: ShiftStatus.CLOSED,
      },
      _sum: { expectedMoney: true },
    });
    return this.toNumber(agg._sum?.expectedMoney);
  }

  private async withExpectedMoney<
    T extends {
      id: string;
      userId: string;
      status: string;
      startedAt: Date;
      endedAt?: Date | null;
      user?: { role?: string } | null;
    },
  >(shifts: T[]): Promise<Array<T & { expectedMoney: number }>> {
    if (shifts.length === 0) return [];

    const openShifts = shifts.filter((s) => s.status === ShiftStatus.OPEN);
    const liveTotals = new Map<string, number>();
    if (openShifts.length > 0) {
      const orderShiftIds = openShifts
        .filter((s) => s.user?.role !== Role.CASHIER)
        .map((s) => s.id);
      if (orderShiftIds.length > 0) {
        const grouped = await this.prisma.order.groupBy({
          by: ['shiftId'],
          where: {
            status: OrderStatus.COMPLETED,
            shiftId: { in: orderShiftIds },
          },
          _sum: { totalPrice: true },
        });
        for (const g of grouped) {
          if (g.shiftId) {
            liveTotals.set(g.shiftId, this.toNumber(g._sum?.totalPrice));
          }
        }
      }
      for (const s of openShifts) {
        if (s.user?.role === Role.CASHIER) {
          liveTotals.set(
            s.id,
            await this.acceptedForCashier(s.userId, s.startedAt, new Date()),
          );
        }
      }
    }

    return shifts.map((s) => ({
      ...s,
      expectedMoney:
        s.status === ShiftStatus.OPEN
          ? (liveTotals.get(s.id) ?? 0)
          : this.toNumber((s as T & { expectedMoney?: unknown }).expectedMoney),
    }));
  }
}
