-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "sellingName" TEXT,
ADD COLUMN     "stockConsumption" DECIMAL(12,4) NOT NULL DEFAULT 1;
