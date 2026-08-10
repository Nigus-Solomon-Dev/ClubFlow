-- AlterTable
ALTER TABLE "Inventory" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,4);

-- AlterTable
ALTER TABLE "InventoryMovement" ALTER COLUMN "change" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "quantityAfter" SET DATA TYPE DECIMAL(12,4);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "sellingUnitId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "piecesPerCase" INTEGER DEFAULT 24,
ADD COLUMN     "stockUnit" TEXT NOT NULL DEFAULT 'Piece';

-- CreateTable
CREATE TABLE "SellingUnit" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "stockConsumption" DECIMAL(12,4) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellingUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockHandover" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "barmanId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countedAt" TIMESTAMP(3),
    "countedById" TEXT,

    CONSTRAINT "StockHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockHandoverItem" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "givenQty" DECIMAL(12,4) NOT NULL,
    "countedQty" DECIMAL(12,4),
    "consumedQty" DECIMAL(12,4),

    CONSTRAINT "StockHandoverItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SellingUnit_productId_idx" ON "SellingUnit"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SellingUnit_productId_name_key" ON "SellingUnit"("productId", "name");

-- CreateIndex
CREATE INDEX "StockHandover_date_idx" ON "StockHandover"("date");

-- CreateIndex
CREATE UNIQUE INDEX "StockHandover_date_barmanId_key" ON "StockHandover"("date", "barmanId");

-- CreateIndex
CREATE INDEX "StockHandoverItem_productId_idx" ON "StockHandoverItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockHandoverItem_handoverId_productId_key" ON "StockHandoverItem"("handoverId", "productId");

-- AddForeignKey
ALTER TABLE "SellingUnit" ADD CONSTRAINT "SellingUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sellingUnitId_fkey" FOREIGN KEY ("sellingUnitId") REFERENCES "SellingUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHandover" ADD CONSTRAINT "StockHandover_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHandover" ADD CONSTRAINT "StockHandover_barmanId_fkey" FOREIGN KEY ("barmanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHandover" ADD CONSTRAINT "StockHandover_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHandoverItem" ADD CONSTRAINT "StockHandoverItem_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "StockHandover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHandoverItem" ADD CONSTRAINT "StockHandoverItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
