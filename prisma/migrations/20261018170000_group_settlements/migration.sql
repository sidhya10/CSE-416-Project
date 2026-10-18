-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "settlementBatchId" TEXT;

-- AlterTable
ALTER TABLE "ExpensePayment" ADD COLUMN     "method" TEXT;

-- CreateTable
CREATE TABLE "SettlementBatch" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdById" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementShare" (
    "expenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "baselineConfirmedCents" INTEGER NOT NULL,

    CONSTRAINT "SettlementShare_pkey" PRIMARY KEY ("expenseId","userId")
);

-- CreateTable
CREATE TABLE "SettlementNotice" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "SettlementNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettlementBatch_groupId_createdAt_idx" ON "SettlementBatch"("groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementBatch_createdById_clientRequestId_key" ON "SettlementBatch"("createdById", "clientRequestId");

-- CreateIndex
CREATE INDEX "SettlementShare_batchId_idx" ON "SettlementShare"("batchId");

-- CreateIndex
CREATE INDEX "SettlementNotice_recipientId_readAt_idx" ON "SettlementNotice"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "SettlementNotice_batchId_actorId_recipientId_kind_createdAt_idx" ON "SettlementNotice"("batchId", "actorId", "recipientId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_settlementBatchId_idx" ON "Expense"("settlementBatchId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_settlementBatchId_fkey" FOREIGN KEY ("settlementBatchId") REFERENCES "SettlementBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementShare" ADD CONSTRAINT "SettlementShare_expenseId_userId_fkey" FOREIGN KEY ("expenseId", "userId") REFERENCES "ExpenseShare"("expenseId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementShare" ADD CONSTRAINT "SettlementShare_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SettlementBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementNotice" ADD CONSTRAINT "SettlementNotice_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SettlementBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementNotice" ADD CONSTRAINT "SettlementNotice_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
