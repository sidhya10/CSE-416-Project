CREATE TABLE "ReceiptUpload" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tokenHash" TEXT NOT NULL,
  "ownerId" TEXT,
  "clientKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ReceiptUpload_expiresAt_idx" ON "ReceiptUpload"("expiresAt");
CREATE INDEX "ReceiptUpload_clientKey_createdAt_idx" ON "ReceiptUpload"("clientKey", "createdAt");
CREATE TABLE "ReceiptUploadChunk" (
  "uploadId" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  PRIMARY KEY ("uploadId", "index"),
  FOREIGN KEY ("uploadId") REFERENCES "ReceiptUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
