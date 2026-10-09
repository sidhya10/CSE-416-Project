ALTER TABLE "User"
ADD COLUMN "username" TEXT,
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "googleSubject" TEXT,
ADD COLUMN "name" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "birthday" TIMESTAMP(3),
ADD COLUMN "bio" TEXT NOT NULL DEFAULT '',
ADD COLUMN "photoUrl" TEXT;

-- The previous schema never created production accounts; any development rows
-- receive deterministic values before the new required columns are enforced.
UPDATE "User"
SET "username" = 'user_' || substr("id", 1, 12),
    "name" = split_part("email", '@', 1)
WHERE "username" IS NULL OR "name" IS NULL;

ALTER TABLE "User"
ALTER COLUMN "username" SET NOT NULL,
ALTER COLUMN "name" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

CREATE TABLE "Friendship" (
  "id" TEXT NOT NULL,
  "userOneId" TEXT NOT NULL,
  "userTwoId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Friendship_userOneId_userTwoId_key" ON "Friendship"("userOneId", "userTwoId");
CREATE INDEX "Friendship_userOneId_idx" ON "Friendship"("userOneId");
CREATE INDEX "Friendship_userTwoId_idx" ON "Friendship"("userTwoId");

ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userOneId_fkey"
FOREIGN KEY ("userOneId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userTwoId_fkey"
FOREIGN KEY ("userTwoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
