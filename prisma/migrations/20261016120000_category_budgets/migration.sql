-- CreateTable
CREATE TABLE "CategoryLimit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "limitCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupBudgetPlan" (
    "groupId" TEXT NOT NULL,
    "plannedCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupBudgetPlan_pkey" PRIMARY KEY ("groupId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryLimit_userId_category_key" ON "CategoryLimit"("userId", "category");

-- AddForeignKey
ALTER TABLE "CategoryLimit" ADD CONSTRAINT "CategoryLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBudgetPlan" ADD CONSTRAINT "GroupBudgetPlan_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Limits and plans are non-negative amounts in cents.
ALTER TABLE "CategoryLimit" ADD CONSTRAINT "CategoryLimit_limitCents_nonnegative" CHECK ("limitCents" >= 0);
ALTER TABLE "GroupBudgetPlan" ADD CONSTRAINT "GroupBudgetPlan_plannedCents_nonnegative" CHECK ("plannedCents" >= 0);
