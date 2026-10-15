-- AlterEnum
ALTER TYPE "ExpenseSplitMode" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "archiveReason" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "inactivityDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "lastAccessedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "cycleDate" DATE,
ADD COLUMN     "recurringBillId" TEXT;

-- CreateTable
CREATE TABLE "RecurringBill" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "intervalEvery" INTEGER NOT NULL,
    "intervalUnit" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "defaultPlan" JSONB NOT NULL,
    "nextCycle" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringCycle" (
    "billId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "plan" JSONB NOT NULL,

    CONSTRAINT "RecurringCycle_pkey" PRIMARY KEY ("billId","index")
);

-- CreateIndex
CREATE INDEX "RecurringBill_groupId_idx" ON "RecurringBill"("groupId");

-- CreateIndex
CREATE INDEX "Group_archivedAt_lastActivityAt_idx" ON "Group"("archivedAt", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_recurringBillId_cycleDate_key" ON "Expense"("recurringBillId", "cycleDate");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringBillId_fkey" FOREIGN KEY ("recurringBillId") REFERENCES "RecurringBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringCycle" ADD CONSTRAINT "RecurringCycle_billId_fkey" FOREIGN KEY ("billId") REFERENCES "RecurringBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve pre-migration activity rather than restarting the inactivity clock.
UPDATE "Group" g SET "lastActivityAt" = GREATEST(
  g."updatedAt",
  COALESCE((SELECT MAX(e."updatedAt") FROM "Expense" e WHERE e."groupId" = g."id"), g."updatedAt"),
  COALESCE((SELECT MAX(GREATEST(p."sentAt", p."resolvedAt")) FROM "ExpensePayment" p JOIN "Expense" e ON e."id" = p."expenseId" WHERE e."groupId" = g."id"), g."updatedAt"),
  COALESCE((SELECT MAX(m."joinedAt") FROM "GroupMembership" m WHERE m."groupId" = g."id"), g."updatedAt")
);
ALTER TABLE "Group" ADD CONSTRAINT "Group_inactivityDays_check" CHECK ("inactivityDays" BETWEEN 1 AND 3650);
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_amount_check" CHECK ("amountCents" > 0 AND "amountCents" <= 100000000);
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_interval_check" CHECK ("intervalEvery" BETWEEN 1 AND 1000 AND "intervalUnit" IN ('days', 'weeks', 'months', 'years'));
