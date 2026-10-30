-- CreateTable
CREATE TABLE "WeeklyEmailSend" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sendDate" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyEmailSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyEmailSend_userId_sendDate_key" ON "WeeklyEmailSend"("userId", "sendDate");

-- CreateIndex
CREATE INDEX "WeeklyEmailSend_sendDate_status_idx" ON "WeeklyEmailSend"("sendDate", "status");

-- AddForeignKey
ALTER TABLE "WeeklyEmailSend" ADD CONSTRAINT "WeeklyEmailSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
