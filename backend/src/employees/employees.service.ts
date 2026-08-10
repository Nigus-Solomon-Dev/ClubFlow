import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../../generated/prisma/client';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(id: string, dto: UpdateEmployeeDto, actorId: string) {
    const employee = await this.prisma.user.findUnique({ where: { id } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (dto.role === Role.OWNER) {
      throw new ForbiddenException(
        'The OWNER role cannot be assigned through employee management',
      );
    }
    if (id === actorId && (dto.isActive === false || dto.role !== undefined)) {
      throw new BadRequestException(
        'You cannot change your own role or deactivate yourself',
      );
    }
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }
}
