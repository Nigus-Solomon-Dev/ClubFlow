-- AlterTable
ALTER TABLE "StockHandover" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedById" TEXT;

-- AddForeignKey
ALTER TABLE "StockHandover" ADD CONSTRAINT "StockHandover_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
