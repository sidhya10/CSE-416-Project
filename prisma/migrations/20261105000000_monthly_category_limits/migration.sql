ALTER TABLE "CategoryLimit" ADD COLUMN "month" TEXT NOT NULL DEFAULT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), 'YYYY-MM');
DROP INDEX "CategoryLimit_userId_category_key";
CREATE UNIQUE INDEX "CategoryLimit_userId_month_category_key" ON "CategoryLimit"("userId", "month", "category");
