-- Automatically categorized transactions no longer require review, and credit-card payments
-- can be omitted from the user-facing ledger without conflating that rule with manual exclusion.
ALTER TABLE "BankTransaction"
ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "autoExcludedReason" TEXT;

CREATE TABLE "PersonalSettlementTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "method" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestKey" TEXT NOT NULL,
  "bankTransactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonalSettlementTransaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ExpensePayment" ADD COLUMN "personalSettlementTransactionId" TEXT;

CREATE UNIQUE INDEX "PersonalSettlementTransaction_bankTransactionId_key" ON "PersonalSettlementTransaction"("bankTransactionId");
CREATE UNIQUE INDEX "PersonalSettlementTransaction_userId_requestKey_key" ON "PersonalSettlementTransaction"("userId", "requestKey");
CREATE INDEX "PersonalSettlementTransaction_userId_sentAt_idx" ON "PersonalSettlementTransaction"("userId", "sentAt");
CREATE INDEX "PersonalSettlementTransaction_groupId_idx" ON "PersonalSettlementTransaction"("groupId");
CREATE INDEX "ExpensePayment_personalSettlementTransactionId_idx" ON "ExpensePayment"("personalSettlementTransactionId");

ALTER TABLE "PersonalSettlementTransaction" ADD CONSTRAINT "PersonalSettlementTransaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonalSettlementTransaction" ADD CONSTRAINT "PersonalSettlementTransaction_recipientUserId_fkey"
FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalSettlementTransaction" ADD CONSTRAINT "PersonalSettlementTransaction_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonalSettlementTransaction" ADD CONSTRAINT "PersonalSettlementTransaction_bankTransactionId_fkey"
FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_personalSettlementTransactionId_fkey"
FOREIGN KEY ("personalSettlementTransactionId") REFERENCES "PersonalSettlementTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing imported transactions using the same deterministic rules as future syncs.
UPDATE "BankTransaction"
SET "autoExcludedReason" = 'CREDIT_CARD_PAYMENT', "excluded" = true, "needsReview" = false
WHERE COALESCE("merchant", '') || ' ' || "name" ~* '\m(credit card payment|card payment|payment thank you|autopay payment)\M';

UPDATE "BankTransaction"
SET "needsReview" = true, "reviewedAt" = NULL
WHERE "amountCents" > 0
  AND "autoExcludedReason" IS NULL
  AND "categoryOverride" IS NULL
  AND ("category" IS NULL OR "category" NOT IN (
    'INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS',
    'BANK_FEES', 'ENTERTAINMENT', 'FOOD_AND_DRINK', 'GENERAL_MERCHANDISE',
    'GENERAL_SERVICES', 'GOVERNMENT_AND_NON_PROFIT', 'HOME_IMPROVEMENT',
    'MEDICAL', 'PERSONAL_CARE', 'RENT_AND_UTILITIES', 'TRANSPORTATION', 'TRAVEL'
  ));
