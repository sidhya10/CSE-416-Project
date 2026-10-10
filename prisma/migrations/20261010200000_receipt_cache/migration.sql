CREATE TABLE "ReceiptScan" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceiptScan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReceiptScan_userId_hash_key" ON "ReceiptScan"("userId", "hash");
CREATE INDEX "ReceiptScan_userId_createdAt_idx" ON "ReceiptScan"("userId", "createdAt");
ALTER TABLE "ReceiptScan" ADD CONSTRAINT "ReceiptScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "ReceiptUsage" (
  "id" TEXT NOT NULL, "month" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "busyUntil" TIMESTAMP(3), "activeScanId" TEXT,
  CONSTRAINT "ReceiptUsage_pkey" PRIMARY KEY ("id")
);
