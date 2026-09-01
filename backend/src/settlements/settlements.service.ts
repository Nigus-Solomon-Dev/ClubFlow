import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectSettlementDto } from './dto/collect-settlement.dto';

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  private dateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private startOfToday(): Date {
    const now = new Date();
    const s = new Date(now);
    s.setHours(0, 0, 0, 0);
    return s;
  }

  private endOfToday(): Date {
    const s = new Date(this.startOfToday());
    s.setDate(s.getDate() + 1);
    return s;
  }

  private toNumber(value: unknown): number {
    return value == null ? 0 : Number(value);
  }

  private async recomputeExpected(settlementId: string): Promise<void> {
    const start = this.startOfToday();
    const end = this.endOfToday();

    const grouped = await this.prisma.shift.groupBy({
      by: ['userId'],
      where: {
        endedAt: { gte: start, lt: end },
        user: { role: Role.WAITER },
      },
      _sum: { expectedMoney: true },
    });

    const waiters = await this.prisma.user.findMany({
      where: { role: Role.WAITER, isActive: true },
      select: { id: true, name: true },
    });

    await Promise.all(
      waiters.map((w) => {
        const exp = this.toNumber(
          grouped.find((g) => g.userId === w.id)?._sum?.expectedMoney,
        );
        return this.prisma.settlementEntry.upsert({
          where: {
            settlementId_employeeId: {
              settlementId,
              employeeId: w.id,
            },
          },
          create: {
            settlementId,
            employeeId: w.id,
            expected: exp,
          },
          update: {
            expected: exp,
          },
        });
      }),
    );
  }

  private async ensureToday(actorId: string) {
    const date = this.dateKey(new Date());
    let settlement = await this.prisma.settlement.findUnique({
      where: { date },
    });
    if (!settlement) {
      settlement = await this.prisma.settlement.create({
        data: { date, createdById: actorId },
      });
    }
    await this.recomputeExpected(settlement.id);
    return settlement;
  }

  async today(actorId: string) {
    const settlement = await this.ensureToday(actorId);
    return this.buildView(settlement.id);
  }

  async collect(actorId: string, dto: CollectSettlementDto) {
    const settlement = await this.ensureToday(actorId);
    if (settlement.status !== 'OPEN') {
      throw new BadRequestException('Today is already closed.');
    }
    await Promise.all(
      dto.entries.map((e) =>
        this.prisma.settlementEntry.updateMany({
          where: { settlementId: settlement.id, employeeId: e.employeeId },
          data: { collected: e.collected ?? 0 },
        }),
      ),
    );
    await this.recomputeExpected(settlement.id);
    await this.logSettlement(actorId, 'settlement.collect', settlement.id);
    return this.buildView(settlement.id);
  }

  async close(actorId: string) {
    const settlement = await this.ensureToday(actorId);
    if (settlement.status !== 'OPEN') {
      throw new BadRequestException('Today is already closed');
    }
    const updated = await this.prisma.settlement.update({
      where: { id: settlement.id },
      data: { status: 'CLOSED', closedById: actorId, closedAt: new Date() },
    });
    await this.logSettlement(actorId, 'settlement.close', settlement.id);
    return this.buildView(updated.id);
  }

  private async logSettlement(
    actorId: string,
    action: string,
    settlementId: string,
  ) {
    await this.prisma.activityLog.create({
      data: {
        userId: actorId,
        action,
        entity: 'Settlement',
        entityId: settlementId,
      },
    });
  }

  async history(actorId: string) {
    const settlements = await this.prisma.settlement.findMany({
      orderBy: { date: 'desc' },
      take: 30,
      include: {
        entries: {
          orderBy: { expected: 'desc' },
          include: { employee: { select: { id: true, name: true } } },
        },
        closedBy: { select: { id: true, name: true } },
      },
    });
    return settlements.map((s) => ({
      id: s.id,
      date: s.date,
      status: s.status,
      closedAt: s.closedAt,
      closedBy: s.closedBy?.name ?? null,
      expected: this.toNumber(
        s.entries.reduce((acc, e) => acc + this.toNumber(e.expected), 0),
      ),
      collected: this.toNumber(
        s.entries.reduce(
          (acc, e) =>
            acc + (e.collected == null ? 0 : this.toNumber(e.collected)),
          0,
        ),
      ),
      entries: s.entries.map((e) => ({
        id: e.id,
        employeeId: e.employeeId,
        employeeName: e.employee?.name ?? '—',
        expected: this.toNumber(e.expected),
        collected: e.collected == null ? null : this.toNumber(e.collected),
      })),
    }));
  }

  private async buildView(settlementId: string) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      include: {
        entries: {
          orderBy: { expected: 'desc' },
          include: { employee: { select: { id: true, name: true } } },
        },
      },
    });
    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }
    const entries = settlement.entries.map((e) => ({
      id: e.id,
      employeeId: e.employeeId,
      employeeName: e.employee?.name ?? '—',
      expected: this.toNumber(e.expected),
      collected: e.collected == null ? null : this.toNumber(e.collected),
    }));
    const expected = entries.reduce((acc, e) => acc + e.expected, 0);
    const collected = entries.reduce((acc, e) => acc + (e.collected ?? 0), 0);
    return {
      id: settlement.id,
      date: settlement.date,
      status: settlement.status,
      isClosed: settlement.status !== 'OPEN',
      closedAt: settlement.closedAt,
      expected,
      collected,
      difference: expected - collected,
      entries,
    };
  }
}
