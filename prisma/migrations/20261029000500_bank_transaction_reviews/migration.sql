ALTER TABLE "BankTransaction"
ADD COLUMN "categoryOverride" TEXT,
ADD COLUMN "excluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE TABLE "BankTransactionSplit" (
    "id" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "BankTransactionSplit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankTransactionSplit_bankTransactionId_position_key"
ON "BankTransactionSplit"("bankTransactionId", "position");

CREATE INDEX "BankTransactionSplit_bankTransactionId_idx"
ON "BankTransactionSplit"("bankTransactionId");

ALTER TABLE "BankTransactionSplit"
ADD CONSTRAINT "BankTransactionSplit_bankTransactionId_fkey"
FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
