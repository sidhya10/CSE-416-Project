-- CreateTable
CREATE TABLE "WhatIfScenario" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "limits" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatIfScenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatIfScenario_userId_updatedAt_idx" ON "WhatIfScenario"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "WhatIfScenario" ADD CONSTRAINT "WhatIfScenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
