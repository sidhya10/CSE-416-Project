CREATE TABLE "CategoryBudgetNotice" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CategoryBudgetNotice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CategoryBudgetNotice_recipientId_month_category_key" ON "CategoryBudgetNotice"("recipientId", "month", "category");
ALTER TABLE "CategoryBudgetNotice" ADD CONSTRAINT "CategoryBudgetNotice_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
