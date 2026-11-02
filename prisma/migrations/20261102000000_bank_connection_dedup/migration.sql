-- Preserve Plaid's stable institution/account identifiers so reconnecting an existing bank
-- can replace the old Item instead of importing the same history as a second connection.
ALTER TABLE "BankConnection" ADD COLUMN "plaidInstitutionId" TEXT;

ALTER TABLE "BankAccount"
ADD COLUMN "persistentAccountId" TEXT,
ADD COLUMN "type" TEXT,
ADD COLUMN "subtype" TEXT;

CREATE INDEX "BankConnection_userId_plaidInstitutionId_idx"
ON "BankConnection"("userId", "plaidInstitutionId");

CREATE INDEX "BankAccount_persistentAccountId_idx"
ON "BankAccount"("persistentAccountId");
