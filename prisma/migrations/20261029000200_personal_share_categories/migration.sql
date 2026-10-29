ALTER TABLE "ExpenseShare" ADD COLUMN "budgetCategory" TEXT NOT NULL DEFAULT 'other';
UPDATE "ExpenseShare" s SET "budgetCategory" = e."budgetCategory" FROM "Expense" e WHERE s."expenseId" = e.id AND s."userId" = e."paidByUserId";
