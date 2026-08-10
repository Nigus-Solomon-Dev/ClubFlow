import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.restaurantTable.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id },
    });
    if (!table) {
      throw new NotFoundException('Table not found');
    }
    return table;
  }

  async create(dto: CreateTableDto) {
    const existing = await this.prisma.restaurantTable.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('A table with that name already exists');
    }
    return this.prisma.restaurantTable.create({
      data: { name: dto.name, isActive: dto.isActive ?? true },
    });
  }

  async update(id: string, dto: UpdateTableDto) {
    await this.findOne(id);
    if (dto.name !== undefined) {
      const existing = await this.prisma.restaurantTable.findUnique({
        where: { name: dto.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('A table with that name already exists');
      }
    }
    return this.prisma.restaurantTable.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const table = await this.findOne(id);
    const activeOrder = await this.prisma.order.findFirst({
      where: {
        tableId: id,
        status: { in: ['DRAFT', 'SENT', 'COMPLETED'] },
      },
    });
    if (activeOrder) {
      throw new ConflictException(
        'Cannot delete a table that has associated orders',
      );
    }
    await this.prisma.restaurantTable.delete({ where: { id } });
    return { deleted: true, id: table.id };
  }
}
