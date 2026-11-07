-- CreateTable
CREATE TABLE "GroupNotice" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GroupNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupNotice_recipientId_readAt_idx" ON "GroupNotice"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "GroupNotice_groupId_idx" ON "GroupNotice"("groupId");

-- AddForeignKey
ALTER TABLE "GroupNotice" ADD CONSTRAINT "GroupNotice_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupNotice" ADD CONSTRAINT "GroupNotice_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
