/*
  Warnings:

  - You are about to drop the column `countedAt` on the `StockHandover` table. All the data in the column will be lost.
  - You are about to drop the column `countedById` on the `StockHandover` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `StockHandover` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "StockHandover" DROP CONSTRAINT "StockHandover_countedById_fkey";

-- DropForeignKey
ALTER TABLE "StockHandover" DROP CONSTRAINT "StockHandover_managerId_fkey";

-- DropIndex
DROP INDEX "StockHandover_date_barmanId_key";

-- DropIndex
DROP INDEX "StockHandover_date_idx";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "completedById" TEXT;

-- AlterTable
ALTER TABLE "StockHandover" DROP COLUMN "countedAt",
DROP COLUMN "countedById",
DROP COLUMN "date",
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "managerId" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "StockHandoverItem" ADD COLUMN     "variance" DECIMAL(12,4);

-- CreateTable
CREATE TABLE "StockHandoverEvent" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "items" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockHandoverEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockHandoverEvent_handoverId_idx" ON "StockHandoverEvent"("handoverId");

-- CreateIndex
CREATE INDEX "StockHandoverEvent_createdAt_idx" ON "StockHandoverEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Order_completedById_idx" ON "Order"("completedById");

-- CreateIndex
CREATE INDEX "StockHandover_barmanId_status_idx" ON "StockHandover"("barmanId", "status");

-- CreateIndex
CREATE INDEX "StockHandover_status_idx" ON "StockHandover"("status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHandover" ADD CONSTRAINT "StockHandover_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHandover" ADD CONSTRAINT "StockHandover_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHandoverEvent" ADD CONSTRAINT "StockHandoverEvent_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "StockHandover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHandoverEvent" ADD CONSTRAINT "StockHandoverEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
