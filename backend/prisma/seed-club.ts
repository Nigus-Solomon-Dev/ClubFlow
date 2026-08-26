 fit status
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

interface UnitSeed {
  name: string;
  price: number;
  consumption: number;
  default?: boolean;
}

interface ProductSeed {
  name: string;
  price: number;
  unit: string;
  category: string;
  units: UnitSeed[];
}

const soft = (name: string): ProductSeed => ({
  name,
  price: 150,
  unit: 'Piece',
  category: 'Soft Drinks',
  units: [{ name: 'Piece', price: 150, consumption: 1, default: true }],
});

const beer = (name: string): ProductSeed => ({
  name,
  price: 300,
  unit: 'Piece',
  category: 'Beer / Cold Drinks',
  units: [{ name: 'Piece', price: 300, consumption: 1, default: true }],
});

const PRODUCTS: ProductSeed[] = [
  // Soft Drinks
  soft('Sprite'),
  soft('Ambuha'),
  soft('Senq'),
  soft('Nigus'),
  soft('Sofi'),
  soft('Mirinda'),
  soft('Coca-Cola'),
  soft('Fanta'),
  soft('Pepsi'),
  soft('Tonic'),
  // Beer / Cold Drinks
  beer('Harrer'),
  beer('Castel'),
  beer('Dashen'),
  beer('St. George'),
  beer('Arada'),
  beer('Heineken'),
  beer('Ten Shubele'),
  beer('Habesha'),
  beer('Balager'),
  // Alcohol
  {
    name: 'Gold',
    price: 32000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [
      { name: 'Bottle', price: 32000, consumption: 1, default: true },
      { name: 'Half', price: 16000, consumption: 0.5 },
    ],
  },
  {
    name: 'Black',
    price: 18000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [
      { name: 'Bottle', price: 18000, consumption: 1, default: true },
      { name: 'Half', price: 9000, consumption: 0.5 },
      { name: 'Double', price: 1000, consumption: 0.05 },
    ],
  },
  {
    name: 'Double Black',
    price: 22000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [
      { name: 'Bottle', price: 22000, consumption: 1, default: true },
      { name: 'Half', price: 11000, consumption: 0.5 },
      { name: 'Double', price: 1200, consumption: 0.05 },
    ],
  },
  {
    name: 'Amarula',
    price: 8000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [{ name: 'Double', price: 500, consumption: 0.05, default: true }],
  },
  {
    name: "Gordon's",
    price: 14000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [
      { name: 'Bottle', price: 14000, consumption: 1, default: true },
      { name: 'Half', price: 7000, consumption: 0.5 },
      { name: 'Double', price: 800, consumption: 0.05 },
    ],
  },
  {
    name: 'John 18',
    price: 36000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [
      { name: 'Bottle', price: 36000, consumption: 1, default: true },
      { name: 'Half', price: 18000, consumption: 0.5 },
    ],
  },
  {
    name: 'The Origin',
    price: 12000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [{ name: 'Bottle', price: 12000, consumption: 1, default: true }],
  },
  {
    name: 'Chivas Regal',
    price: 20000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [{ name: 'Bottle', price: 20000, consumption: 1, default: true }],
  },
  {
    name: 'Chivas Regal 21',
    price: 32000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [{ name: 'Bottle', price: 32000, consumption: 1, default: true }],
  },
  {
    name: 'Stochi 750',
    price: 8000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [{ name: 'Bottle', price: 8000, consumption: 1, default: true }],
  },
  {
    name: 'Stochi 1L',
    price: 12000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [{ name: 'Bottle', price: 12000, consumption: 1, default: true }],
  },
  {
    name: 'Stochi 2L',
    price: 19000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [{ name: 'Bottle', price: 19000, consumption: 1, default: true }],
  },
  {
    name: "Jack Daniel's",
    price: 18000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [
      { name: 'Big', price: 18000, consumption: 1, default: true },
      { name: 'Small', price: 11000, consumption: 0.5 },
      { name: 'Shot', price: 450, consumption: 0.025 },
    ],
  },
  {
    name: 'Jackamaster',
    price: 16000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [
      { name: 'Bottle', price: 16000, consumption: 1, default: true },
      { name: 'Shot', price: 450, consumption: 0.025 },
    ],
  },
  {
    name: 'Winter 750ml',
    price: 4500,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [{ name: 'Bottle', price: 4500, consumption: 1, default: true }],
  },
  {
    name: 'Winter 1L',
    price: 8000,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [
      { name: 'Bottle', price: 8000, consumption: 1, default: true },
      { name: 'Half', price: 4000, consumption: 0.5 },
    ],
  },
  {
    name: 'Sambuca',
    price: 4800,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [{ name: 'Shot', price: 300, consumption: 0.0625, default: true }],
  },
  {
    name: 'Tequila',
    price: 4800,
    unit: 'Bottle',
    category: 'Alcohol',
    units: [
      { name: 'Bottle', price: 4800, consumption: 1, default: true },
      { name: 'Shot', price: 300, consumption: 0.0625 },
    ],
  },
  {
    name: 'Red Bull',
    price: 1500,
    unit: 'Piece',
    category: 'Alcohol',
    units: [{ name: 'Piece', price: 1500, consumption: 1, default: true }],
  },
];

