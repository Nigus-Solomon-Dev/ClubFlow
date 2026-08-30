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

  async findAll() {
    const products = await this.prisma.product.findMany({
      include: {
        category: true,
        inventory: true,
        sellingUnits: { orderBy: { price: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    for (const p of products) {
      const isAlcohol = p.category?.name === 'Alcohol' || p.sellingUnits?.some((u) => ['bottle', 'half', 'double', 'shot'].includes(u.name.toLowerCase()));
      if (isAlcohol && p.stockUnit !== 'Bottle') {
        p.stockUnit = 'Bottle';
        this.prisma.product.update({
          where: { id: p.id },
          data: { stockUnit: 'Bottle' },
        }).catch(() => {});
        this.prisma.inventory.updateMany({
          where: { productId: p.id, unit: 'Piece' },
          data: { unit: 'Bottle' },
        }).catch(() => {});
      }
    }
    return products;
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
    const isAlcohol = product.category?.name === 'Alcohol' || product.sellingUnits?.some((u) => ['bottle', 'half', 'double', 'shot'].includes(u.name.toLowerCase()));
    if (isAlcohol && product.stockUnit !== 'Bottle') {
      product.stockUnit = 'Bottle';
      this.prisma.product.update({
        where: { id: product.id },
        data: { stockUnit: 'Bottle' },
      }).catch(() => {});
      this.prisma.inventory.updateMany({
        where: { productId: product.id, unit: 'Piece' },
        data: { unit: 'Bottle' },
      }).catch(() => {});
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
      const isAlcohol = category.name === 'Alcohol';
      const stockUnit = dto.unit ?? (isAlcohol ? 'Bottle' : 'Piece');
      const product = await tx.product.create({
        data: {
          name: dto.name,
          categoryId: dto.categoryId,
          price: dto.price,
          isAvailable: dto.isAvailable ?? true,
          piecesPerCase: dto.piecesPerCase ?? 24,
          stockUnit: stockUnit,
        },
      });
      await tx.inventory.create({
        data: { productId: product.id, quantity: dto.initialPieces ?? 0, unit: stockUnit },
      });
      if (dto.sellingUnits?.length) {
        await tx.sellingUnit.createMany({
          data: dto.sellingUnits.map((su) => ({
            productId: product.id,
            name: su.name,
            price: su.price,
            stockConsumption: su.stockConsumption,
            isDefault: su.isDefault,
          })),
        });
      }
      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          category: true,
          inventory: true,
          sellingUnits: { orderBy: { price: 'asc' } },
        },
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
    return this.prisma.$transaction(async (tx) => {
      if (dto.sellingUnits) {
        await tx.sellingUnit.deleteMany({ where: { productId: id } });
        await tx.sellingUnit.createMany({
          data: dto.sellingUnits.map((su) => ({
            productId: id,
            name: su.name,
            price: su.price,
            stockConsumption: su.stockConsumption,
            isDefault: su.isDefault,
          })),
        });
      }
      const { sellingUnits, ...productData } = dto;
      return tx.product.update({
        where: { id },
        data: productData,
        include: {
          category: true,
          inventory: true,
          sellingUnits: { orderBy: { price: 'asc' } },
        },
      });
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
