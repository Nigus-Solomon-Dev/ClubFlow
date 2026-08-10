import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Role, ShiftStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async open(userId: string) {
    const existing = await this.prisma.shift.findFirst({
      where: { userId, status: ShiftStatus.OPEN },
    });
    if (existing) {
      throw new BadRequestException('You already have an open shift');
    }
    const shift = await this.prisma.shift.create({
      data: { userId, status: ShiftStatus.OPEN, startedAt: new Date() },
    });
    await this.logShift(userId, 'shift.open', shift.id);
    this.realtime.emitToRoles(
      [Role.WAITER, Role.MANAGER, Role.OWNER],
      'shift.opened',
      { shiftId: shift.id, userId },
    );
    return (await this.withExpectedMoney([shift]))[0];
  }

  async close(userId: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { userId, status: ShiftStatus.OPEN },
    });
    if (!shift) {
      throw new NotFoundException('You have no open shift');
    }
    const expectedMoney = await this.todayCompletedFor(userId);
    const updated = await this.prisma.shift.update({
      where: { id: shift.id },
      data: {
        status: ShiftStatus.CLOSED,
        endedAt: new Date(),
        expectedMoney,
      },
    });
    await this.logShift(userId, 'shift.close', shift.id);
    return this.serialize(updated);
  }

  async accept(shiftId: string, actorId: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) {
      throw new NotFoundException('Shift not found');
    }
    if (shift.status !== ShiftStatus.CLOSED) {
      throw new BadRequestException('Shift is not closed yet');
    }
    if (shift.paidAt) {
      throw new BadRequestException('Shift money was already accepted');
    }
    const updated = await this.prisma.shift.update({
      where: { id: shiftId },
      data: { paidAt: new Date(), paidById: actorId },
    });
    await this.recordSettlementCollected(
      shift.userId,
      this.toNumber(shift.expectedMoney),
    );
    await this.logShift(actorId, 'shift.accept', shiftId);
    this.realtime.emitToRoles(
      [Role.WAITER, Role.CASHIER, Role.MANAGER, Role.OWNER],
      'shift.accepted',
      { shiftId, userId: shift.userId },
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

  private serialize<T extends { expectedMoney?: unknown }>(shift: T): T & { expectedMoney: number } {
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

  private async todayCompletedFor(userId: string): Promise<number> {
    const agg = await this.prisma.order.aggregate({
      where: {
        waiterId: userId,
        status: OrderStatus.COMPLETED,
        createdAt: { gte: this.startOfToday(), lt: this.endOfToday() },
      },
      _sum: { totalPrice: true },
    });
    return this.toNumber(agg._sum?.totalPrice);
  }

  private async withExpectedMoney<
    T extends {
      userId: string;
      status: string;
      startedAt: Date;
      endedAt?: Date | null;
    },
  >(shifts: T[]): Promise<Array<T & { expectedMoney: number }>> {
    if (shifts.length === 0) return [];

    const openShifts = shifts.filter((s) => s.status === ShiftStatus.OPEN);
    const liveTotals = new Map<string, number>();
    if (openShifts.length > 0) {
      const waiterIds = [...new Set(openShifts.map((s) => s.userId))];
      const grouped = await this.prisma.order.groupBy({
        by: ['waiterId'],
        where: {
          status: OrderStatus.COMPLETED,
          waiterId: { in: waiterIds },
          createdAt: { gte: this.startOfToday(), lt: this.endOfToday() },
        },
        _sum: { totalPrice: true },
      });
      for (const g of grouped) {
        liveTotals.set(g.waiterId, this.toNumber(g._sum?.totalPrice));
      }
    }

    return shifts.map((s) => ({
      ...s,
      expectedMoney:
        s.status === ShiftStatus.OPEN
          ? (liveTotals.get(s.userId) ?? 0)
          : this.toNumber((s as T & { expectedMoney?: unknown }).expectedMoney),
    }));
  }
}