const RENAMES: Record<string, string> = {
  'Johnnie Walker Black Label': 'Black',
  'Johnnie Walker Double Black': 'Double Black',
  'Johnnie Walker Gold Label': 'Gold',
  'Stolichnaya 750ml': 'Stochi 750',
  'Stolichnaya 1L': 'Stochi 1L',
  'Stolichnaya 2L': 'Stochi 2L',
  'Winter Palace 1L': 'Winter 1L',
  'Winter Palace 750ml': 'Winter 750ml',
  'Habesha Gescha': 'Habesha',
};

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
  });

  for (const seed of PRODUCTS) {
    const category = await prisma.category.upsert({
      where: { name: seed.category },
      update: {},
      create: { name: seed.category },
    });

    let product = await prisma.product.findFirst({ where: { name: seed.name } });
    if (!product) {
      const oldName = Object.keys(RENAMES).find((k) => RENAMES[k] === seed.name);
      if (oldName) {
        product = await prisma.product.findFirst({ where: { name: oldName } });
      }
    }

    if (product) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          name: seed.name,
          categoryId: category.id,
          price: seed.price,
          stockUnit: seed.unit,
        },
      });
    } else {
      product = await prisma.product.create({
        data: {
          name: seed.name,
          categoryId: category.id,
          price: seed.price,
          stockUnit: seed.unit,
        },
      });
    }

    await syncUnits(prisma, product.id, seed.units);
  }

  console.log(`Seeded ${PRODUCTS.length} products.`);
  await prisma.$disconnect();
}

async function syncUnits(
  prisma: PrismaClient,
  productId: string,
  units: UnitSeed[],
) {
  const allowedNames = new Set(units.map((u) => u.name));
  const existing = await prisma.sellingUnit.findMany({
    where: { productId },
    select: { id: true, name: true },
  });

  for (const u of units) {
    await prisma.sellingUnit.upsert({
      where: { productId_name: { productId, name: u.name } },
      update: { price: u.price, stockConsumption: u.consumption },
      create: {
        productId,
        name: u.name,
        price: u.price,
        stockConsumption: u.consumption,
      },
    });
  }

  const drop = existing
    .filter((e) => !allowedNames.has(e.name))
    .map((e) => e.id);
  if (drop.length > 0) {
    await prisma.sellingUnit.deleteMany({ where: { id: { in: drop } } });
  }

  await prisma.sellingUnit.updateMany({
    where: { productId },
    data: { isDefault: false },
  });
  const def = units.find((u) => u.default);
  if (def) {
    await prisma.sellingUnit.updateMany({
      where: { productId, name: def.name },
      data: { isDefault: true },
    });
  }
}

void main();
