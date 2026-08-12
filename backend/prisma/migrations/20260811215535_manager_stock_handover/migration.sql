-- CreateTable
CREATE TABLE "ManagerStockHandover" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "givenById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerStockHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerStockHandoverItem" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "givenQty" DECIMAL(12,4) NOT NULL,
    "countedQty" DECIMAL(12,4),
    "consumedQty" DECIMAL(12,4),
    "variance" DECIMAL(12,4),

    CONSTRAINT "ManagerStockHandoverItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerStockHandoverEvent" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "items" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerStockHandoverEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagerStockHandover_managerId_status_idx" ON "ManagerStockHandover"("managerId", "status");

-- CreateIndex
CREATE INDEX "ManagerStockHandover_status_idx" ON "ManagerStockHandover"("status");

-- CreateIndex
CREATE INDEX "ManagerStockHandoverItem_productId_idx" ON "ManagerStockHandoverItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerStockHandoverItem_handoverId_productId_key" ON "ManagerStockHandoverItem"("handoverId", "productId");

-- CreateIndex
CREATE INDEX "ManagerStockHandoverEvent_handoverId_idx" ON "ManagerStockHandoverEvent"("handoverId");

-- CreateIndex
CREATE INDEX "ManagerStockHandoverEvent_createdAt_idx" ON "ManagerStockHandoverEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "ManagerStockHandover" ADD CONSTRAINT "ManagerStockHandover_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerStockHandover" ADD CONSTRAINT "ManagerStockHandover_givenById_fkey" FOREIGN KEY ("givenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerStockHandover" ADD CONSTRAINT "ManagerStockHandover_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerStockHandover" ADD CONSTRAINT "ManagerStockHandover_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerStockHandoverItem" ADD CONSTRAINT "ManagerStockHandoverItem_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "ManagerStockHandover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerStockHandoverItem" ADD CONSTRAINT "ManagerStockHandoverItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerStockHandoverEvent" ADD CONSTRAINT "ManagerStockHandoverEvent_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "ManagerStockHandover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerStockHandoverEvent" ADD CONSTRAINT "ManagerStockHandoverEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
