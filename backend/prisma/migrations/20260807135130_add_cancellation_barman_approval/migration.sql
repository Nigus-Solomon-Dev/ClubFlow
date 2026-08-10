-- AlterTable
ALTER TABLE "CancellationRequest" ADD COLUMN     "barmanDecidedAt" TIMESTAMP(3),
ADD COLUMN     "barmanId" TEXT;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_barmanId_fkey" FOREIGN KEY ("barmanId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
