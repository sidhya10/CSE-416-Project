ALTER TABLE "Expense" ADD COLUMN "budgetCategory" TEXT NOT NULL DEFAULT 'other', ADD COLUMN "bankTransactionId" TEXT;
CREATE UNIQUE INDEX "Expense_bankTransactionId_key" ON "Expense"("bankTransactionId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
