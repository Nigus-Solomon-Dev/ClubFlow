import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.product.findMany({
      include: {
        category: true,
        inventory: true,
        sellingUnits: { orderBy: { price: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        inventory: true,
        sellingUnits: { orderBy: { price: 'asc' } },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async create(dto: CreateProductDto) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
      const product = await tx.product.create({
        data: {
          name: dto.name,
          categoryId: dto.categoryId,
          price: dto.price,
          isAvailable: dto.isAvailable ?? true,
        },
      });
      await tx.inventory.create({
        data: { productId: product.id, quantity: 0, unit: dto.unit ?? 'unit' },
      });
      return tx.product.findUnique({
        where: { id: product.id },
        include: { category: true, inventory: true, sellingUnits: { orderBy: { price: 'asc' } } },
      });
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    if (dto.categoryId !== undefined) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }
    return this.prisma.product.update({
      where: { id },
      data: dto,
      include: { category: true, inventory: true, sellingUnits: { orderBy: { price: 'asc' } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const orderItemCount = await this.prisma.orderItem.count({
      where: { productId: id },
    });
    if (orderItemCount > 0) {
      throw new ConflictException(
        'Cannot delete a product that has order history; set it unavailable instead',
      );
    }
    await this.prisma.inventory.deleteMany({ where: { productId: id } });
    return this.prisma.product.delete({ where: { id } });
  }
}
