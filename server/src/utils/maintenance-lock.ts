import type { Prisma } from '@prisma/client';
// Serialize schedule/archive transitions with generation, including across API instances.
export async function lockMaintenance(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(416, 20261015)`;
}
