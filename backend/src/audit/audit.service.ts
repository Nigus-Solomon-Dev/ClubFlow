import { Injectable } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async trail(options: {
    limit?: number;
    role?: Role;
    action?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (options.action) {
      where.action = options.action;
    }
    if (options.role) {
      where.user = { is: { role: options.role } };
    }
    return this.prisma.activityLog.findMany({
      where,
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: options.limit ? Math.min(options.limit, 500) : 200,
    });
  }

  async orderHistory() {
    return this.prisma.order.findMany({
      include: {
        waiter: { select: { id: true, name: true } },
        table: { select: { id: true, name: true } },
        items: { select: { productName: true, quantity: true, unitPrice: true } },
        cancellationRequests: {
          select: {
            id: true,
            status: true,
            reason: true,
            createdAt: true,
            requestedBy: { select: { name: true } },
            barman: { select: { name: true } },
            decidedBy: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async cancellationHistory() {
    return this.prisma.cancellationRequest.findMany({
      include: {
        order: { select: { id: true, orderNumber: true, status: true, totalPrice: true } },
        requestedBy: { select: { id: true, name: true, role: true } },
        barman: { select: { id: true, name: true } },
        decidedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }
}